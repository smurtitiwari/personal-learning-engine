/**
 * AI Processor — DeepSeek (OpenAI-compatible API)
 * Generates structured metadata, summaries and topics for saved resources.
 * Degrades gracefully — if no API key or call fails, returns null.
 */

const KNOWN_TOPICS = [
  'AI UX',
  'AI agents',
  'AI evaluation',
  'AI prototyping',
  'AI product strategy',
  'AI fundamentals',
  'Product design',
  'Product strategy',
  'Machine learning',
  'LLMs',
  'Prompt engineering',
  'Agent reliability',
  'Human-AI interaction',
  'Design systems',
];

const MAX_CONTENT_CHARS = 7000;

function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model   = process.env.DEEPSEEK_MODEL    || 'deepseek-chat';
  return { apiKey, baseUrl, model };
}

async function callDeepSeek(messages, maxTokens = 1024) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  if (!apiKey) {
    console.log('[ai-processor] No DEEPSEEK_API_KEY — skipping AI processing');
    return null;
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
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

/**
 * Process extracted content with DeepSeek.
 * @param {object} extracted - Output from content-extractor
 * @param {object} userProfile - User's learning profile (for personalised summary)
 * @returns {object|null} Structured AI metadata, or null if unavailable
 */
export async function processWithAI(extracted, userProfile = {}) {
  const contentText = buildContentText(extracted);
  if (!contentText || contentText.length < 50) {
    console.log('[ai-processor] Insufficient content for AI processing');
    return null;
  }

  const userInterests = Array.isArray(userProfile.interests) && userProfile.interests.length > 0
    ? userProfile.interests.join(', ')
    : 'AI product design, AI UX, AI agents';

  const prompt = buildPrompt(extracted, contentText, userInterests);

  try {
    const raw = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      1024,
    );
    if (!raw) return null;
    return parseAIResponse(raw, extracted);
  } catch (err) {
    console.error('[ai-processor] DeepSeek error:', err.message);
    return null;
  }
}

// ── Prompt construction ──────────────────────────────────────

function buildContentText(extracted) {
  const raw = extracted.transcript || extracted.content_text || extracted.description || '';
  return raw.slice(0, MAX_CONTENT_CHARS);
}

function buildPrompt(extracted, contentText, userInterests) {
  const typeHints = {
    youtube:  'This is a YouTube video.',
    video:    'This is a video.',
    medium:   'This is a Medium article.',
    substack: 'This is a Substack newsletter post.',
    newsletter:'This is a newsletter post.',
    pdf:      'This is a PDF document.',
    article:  'This is a web article.',
  };
  const typeHint = typeHints[extracted.source_type] || 'This is web content.';
  const knownTitle   = extracted.title         ? `Known title: ${extracted.title}` : '';
  const knownCreator = extracted.creator_name || extracted.author_name
    ? `Known creator/author: ${extracted.creator_name || extracted.author_name}` : '';

  return `You are analyzing content saved to a personal learning library.

${typeHint}
URL: ${extracted.url}
${knownTitle}
${knownCreator}

CONTENT:
${contentText}

Return ONLY a valid JSON object. No explanation, no markdown, just the JSON.

{
  "title": "Clear, specific title (improve on the known title if vague)",
  "creator_name": "YouTube channel name or primary creator",
  "author_name": "Article/newsletter author name",
  "source": "Platform or publication name (e.g. YouTube, Medium, Vercel Blog, Anthropic)",
  "ai_summary": "2-3 sentences. Do NOT just describe what the content covers. Explain what is practically useful for someone learning about ${userInterests}. Connect it to real decisions they might face.",
  "ai_key_takeaways": ["Specific actionable takeaway", "Another concrete insight", "Third distinct point"],
  "topics": ["Pick 1-3 from this exact list: ${KNOWN_TOPICS.join(', ')}"],
  "duration_seconds": null,
  "reading_time_minutes": null
}

Rules:
- topics must only contain values from the provided list
- ai_summary must be personalised and useful, not just a description
- ai_key_takeaways should be specific and concrete
- duration_seconds: only for video/audio (integer seconds)
- reading_time_minutes: only for text content (integer minutes)
- omit any field you cannot confidently fill`;
}

// ── Response parsing ─────────────────────────────────────────

function parseAIResponse(text, extracted) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { console.warn('[ai-processor] No JSON in response'); return null; }

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (err) { console.warn('[ai-processor] JSON parse error:', err.message); return null; }

  const result = {};

  if (parsed.title && typeof parsed.title === 'string')
    result.title = parsed.title.trim().slice(0, 300);
  if (parsed.creator_name && typeof parsed.creator_name === 'string')
    result.creator_name = parsed.creator_name.trim().slice(0, 200);
  if (parsed.author_name && typeof parsed.author_name === 'string')
    result.author_name = parsed.author_name.trim().slice(0, 200);
  if (parsed.source && typeof parsed.source === 'string')
    result.source = parsed.source.trim().slice(0, 100);
  if (parsed.ai_summary && typeof parsed.ai_summary === 'string')
    result.ai_summary = parsed.ai_summary.trim().slice(0, 1000);
  if (Array.isArray(parsed.ai_key_takeaways)) {
    result.ai_key_takeaways = parsed.ai_key_takeaways
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim()).slice(0, 5);
  }
  if (Array.isArray(parsed.topics)) {
    result.topics = parsed.topics
      .filter(t => typeof t === 'string')
      .map(t => t.trim())
      .filter(t => KNOWN_TOPICS.some(k => k.toLowerCase() === t.toLowerCase()))
      .map(t => KNOWN_TOPICS.find(k => k.toLowerCase() === t.toLowerCase()) || t)
      .slice(0, 5);
  }
  if (typeof parsed.duration_seconds === 'number' && parsed.duration_seconds > 0)
    result.duration_seconds = Math.round(parsed.duration_seconds);
  if (typeof parsed.reading_time_minutes === 'number' && parsed.reading_time_minutes > 0)
    result.reading_time_minutes = Math.round(parsed.reading_time_minutes);

  return result;
}
