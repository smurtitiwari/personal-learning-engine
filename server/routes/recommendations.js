import { Router } from 'express';
import { supabase, getUserId, invokeFunction } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

function mapRec(r) {
  return {
    id: r.id,
    title: r.title,
    url: r.url ?? null,
    source_type: r.source_type ?? 'article',
    creator_name: r.creator_name ?? null,
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

    // Auto-generate if empty
    if (!recs?.length) {
      const authHeader = req.headers.authorization;
      const url = goal_id ? `?goal_id=${goal_id}` : '';
      try {
        await invokeFunction(`generate-recommendations${url}`, {}, authHeader?.slice(7));
      } catch (genErr) {
        console.warn('[recommendations] auto-generate failed:', genErr.message);
        return res.json({ data: [] });
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
    const authHeader = req.headers.authorization;
    const urlSuffix = goal_id ? `?goal_id=${goal_id}` : '';

    try {
      await invokeFunction(`generate-recommendations${urlSuffix}`, {}, authHeader?.slice(7));
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
