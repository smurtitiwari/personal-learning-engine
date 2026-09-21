import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

// GET /api/trends
router.get('/', async (req, res, next) => {
  try {
    await getUserId(req); // auth check
    const { data, error } = await supabase
      .from('trends')
      .select('id, topic, description, relevance, momentum, source_info')
      .eq('is_active', true)
      .order('relevance', { ascending: false })
      .limit(10);
    if (error) throw createError(error.message, 500);
    res.json({ data: data ?? [] });
  } catch (err) { next(err); }
});

export default router;
