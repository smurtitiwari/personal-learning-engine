import { Router } from 'express';
import { all, run, newId } from '../db/db.js';
import { createError } from '../middleware/error.js';

const router = Router();
const USER_ID = 'user_default';

const VALID_EVENTS = ['added', 'opened', 'started', 'progressed', 'completed', 'note_added'];

// GET /api/activity
router.get('/', (req, res, next) => {
  try {
    const { resource_id, event_type, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT la.*, r.title as resource_title, r.source_type
      FROM learning_activities la
      LEFT JOIN resources r ON r.id = la.resource_id
      WHERE la.user_id = ?
    `;
    const params = [USER_ID];

    if (resource_id) { sql += ' AND la.resource_id = ?'; params.push(resource_id); }
    if (event_type)  { sql += ' AND la.event_type = ?';  params.push(event_type); }

    sql += ' ORDER BY la.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const rows = all(sql, params, ['metadata']);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/activity
router.post('/', (req, res, next) => {
  try {
    const {
      resource_id,
      event_type,
      duration_seconds   = 0,
      progress_percentage = 0,
      metadata            = {},
    } = req.body || {};

    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return next(createError(400, `event_type must be one of: ${VALID_EVENTS.join(', ')}`));
    }

    const id = newId();
    run(
      `INSERT INTO learning_activities
         (id, resource_id, user_id, event_type, duration_seconds, progress_percentage, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        resource_id || null,
        USER_ID,
        event_type,
        Math.max(0, parseInt(duration_seconds) || 0),
        Math.min(100, Math.max(0, parseInt(progress_percentage) || 0)),
        JSON.stringify(metadata),
      ]
    );

    res.status(201).json({ data: { id, event_type, timestamp: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

export default router;
