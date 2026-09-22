import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';
import { generateWeeklyRecommendations } from '../services/limited-ai.js';

const router = Router();

function mapRec(r) {
  return {
    id: r.id,
    title: r.title,
    url: r.url ?? null,
    source_type: r.source_type ?? 'article',
    creator_name: r.creator_name ?? null,
    thumbnail: r.thumbnail_url ?? null,
    description: r.reason_detail ?? r.reason ?? r.description ?? '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    score: Number(r.score ?? 0),
    reason: r.reason ?? '',
    reason_detail: r.reason_detail ?? '',
    score_breakdown: r.score_breakdown ?? {},
    generated_at: r.generated_at ?? r.created_at,
  };
}

// GET /api/recommendations
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { goal_id } = req.query;

    let query = supabase
      .from('recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('score', { ascending: false })
      .limit(12);

    if (goal_id) {
      query = query.eq('goal_id', goal_id);
    } else {
      query = query.is('goal_id', null);
    }

    const { data: recs, error } = await query;
    if (error) throw createError(error.message, 500);

    const newest = recs?.[0]?.generated_at ? new Date(recs[0].generated_at).getTime() : 0;
    const weeklyRefreshDue = Date.now() - newest >= 7 * 24 * 60 * 60 * 1000;

    // Generate at most once per week; all page loads reuse the stored set.
    if (!recs?.length || weeklyRefreshDue) {
      try {
        await generateWeeklyRecommendations(userId, goal_id || null);
      } catch (genErr) {
        console.warn('[recommendations] auto-generate failed:', genErr.message);
        return res.json({ data: (recs ?? []).map(mapRec) });
      }
      // Fetch newly generated
      const { data: fresh } = await query;
      return res.json({ data: (fresh ?? []).map(mapRec) });
    }

    res.json({ data: recs.map(mapRec) });
  } catch (err) { next(err); }
});

// POST /api/recommendations/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { goal_id } = req.body ?? {};
    let existingQuery = supabase.from('recommendations').select('*')
      .eq('user_id', userId).eq('status', 'active')
      .order('generated_at', { ascending: false }).limit(12);
    existingQuery = goal_id ? existingQuery.eq('goal_id', goal_id) : existingQuery.is('goal_id', null);
    const { data: existing } = await existingQuery;
    const newest = existing?.[0]?.generated_at ? new Date(existing[0].generated_at).getTime() : 0;
    if (existing?.length && Date.now() - newest < 7 * 24 * 60 * 60 * 1000) {
      return res.json({ data: existing.map(mapRec), next_refresh_at: new Date(newest + 7 * 24 * 60 * 60 * 1000).toISOString() });
    }
    try {
      await generateWeeklyRecommendations(userId, goal_id || null);
    } catch (fnErr) {
      throw createError(`Refresh failed: ${fnErr.message}`, 500);
    }

    const { data: recs } = await supabase
      .from('recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('score', { ascending: false })
      .limit(12);

    res.json({ data: (recs ?? []).map(mapRec) });
  } catch (err) { next(err); }
});

// POST /api/recommendations/:id/dismiss
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data, error } = await supabase
      .from('recommendations')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select().single();

    if (error || !data) throw createError('Recommendation not found', 404);
    res.json({ data: { id: data.id, dismissed: true } });
  } catch (err) { next(err); }
});

export default router;
