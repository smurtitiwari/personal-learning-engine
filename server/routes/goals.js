import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';
import { analyzeGoalLimited } from '../services/limited-ai.js';

const router = Router();

async function buildGoalMetrics(goalId, userId) {
  // Get topics linked to the goal
  const { data: topicRows } = await supabase
    .from('goal_topics')
    .select('topics(name)')
    .eq('goal_id', goalId);
  const areas = (topicRows ?? []).map(r => r.topics?.name).filter(Boolean);

  if (!areas.length) {
    return { areas, resource_count: 0, completed_count: 0, learning_seconds: 0, topic_coverage: {}, knowledge_gaps: [], focus_area: null };
  }

  // Get user's resources in these topic areas
  const { data: topicRowIds } = await supabase
    .from('topics').select('id, name').in('name', areas);
  const topicIds = (topicRowIds ?? []).map(t => t.id);

  const { data: rtRows } = await supabase
    .from('resource_topics')
    .select('resource_id, topics(name), resources!inner(id, completed_at, user_id, deleted_at, processing_status)')
    .in('topic_id', topicIds)
    .eq('resources.user_id', userId)
    .is('resources.deleted_at', null)
    .eq('resources.processing_status', 'ready');

  const resourceIds = [...new Set((rtRows ?? []).map(r => r.resource_id))];
  const completedIds = new Set((rtRows ?? []).filter(r => r.resources?.completed_at).map(r => r.resource_id));

  // Build topic_coverage map
  const topicCoverage = {};
  for (const row of rtRows ?? []) {
    const name = row.topics?.name;
    if (name) topicCoverage[name] = (topicCoverage[name] ?? 0) + 1;
  }

  // Get learning time for these resources
  const { data: actRows } = await supabase
    .from('activity_events')
    .select('duration_seconds')
    .eq('user_id', userId)
    .in('resource_id', resourceIds.slice(0, 50));
  const learning_seconds = (actRows ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);

  // Knowledge gaps = areas with zero coverage
  const knowledge_gaps = areas.filter(a => !topicCoverage[a]);
  const focus_area = knowledge_gaps[0] ?? areas.sort((a, b) => (topicCoverage[a] ?? 0) - (topicCoverage[b] ?? 0))[0] ?? null;

  return {
    areas,
    resource_count: resourceIds.length,
    completed_count: completedIds.size,
    learning_seconds,
    topic_coverage: topicCoverage,
    knowledge_gaps,
    focus_area,
  };
}

function mapGoal(goal, metrics = {}) {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description ?? null,
    reason: goal.ai_rationale ?? null,
    status: goal.status,
    areas: metrics.areas ?? [],
    resource_count: metrics.resource_count ?? 0,
    completed_count: metrics.completed_count ?? 0,
    learning_seconds: metrics.learning_seconds ?? 0,
    topic_coverage: metrics.topic_coverage ?? {},
    knowledge_gaps: metrics.knowledge_gaps ?? [],
    focus_area: metrics.focus_area ?? null,
    created_at: goal.created_at,
    updated_at: goal.updated_at,
  };
}

// GET /api/goals
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw createError(error.message, 500);

    const mapped = await Promise.all((goals ?? []).map(async g => {
      const metrics = await buildGoalMetrics(g.id, userId);
      return mapGoal(g, metrics);
    }));

    res.json({ data: mapped });
  } catch (err) { next(err); }
});

// POST /api/goals
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { title, reason, areas } = req.body;
    if (!title?.trim()) throw createError('title is required', 400);

    // Use AI goal analysis at most once per month. Manual areas never require AI.
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAiGoal } = await supabase.from('goals').select('id')
      .eq('user_id', userId).not('ai_rationale', 'is', null).gte('created_at', monthAgo).limit(1).maybeSingle();
    let aiAnalysis = { topics: [], rationale: '' };
    if (!recentAiGoal) {
      try { aiAnalysis = await analyzeGoalLimited(title.trim()); }
      catch (err) { console.warn('[goals] limited AI analysis failed:', err.message); }
    }

      const { data: goal, error } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          title: title.trim(),
          description: reason?.trim() || null,
          ai_rationale: aiAnalysis.rationale || null,
          status: 'active',
        })
        .select().single();
      if (error || !goal) throw createError(error?.message ?? 'Failed to create goal', 500);

      // If areas provided manually, upsert topics
      const manualAreas = areas ?? (typeof req.body.areas === 'string' ? JSON.parse(req.body.areas) : []);
      const topicNames = manualAreas.length > 0 ? manualAreas : aiAnalysis.topics;
      if (topicNames.length > 0) {
        const { data: topics } = await supabase
          .from('topics')
          .upsert(topicNames.map(n => ({ name: n })), { onConflict: 'name' })
          .select('id, name');
        if (topics?.length) {
          await supabase.from('goal_topics').upsert(
            topics.map(t => ({ goal_id: goal.id, topic_id: t.id })),
            { onConflict: 'goal_id,topic_id', ignoreDuplicates: true }
          );
        }
      }
      const metrics = await buildGoalMetrics(goal.id, userId);
      res.status(201).json({ data: mapGoal(goal, metrics) });
  } catch (err) { next(err); }
});

// GET /api/goals/:id
router.get('/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data: goal, error } = await supabase
      .from('goals')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (error || !goal) throw createError('Goal not found', 404);
    const metrics = await buildGoalMetrics(goal.id, userId);
    res.json({ data: mapGoal(goal, metrics) });
  } catch (err) { next(err); }
});

// PATCH /api/goals/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { title, status } = req.body;
    const updates = {};
    if (title) updates.title = title.trim();
    if (status) updates.status = status;

    const { data, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select().single();

    if (error || !data) throw createError('Goal not found', 404);
    const metrics = await buildGoalMetrics(data.id, userId);
    res.json({ data: mapGoal(data, metrics) });
  } catch (err) { next(err); }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data, error } = await supabase
      .from('goals')
      .update({ status: 'archived' })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select().single();

    if (error || !data) throw createError('Goal not found', 404);
    res.json({ data: { id: data.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
