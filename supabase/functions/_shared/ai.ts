// ============================================================
// AI provider abstraction — DeepSeek (OpenAI-compatible API)
// Swap the model/provider here, nowhere else.
// ============================================================
import type { AIAnalysisResult, AIGoalAnalysis, ChatMessage } from './types.ts';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL    = 'deepseek-flash';
const MAX_SUMMARY_CHARS = 360;

function getApiKey(): string {
  const key = Deno.env.get('DEEPSEEK_API_KEY');
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  return key;
}

function getBaseUrl(): string {
  return Deno.env.get('DEEPSEEK_BASE_URL') ?? DEFAULT_BASE_URL;
}

function getModel(): string {
  return Deno.env.get('DEEPSEEK_MODEL') ?? DEFAULT_MODEL;
}

// DeepSeek uses the OpenAI chat-completions format.
// System prompt is passed as the first message with role "system".
async function callAI(
  messages: ChatMessage[],
  system: string,
  maxTokens = 1024,
): Promise<string> {
  const url = `${getBaseUrl()}/chat/completions`;
  const body = {
    model: getModel(),
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected DeepSeek response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content.trim();
}

// Parse JSON from model response — strip markdown code fences if present
function parseJSON<T>(raw: string): T {
  const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(clean) as T;
}

function conciseSummary(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  const excerpt = text.slice(0, MAX_SUMMARY_CHARS - 1);
  const sentenceEnd = Math.max(excerpt.lastIndexOf('.'), excerpt.lastIndexOf('!'), excerpt.lastIndexOf('?'));
  return sentenceEnd >= 220 ? excerpt.slice(0, sentenceEnd + 1) : `${excerpt.trimEnd()}…`;
}

// ── Resource Analysis ─────────────────────────────────────────

export async function analyzeResource(
  title: string,
  source: string,
  content: string,
): Promise<AIAnalysisResult> {
  const system = `You analyze learning resources and return structured JSON only.
Schema (respond with ONLY this JSON, no prose, no markdown):
{"summary":"1-2 sentence summary, maximum 360 characters","topics":["topic1"],"concepts":["concept1"],"keywords":["kw1"]}
- topics: broad learning areas (e.g. "AI UX", "Machine Learning", "Product Strategy") — max 8
- concepts: specific ideas in the resource — max 10
- keywords: useful search terms — max 10`;

  const text = content.length > 4000 ? content.slice(0, 4000) + '…' : content;
  const raw = await callAI(
    [{ role: 'user', content: `Title: ${title}\nSource: ${source}\nContent:\n${text}` }],
    system,
    900,
  );

  const parsed = parseJSON<Record<string, unknown>>(raw);
  if (
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.topics) ||
    !Array.isArray(parsed.concepts) ||
    !Array.isArray(parsed.keywords)
  ) {
    throw new Error(`Invalid AI analysis structure: ${raw.slice(0, 200)}`);
  }
  return {
    summary:  conciseSummary(parsed.summary as string),
    topics:   (parsed.topics   as unknown[]).filter(t => typeof t === 'string').slice(0, 8)  as string[],
    concepts: (parsed.concepts as unknown[]).filter(t => typeof t === 'string').slice(0, 10) as string[],
    keywords: (parsed.keywords as unknown[]).filter(t => typeof t === 'string').slice(0, 10) as string[],
  };
}

// ── Goal Analysis ─────────────────────────────────────────────

export async function analyzeGoal(goalTitle: string): Promise<AIGoalAnalysis> {
  const system = `You identify learning topics needed to achieve a goal.
Return ONLY JSON — no prose, no markdown:
{"topics":["topic1","topic2"],"rationale":"one sentence why"}
- topics: specific, learnable areas (e.g. "AI evaluation", "Prompt engineering") — 4 to 8 items
- Do NOT invent mastery levels or proficiency claims`;

  const raw = await callAI(
    [{ role: 'user', content: `Learning goal: "${goalTitle}"` }],
    system,
    400,
  );
  const parsed = parseJSON<Record<string, unknown>>(raw);
  if (!Array.isArray(parsed.topics)) {
    throw new Error(`Invalid goal analysis: ${raw.slice(0, 200)}`);
  }
  return {
    topics:    (parsed.topics as unknown[]).filter(t => typeof t === 'string').slice(0, 8) as string[],
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
  };
}

// ── Recommendation Ranking ────────────────────────────────────

export async function rankRecommendations(
  candidates: Array<{ topic: string; gap_score: number; goal_relevance: number }>,
  userContext: string,
  maxResults = 8,
): Promise<Array<{ topic: string; score: number; reason: string; reason_detail: string }>> {
  const system = `You rank learning recommendations for a user and explain why each matters.
Return ONLY a JSON array — no prose, no markdown:
[{"topic":"...","score":0.0,"reason":"one sentence","reason_detail":"2-3 sentences"}]
- score: 0.0 (least relevant) to 1.0 (most relevant)
- reason: concise, specific to this user's data
- reason_detail: deeper explanation referencing their learning patterns
- Return top ${maxResults} items, ranked by relevance`;

  const raw = await callAI(
    [{ role: 'user', content: `User context:\n${userContext}\n\nCandidates:\n${JSON.stringify(candidates, null, 2)}` }],
    system,
    1200,
  );
  const parsed = parseJSON<unknown[]>(raw);
  if (!Array.isArray(parsed)) throw new Error('Invalid ranking response');
  return parsed.slice(0, maxResults) as Array<{ topic: string; score: number; reason: string; reason_detail: string }>;
}

// ── Ask AI Chat ───────────────────────────────────────────────

export async function chat(messages: ChatMessage[], system: string): Promise<string> {
  return callAI(messages, system, 1500);
}

// ── Conversation Title ────────────────────────────────────────

export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  const raw = await callAI(
    [{ role: 'user', content: `Generate a concise 3–6 word title for a conversation starting with: "${firstUserMessage.slice(0, 300)}"` }],
    'Return only the title text, no quotes, no punctuation at end.',
    40,
  );
  return raw.slice(0, 80);
}
