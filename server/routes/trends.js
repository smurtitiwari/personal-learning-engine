import { Router } from 'express';
import { all } from '../db/db.js';

const router = Router();

// GET /api/trends
router.get('/', (_req, res, next) => {
  try {
    const trends = all(
      `SELECT * FROM trends WHERE is_active = 1 ORDER BY momentum DESC, relevance DESC`,
      [],
      ['source_info']
    );
    res.json({ data: trends });
  } catch (err) {
    next(err);
  }
});

export default router;
