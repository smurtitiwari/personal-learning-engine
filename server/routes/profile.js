import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

async function ensureProfile(userId) {
  const { data } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  if (data) return data;
  const { data: created } = await supabase.from('user_profiles').insert({ user_id: userId }).select().single();
  return created;
}

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const profile = await ensureProfile(userId);

    // Enrich with live topic analytics
    const { data: topicData } = await supabase.rpc('get_topic_analytics', { p_user_id: userId });
    const topics = topicData ?? [];
    const topic_strength = Object.fromEntries(
      topics.slice(0, 10).map(t => [t.topic, Math.min(100, Math.round((Number(t.count) / 10) * 100))])
    );
    const knowledge_gaps = (profile.knowledge_gaps ?? []);

    res.json({
      data: {
        user_id: userId,
        about: profile.about ?? '',
        interests: profile.interests ?? [],
        preferred_content_types: profile.preferred_content_types ?? {},
        topic_strength,
        knowledge_gaps,
        emerging_interests: profile.emerging_interests ?? [],
        learning_frequency: profile.learning_frequency ?? { daily_avg_mins: 0, active_days_30d: 0 },
        updated_at: profile.updated_at,
      },
    });
  } catch (err) { next(err); }
});

// PATCH /api/profile
router.patch('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    await ensureProfile(userId);
    const { about, interests, preferred_content_types } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (about !== undefined) updates.about = about;
    if (interests !== undefined) updates.interests = interests;
    if (preferred_content_types !== undefined) updates.preferred_content_types = preferred_content_types;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select().single();

    if (error) throw createError(error.message, 500);
    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
