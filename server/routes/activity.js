import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

// GET /api/activity
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { limit = 20, resource_id } = req.query;
    let query = supabase
      .from('activity_events')
      .select('id, resource_id, event_type, duration_seconds, progress_percentage, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (resource_id) query = query.eq('resource_id', resource_id);
    const { data, error } = await query;
    if (error) throw createError(error.message, 500);
    res.json({ data: (data ?? []).map(e => ({ ...e, timestamp: e.created_at })) });
  } catch (err) { next(err); }
});

// POST /api/activity
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { resource_id, event_type, duration_seconds, progress_percentage, metadata } = req.body;
    if (!event_type) throw createError('event_type is required', 400);

    const { data, error } = await supabase
      .from('activity_events')
      .insert({
        user_id: userId,
        resource_id: resource_id ?? null,
        event_type,
        duration_seconds: duration_seconds ?? 0,
        progress_percentage: progress_percentage ?? 0,
        metadata: metadata ?? {},
      })
      .select().single();

    if (error) throw createError(error.message, 500);
    res.status(201).json({ data: { id: data.id, event_type: data.event_type, timestamp: data.created_at } });
  } catch (err) { next(err); }
});

export default router;
