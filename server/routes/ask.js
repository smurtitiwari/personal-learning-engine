import { Router } from 'express';
import { getUserId } from '../db/supabase.js';
import { supabase } from '../db/supabase.js';
import { createError } from '../middleware/error.js';
import { askAI } from '../services/ask-service.js';

const router = Router();

// POST /api/ask
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { messages, resource, conversation_id } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw createError('messages array is required', 400);
    }

    const result = await askAI(userId, messages, conversation_id ?? null, resource ?? null);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/ask/conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw createError(error.message, 500);
    res.json({ data: data ?? [] });
  } catch (err) { next(err); }
});

// GET /api/ask/conversations/:id
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data: conv, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (error || !conv) throw createError('Conversation not found', 404);

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });

    res.json({ data: { ...conv, messages: messages ?? [] } });
  } catch (err) { next(err); }
});

// DELETE /api/ask/conversations/:id
router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    // Verify ownership
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (!conv) throw createError('Conversation not found', 404);

    await supabase.from('chat_messages').delete().eq('conversation_id', req.params.id);
    await supabase.from('chat_conversations').delete().eq('id', req.params.id);
    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
