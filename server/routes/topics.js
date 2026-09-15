import { Router } from 'express';
import { all } from '../db/db.js';

const router = Router();

// GET /api/topics
router.get('/', (_req, res, next) => {
  try {
    const topics = all('SELECT id, name FROM topics ORDER BY name ASC');
    res.json({ data: topics });
  } catch (err) {
    next(err);
  }
});

export default router;
