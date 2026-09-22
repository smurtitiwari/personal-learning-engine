import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

async function ensurePrefs(userId) {
  const { data } = await supabase.from('user_preferences').select('*').eq('user_id', userId).single();
  if (data) return data;
  const { data: created, error } = await supabase.from('user_preferences').insert({ user_id: userId }).select().single();
  if (error || !created) throw createError(`Failed to create preferences: ${error?.message ?? 'unknown'}`, 500);
  return created;
}

// GET /api/preferences
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const prefs = await ensurePrefs(userId);
    res.json({
      data: {
        user_id: userId,
        appearance: prefs.appearance,
        ai_recommendations_enabled: prefs.ai_recommendations_enabled ? 1 : 0,
        weekly_target_minutes: prefs.weekly_target_minutes,
        updated_at: prefs.updated_at,
      },
    });
  } catch (err) { next(err); }
});

// PATCH /api/preferences
router.patch('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    await ensurePrefs(userId);
    const { appearance, weekly_target_minutes, ai_recommendations_enabled } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (appearance) updates.appearance = appearance;
    if (weekly_target_minutes != null) updates.weekly_target_minutes = Number(weekly_target_minutes);
    if (ai_recommendations_enabled != null) updates.ai_recommendations_enabled = Boolean(Number(ai_recommendations_enabled));

    const { data, error } = await supabase
      .from('user_preferences')
      .update(updates)
      .eq('user_id', userId)
      .select().single();

    if (error) throw createError(error.message, 500);
    res.json({
      data: {
        ...data,
        ai_recommendations_enabled: data.ai_recommendations_enabled ? 1 : 0,
      },
    });
  } catch (err) { next(err); }
});

export default router;
