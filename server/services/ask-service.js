/**
 * Ask AI Service — DeepSeek with RAG context from Supabase
 * Replaces the broken Supabase edge function (verify_jwt: true rejects service role key).
 * Builds context from: top topics, active goals, relevant resources.
 * Persists conversation + messages to chat_conversations / chat_messages tables.
 */

import { supabase } from '../db/supabase.js';

const MAX_TOKENS = 1024;

function getDeepSeekConfig() {
  const apiKey  = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model   = process.env.DEEPSEEK_MODEL    || 'deepseek-chat';
  return { apiKey, baseUrl, model };
}

async function callDeepSeek(systemPrompt, messages) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const payload = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
  };

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepSeek ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Unexpected DeepSeek response shape');
  return content.trim();
}

// ── Context retrieval ─────────────────────────────────────────

async function getTopTopics(userId, limit = 8) {
  const { data } = await supabase
    .from('resource_topics')
    .select('topics(name), resources!inner(user_id, completed_at)')
    .eq('resources.user_id', userId)
    .limit(200);

  if (!data) return [];
  const counts = {};
  for (const row of data) {
    const name = row.topics?.name;
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic, count }));
}

async function getActiveGoals(userId) {
  const { data } = await supabase
    .from('goals')
    .select('title, reason')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(5);
  return data || [];
}

async function getRelevantResources(userId, query, limit = 5) {
  // Simple keyword match — fallback when no embedding service available
  const { data } = await supabase
    .from('resources')
    .select('title, source_type, ai_summary, creator_name')
    .eq('user_id', userId)
    .eq('processing_status', 'ready')
    .not('ai_summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3);

  if (!data) return [];

  // Rank by simple keyword overlap with query
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return data
    .map(r => {
      const text = `${r.title} ${r.ai_summary || ''}`.toLowerCase();
      const score = queryWords.filter(w => text.includes(w)).length;
      return { ...r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── System prompt ─────────────────────────────────────────────

function buildSystemPrompt({ topTopics, activeGoals, relevantResources, contextResource }) {
  const parts = [
    `You are a personal learning assistant for this user's Learning Engine.
Help them understand their learning, discover what to explore next, and get the most from their saved resources.

RULES:
- Only reference resources and goals that exist in the user's data below
- Never invent resources, topics, or progress
- Be specific — reference their actual topics and goals by name
- If you lack data to answer accurately, say so honestly`,
  ];

  if (contextResource) {
    parts.push(`\nCurrent resource context:
Title: ${contextResource.title}
Type: ${contextResource.type}
Author: ${contextResource.by}
${contextResource.summary ? `Summary: ${contextResource.summary}` : ''}
${contextResource.url ? `URL: ${contextResource.url}` : ''}`);
  }

  if (topTopics.length > 0) {
    parts.push(`\nUser's most-saved topics:
${topTopics.map(t => `- ${t.topic}: ${t.count} resources saved`).join('\n')}`);
  }

  if (activeGoals.length > 0) {
    parts.push(`\nActive learning goals:
${activeGoals.map(g => `- ${g.title}${g.reason ? `: ${g.reason}` : ''}`).join('\n')}`);
  }

  if (relevantResources.length > 0) {
    parts.push(`\nRelevant resources from their library:
${relevantResources
  .map(r => `- ${r.title} [${r.source_type}]${r.ai_summary ? `: ${r.ai_summary.slice(0, 150)}` : ''}`)
  .join('\n')}`);
  }

  return parts.join('\n');
}

// ── Conversation persistence ──────────────────────────────────

async function getOrCreateConversation(userId, convId, firstUserMessage) {
  if (convId) {
    await supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId);
    return convId;
  }

  // Generate a short title from the first message
  const title = firstUserMessage.slice(0, 80).trim() || 'New chat';

  const { data: conv, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single();

  if (error || !conv) throw new Error(error?.message ?? 'Failed to create conversation');
  return conv.id;
}

// ── Main export ───────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {Array<{role:string,content:string}>} messages
 * @param {string|null} conversationId
 * @param {object|null} resource  - optional current resource context
 * @returns {{ answer: string, conversation_id: string }}
 */
export async function askAI(userId, messages, conversationId = null, resource = null) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) throw new Error('No user message found');

  const query = lastUserMsg.content;

  // Fetch context in parallel
  const [topTopics, activeGoals, relevantResources] = await Promise.all([
    getTopTopics(userId),
    getActiveGoals(userId),
    getRelevantResources(userId, query),
  ]);

  const systemPrompt = buildSystemPrompt({ topTopics, activeGoals, relevantResources, contextResource: resource });
  const answer = await callDeepSeek(systemPrompt, messages);

  // Persist conversation (best-effort — don't fail the user response)
  let finalConvId = conversationId;
  try {
    finalConvId = await getOrCreateConversation(userId, conversationId, query);

    // Save prior messages if new conversation
    if (!conversationId) {
      const priorMessages = messages.slice(0, -1);
      if (priorMessages.length > 0) {
        await supabase.from('chat_messages').insert(
          priorMessages.map(m => ({ conversation_id: finalConvId, role: m.role, content: m.content })),
        );
      }
    }

    await supabase.from('chat_messages').insert([
      { conversation_id: finalConvId, role: 'user',      content: query  },
      { conversation_id: finalConvId, role: 'assistant', content: answer },
    ]);
  } catch (persistErr) {
    console.warn('[ask-service] persistence failed:', persistErr.message);
  }

  return { answer, conversation_id: finalConvId, source: 'ai' };
}
