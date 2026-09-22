/**
 * Ask AI Service — DeepSeek with RAG context from Supabase
 * Replaces the broken Supabase edge function (verify_jwt: true rejects service role key).
 * Builds context from: top topics, active goals, relevant resources.
 * Persists conversation + messages to chat_conversations / chat_messages tables.
 */

import { supabase } from '../db/supabase.js';

const MAX_TOKENS = 350;
const MAX_HISTORY_MESSAGES = 6;

function getDeepSeekConfig() {
  const apiKey  = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model   = process.env.DEEPSEEK_MODEL    || 'deepseek-chat';
  return { apiKey, baseUrl, model };
}

async function callDeepSeek(systemPrompt, messages) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured — add it to Vercel environment variables');
  }

  console.log(`[ask-service] calling DeepSeek model=${model}`);

  const payload = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-MAX_HISTORY_MESSAGES).map(m => ({
        role: m.role,
        content: String(m.content).slice(0, 1200),
      })),
    ],
  };

  let resp;
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (fetchErr) {
    if (fetchErr.name === 'TimeoutError') {
      throw new Error('DeepSeek request timed out after 30s');
    }
    throw new Error(`DeepSeek network error: ${fetchErr.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error(`DeepSeek 401 Unauthorized — check DEEPSEEK_API_KEY`);
    if (resp.status === 404) throw new Error(`DeepSeek 404 — model "${model}" not found. Check DEEPSEEK_MODEL env var`);
    if (resp.status === 429) throw new Error(`DeepSeek 429 Rate limited`);
    throw new Error(`DeepSeek ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected DeepSeek response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content.trim();
}

// ── Context retrieval ─────────────────────────────────────────

async function getTopTopics(userId, limit = 8) {
  try {
    const { data } = await supabase
      .from('resource_topics')
      .select('topics(name), resources!inner(user_id)')
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
  } catch (err) {
    console.warn('[ask-service] getTopTopics failed:', err.message);
    return [];
  }
}

async function getActiveGoals(userId) {
  try {
    const { data } = await supabase
      .from('goals')
      .select('title, reason')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5);
    return data || [];
  } catch (err) {
    console.warn('[ask-service] getActiveGoals failed:', err.message);
    return [];
  }
}

async function getRelevantResources(userId, query, limit = 5) {
  try {
    const { data } = await supabase
      .from('resources')
      .select('title, source_type, ai_summary, creator_name')
      .eq('user_id', userId)
      .eq('processing_status', 'ready')
      .not('ai_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 4);

    if (!data) return [];

    // Rank by keyword overlap with the query
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return data
      .map(r => {
        const text = `${r.title} ${r.ai_summary || ''}`.toLowerCase();
        const score = queryWords.length
          ? queryWords.filter(w => text.includes(w)).length
          : 0;
        return { ...r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err) {
    console.warn('[ask-service] getRelevantResources failed:', err.message);
    return [];
  }
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
- If you lack data to answer accurately, say so honestly
- Keep answers concise and actionable, normally under 120 words`,
  ];

  if (contextResource) {
    parts.push(`\nCurrent resource context:
Title: ${contextResource.title}
Type: ${contextResource.type}
Author: ${contextResource.by}${contextResource.summary ? `\nSummary: ${contextResource.summary}` : ''}${contextResource.url ? `\nURL: ${contextResource.url}` : ''}`);
  }

  if (topTopics.length > 0) {
    parts.push(`\nUser's most-saved topics:\n${topTopics.map(t => `- ${t.topic}: ${t.count} resources`).join('\n')}`);
  }

  if (activeGoals.length > 0) {
    parts.push(`\nActive learning goals:\n${activeGoals.map(g => `- ${g.title}${g.reason ? `: ${g.reason}` : ''}`).join('\n')}`);
  }

  if (relevantResources.length > 0) {
    parts.push(`\nRelevant resources from their library:\n${relevantResources
      .map(r => `- ${r.title} [${r.source_type}]${r.ai_summary ? `: ${r.ai_summary.slice(0, 150)}` : ''}`)
      .join('\n')}`);
  }

  if (topTopics.length === 0 && activeGoals.length === 0 && relevantResources.length === 0) {
    parts.push(`\nNote: No learning data found yet for this user. Let them know they can start by saving a resource.`);
  }

  return parts.join('\n');
}

// ── Conversation persistence ──────────────────────────────────

async function getOrCreateConversation(userId, convId, firstUserMessage) {
  if (convId) {
    await supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId)
      .eq('user_id', userId);
    return convId;
  }

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
 * @param {string|null} conversationId - server-side UUID, null for new conversation
 * @param {object|null} resource  - optional current resource context
 * @returns {{ answer: string, conversation_id: string, source: string }}
 */
export async function askAI(userId, messages, conversationId = null, resource = null) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) throw new Error('No user message found');

  const query = lastUserMsg.content;

  // Fetch context in parallel (failures are caught inside each helper)
  const [topTopics, activeGoals, relevantResources] = await Promise.all([
    getTopTopics(userId),
    getActiveGoals(userId),
    getRelevantResources(userId, query),
  ]);

  const systemPrompt = buildSystemPrompt({ topTopics, activeGoals, relevantResources, contextResource: resource });

  // This throws with specific error if DeepSeek fails — caller gets real message
  const answer = await callDeepSeek(systemPrompt, messages);

  // Persist conversation (best-effort — don't fail the user response)
  let finalConvId = conversationId;
  try {
    finalConvId = await getOrCreateConversation(userId, conversationId, query);

    // If new conversation, save all prior messages first
    if (!conversationId && messages.length > 1) {
      const priorMessages = messages.slice(0, -1);
      await supabase.from('chat_messages').insert(
        priorMessages.map(m => ({ conversation_id: finalConvId, role: m.role, content: m.content })),
      );
    }

    await supabase.from('chat_messages').insert([
      { conversation_id: finalConvId, role: 'user',      content: query  },
      { conversation_id: finalConvId, role: 'assistant', content: answer },
    ]);
  } catch (persistErr) {
    console.warn('[ask-service] persistence failed:', persistErr.message);
    // Answer is still returned even if DB persistence fails
  }

  return { answer, conversation_id: finalConvId, source: 'ai' };
}
