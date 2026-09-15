import { Router } from 'express';
import { get, run } from '../db/db.js';
import { createError } from '../middleware/error.js';

const router = Router();
const USER_ID = 'user_default';
const JSON_FIELDS = [
  'interests', 'preferred_content_types', 'topic_strength',
  'knowledge_gaps', 'emerging_interests', 'learning_frequency',
];

// GET /api/profile
router.get('/', (_req, res, next) => {
  try {
    const profile = get(
      'SELECT * FROM profiles WHERE user_id = ?',
      [USER_ID],
      JSON_FIELDS
    );
    if (!profile) return next(createError(404, 'Profile not found'));
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/profile
router.patch('/', (req, res, next) => {
  try {
    const allowed = [
      'about', 'interests', 'preferred_content_types',
      'topic_strength', 'knowledge_gaps', 'emerging_interests',
      'learning_frequency',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = typeof req.body[key] === 'object'
          ? JSON.stringify(req.body[key])
          : req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ data: get('SELECT * FROM profiles WHERE user_id = ?', [USER_ID], JSON_FIELDS) });
    }

    updates.updated_at = new Date().toISOString();
    const cols = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    run(`UPDATE profiles SET ${cols} WHERE user_id = ?`, [...Object.values(updates), USER_ID]);

    const profile = get('SELECT * FROM profiles WHERE user_id = ?', [USER_ID], JSON_FIELDS);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

export default router;
