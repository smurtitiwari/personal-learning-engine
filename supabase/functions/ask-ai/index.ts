// ============================================================
// ask-ai Edge Function
// Chat endpoint with retrieval-augmented context from user's data.
// Persists every conversation and message.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, getUserId, ok, err, corsHeaders } from '../_shared/supabase-client.ts';
import { chat, generateConversationTitle } from '../_shared/ai.ts';
import { semanticSearch, getUserTopTopics, getGoalTopics } from '../_shared/retrieval.ts';
import type { ChatMessage } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string;
  try {
    userId = await getUserId(req);
  } catch (e) {
    return err((e as Error).message, 401);
  }

  let body: {
    messages: ChatMessage[];
    conversation_id?: string;
    resource?: { type: string; by: string; title: string; summary?: string; url?: string };
  };
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { messages, conversation_id, resource } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return err('messages array is required', 400);
  }

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) return err('No user message found', 400);

  const db = getSupabaseAdmin();

  // ── Step 1: Retrieve relevant context ────────────────────────
  const [relevantResources, topTopics, goalTopics] = await Promise.all([
    semanticSearch(db, userId, lastUserMessage.content, 5, 0.6),
    getUserTopTopics(db, userId, 8),
    getGoalTopics(db, userId),
  ]);

  // ── Step 2: Get active goals ──────────────────────────────────
  const { data: activeGoals } = await db
    .from('goals')
    .select('title, goal_topics(topics(name))')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(5);

  // ── Step 3: Build system prompt with context ─────────────────
  const systemPrompt = buildSystemPrompt({
    relevantResources,
    topTopics,
    goalTopics,
    activeGoals: activeGoals ?? [],
    contextResource: resource,
  });

  // ── Step 4: Call AI ───────────────────────────────────────────
  let answer: string;
  try {
    answer = await chat(messages, systemPrompt);
  } catch (e) {
    console.error('[ask-ai] Claude failed:', e);
    return err('AI service temporarily unavailable', 503);
  }

  // ── Step 5: Persist conversation ─────────────────────────────
  try {
    let convId = conversation_id;

    if (!convId) {
      // Create new conversation
      const title = await generateConversationTitle(lastUserMessage.content).catch(() => 'New chat');
      const { data: conv, error: convErr } = await db
        .from('chat_conversations')
        .insert({ user_id: userId, title })
        .select()
        .single();

      if (convErr || !conv) throw new Error(convErr?.message ?? 'Failed to create conversation');
      convId = conv.id as string;

      // Save all preceding messages (from any prior turns in this new conversation)
      const priorMessages = messages.slice(0, -1);
      if (priorMessages.length > 0) {
        await db.from('chat_messages').insert(
          priorMessages.map(m => ({ conversation_id: convId, role: m.role, content: m.content })),
        );
      }
    } else {
      // Update conversation timestamp
      await db.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
    }

    // Save the latest user message + assistant response
    await db.from('chat_messages').insert([
      { conversation_id: convId, role: 'user', content: lastUserMessage.content },
      { conversation_id: convId, role: 'assistant', content: answer },
    ]);

    return ok({ answer, conversation_id: convId, source: 'ai' });
  } catch (persistErr) {
    // Don't fail the response if persistence fails — user still gets their answer
    console.warn('[ask-ai] conversation persistence failed:', persistErr);
    return ok({ answer, conversation_id: null, source: 'ai' });
  }
});

// ── System Prompt Builder ─────────────────────────────────────

interface PromptContext {
  relevantResources: Array<{ title: string; source_type: string; ai_summary?: string; topics: string[] }>;
  topTopics: Array<{ topic: string; count: number; recent_count: number }>;
  goalTopics: string[];
  activeGoals: Array<{ title: string }>;
  contextResource?: { type: string; by: string; title: string; summary?: string; url?: string };
}

function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [
    `You are a personal learning assistant for this user's Learning Engine.
You help them understand their learning, discover what to explore next, and get the most from their saved resources.

CRITICAL RULES:
- Only reference resources, goals, and learning activity that actually exist in the user's data below
- Never invent, hallucinate, or claim resources exist if they are not in the data
- If you don't have enough data to answer accurately, say so honestly
- Be specific and personal — reference their actual topics, goals, and resources by name
- Do not invent proficiency levels or claim the user has mastered anything`,
  ];

  if (ctx.contextResource) {
    parts.push(`\nCurrent resource context:
Title: ${ctx.contextResource.title}
Type: ${ctx.contextResource.type}
Author: ${ctx.contextResource.by}
${ctx.contextResource.summary ? `Summary: ${ctx.contextResource.summary}` : ''}
${ctx.contextResource.url ? `URL: ${ctx.contextResource.url}` : ''}`);
  }

  if (ctx.topTopics.length > 0) {
    parts.push(`\nUser's learning topics (by frequency):
${ctx.topTopics.map(t => `- ${t.topic}: ${t.count} resources saved (${t.recent_count} in last 30 days)`).join('\n')}`);
  }

  if (ctx.activeGoals.length > 0) {
    parts.push(`\nActive learning goals:
${ctx.activeGoals.map(g => `- ${g.title}`).join('\n')}`);
  }

  if (ctx.goalTopics.length > 0) {
    parts.push(`\nTopics tied to goals: ${ctx.goalTopics.join(', ')}`);
  }

  if (ctx.relevantResources.length > 0) {
    parts.push(`\nRelevant resources from their library:
${ctx.relevantResources
  .map(r => `- ${r.title} [${r.source_type}]${r.ai_summary ? `: ${r.ai_summary.slice(0, 150)}` : ''}`)
  .join('\n')}`);
  }

  return parts.join('\n');
}
