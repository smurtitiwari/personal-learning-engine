import { supabase } from '../db/supabase.js';

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function complete(system, prompt, maxTokens) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned.match(/[\[{][\s\S]*[\]}]/)?.[0] || cleaned);
}

export async function analyzeGoalLimited(title) {
  const raw = await complete(
    'Return only compact JSON: {"topics":["..."],"rationale":"one short sentence"}. Use 3-5 specific learning topics.',
    `Learning goal: ${title.slice(0, 200)}`,
    220,
  );
  const parsed = parseJSON(raw);
  return {
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter(t => typeof t === 'string').slice(0, 5) : [],
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 300) : '',
  };
}

export async function generateWeeklyRecommendations(userId, goalId = null) {
  const [{ data: resources }, { data: goals }] = await Promise.all([
    supabase.from('resources')
      .select('title, source_type, ai_summary, resource_topics(topics(name))')
      .eq('user_id', userId).eq('processing_status', 'ready').is('deleted_at', null)
      .order('saved_at', { ascending: false }).limit(12),
    supabase.from('goals')
      .select('id, title, goal_topics(topics(name))')
      .eq('user_id', userId).eq('status', 'active').limit(5),
  ]);

  const context = {
    recent_resources: (resources || []).map(r => ({
      title: r.title,
      type: r.source_type,
      summary: r.ai_summary?.slice(0, 180) || '',
      topics: (r.resource_topics || []).map(x => x.topics?.name).filter(Boolean),
    })),
    goals: (goals || []).map(g => ({
      title: g.title,
      topics: (g.goal_topics || []).map(x => x.topics?.name).filter(Boolean),
    })),
  };
  if (!context.recent_resources.length && !context.goals.length) return [];

  const raw = await complete(
    'Return only a JSON array with at most 5 items: [{"title":"learning topic","topics":["topic"],"score":0.8,"reason":"one short sentence"}]. Recommend focused learning areas based only on the supplied library and goals.',
    JSON.stringify(context),
    450,
  );
  const parsed = parseJSON(raw);
  const recommendations = (Array.isArray(parsed) ? parsed : []).slice(0, 5).filter(r => r?.title);
  if (!recommendations.length) return [];

  let dismiss = supabase.from('recommendations').update({
    status: 'dismissed', dismissed_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('status', 'active');
  dismiss = goalId ? dismiss.eq('goal_id', goalId) : dismiss.is('goal_id', null);
  await dismiss;

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('recommendations').insert(recommendations.map(r => ({
    user_id: userId,
    goal_id: goalId,
    title: String(r.title).slice(0, 200),
    source_type: 'article',
    topics: Array.isArray(r.topics) ? r.topics.filter(t => typeof t === 'string').slice(0, 3) : [],
    score: Math.min(1, Math.max(0, Number(r.score) || 0.5)),
    reason: String(r.reason || '').slice(0, 300),
    reason_detail: String(r.reason || '').slice(0, 300),
    recommendation_type: goalId ? 'goal' : 'general',
    status: 'active',
    generated_at: now,
  }))).select();
  if (error) throw error;
  return data || [];
}
