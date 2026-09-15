import { Router } from 'express';
import { get, run } from '../db/db.js';
import { createError } from '../middleware/error.js';

const router = Router();
const USER_ID = 'user_default';

// GET /api/preferences
router.get('/', (_req, res, next) => {
  try {
    const prefs = get('SELECT * FROM user_preferences WHERE user_id = ?', [USER_ID]);
    if (!prefs) return next(createError(404, 'Preferences not found'));
    res.json({ data: prefs });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/preferences
router.patch('/', (req, res, next) => {
  try {
    const allowed = ['appearance', 'ai_recommendations_enabled', 'weekly_target_minutes'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ data: get('SELECT * FROM user_preferences WHERE user_id = ?', [USER_ID]) });
    }

    updates.updated_at = new Date().toISOString();
    const cols = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    run(`UPDATE user_preferences SET ${cols} WHERE user_id = ?`, [...Object.values(updates), USER_ID]);

    const prefs = get('SELECT * FROM user_preferences WHERE user_id = ?', [USER_ID]);
    res.json({ data: prefs });
  } catch (err) {
    next(err);
  }
});

export default router;
