import { Router } from 'express';
import { get, all, run, newId } from '../db/db.js';
import { createError } from '../middleware/error.js';
import { buildRecommendations } from '../services/recommendation-engine.js';

const router = Router();
const USER_ID = 'user_default';

function parseRec(r) {
  if (!r) return null;
  const out = { ...r };
  if (typeof out.topics === 'string') {
    try { out.topics = JSON.parse(out.topics); } catch { out.topics = []; }
  }
  return out;
}

// ── GET /api/recommendations ──────────────────────────────────
// Returns current undismissed recommendations. Triggers a build
// if the table is empty.

router.get('/', async (_req, res, next) => {
  try {
    let rows = all(
      `SELECT * FROM recommendations
       WHERE user_id = ? AND dismissed_at IS NULL
       ORDER BY score DESC`,
      [USER_ID]
    ).map(parseRec);

    // Seed on first call if nothing exists
    if (rows.length === 0) {
      await buildRecommendations();
      rows = all(
        `SELECT * FROM recommendations
         WHERE user_id = ? AND dismissed_at IS NULL
         ORDER BY score DESC`,
        [USER_ID]
      ).map(parseRec);
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/recommendations/:id ──────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const rec = parseRec(get(
      'SELECT * FROM recommendations WHERE id = ? AND user_id = ?',
      [req.params.id, USER_ID]
    ));
    if (!rec) return next(createError(404, 'Recommendation not found'));
    res.json({ data: rec });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/recommendations/refresh ────────────────────────
// Rebuilds recommendations on demand.

router.post('/refresh', async (_req, res, next) => {
  try {
    const recs = await buildRecommendations();
    res.json({ data: recs, rebuilt: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/recommendations/:id/dismiss ────────────────────

router.post('/:id/dismiss', (req, res, next) => {
  try {
    const rec = get(
      'SELECT id FROM recommendations WHERE id = ? AND user_id = ?',
      [req.params.id, USER_ID]
    );
    if (!rec) return next(createError(404, 'Recommendation not found'));

    run(
      `UPDATE recommendations SET dismissed_at = datetime('now') WHERE id = ?`,
      [req.params.id]
    );

    res.json({ data: { id: req.params.id, dismissed: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
