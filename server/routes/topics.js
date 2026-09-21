import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

// GET /api/topics
router.get('/', async (req, res, next) => {
  try {
    await getUserId(req); // auth check
    const { data, error } = await supabase
      .from('topics')
      .select('id, name, created_at')
      .order('name');
    if (error) throw createError(error.message, 500);
    res.json({ data: data ?? [] });
  } catch (err) { next(err); }
});

export default router;
