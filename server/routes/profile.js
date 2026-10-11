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

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item, 60)).filter(Boolean))].slice(0, limit);
}

function profileMemory(profile) {
  const preferences = profile.preferred_content_types && typeof profile.preferred_content_types === 'object'
    ? profile.preferred_content_types
    : {};
  return {
    industry: cleanText(preferences.industry, 140),
    learning_intent: cleanText(preferences.learning_intent, 360),
    preferred_apps: cleanList(preferences.preferred_apps),
  };
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
        ...profileMemory(profile),
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
    const { about, interests, preferred_content_types, industry, learning_intent, preferred_apps } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (about !== undefined) updates.about = about;
    if (interests !== undefined) updates.interests = cleanList(interests);
    const previous = await ensureProfile(userId);
    const existingPrefs = previous.preferred_content_types && typeof previous.preferred_content_types === 'object'
      ? previous.preferred_content_types : {};
    if (preferred_content_types !== undefined || industry !== undefined || learning_intent !== undefined || preferred_apps !== undefined) {
      updates.preferred_content_types = {
        ...existingPrefs,
        ...(preferred_content_types && typeof preferred_content_types === 'object' ? preferred_content_types : {}),
        ...(industry !== undefined ? { industry: cleanText(industry, 140) } : {}),
        ...(learning_intent !== undefined ? { learning_intent: cleanText(learning_intent, 360) } : {}),
        ...(preferred_apps !== undefined ? { preferred_apps: cleanList(preferred_apps) } : {}),
      };
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select().single();

    if (error) throw createError(error.message, 500);
    res.json({ data: { ...data, ...profileMemory(data) } });
  } catch (err) { next(err); }
});

export default router;
