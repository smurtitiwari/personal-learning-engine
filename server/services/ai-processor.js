/**
 * AI Processor
 * Uses Claude to generate structured metadata, summaries and topics.
 * Degrades gracefully — if no API key or call fails, returns null.
 */

import Anthropic from '@anthropic-ai/sdk';

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

/** Max chars of content to send to Claude (controls cost) */
const MAX_CONTENT_CHARS = 7000;

/**
 * Process extracted content with Claude.
 * @param {object} extracted - Output from content-extractor
 * @param {object} userProfile - User's learning profile (for personalised summary)
 * @returns {object|null} Structured AI metadata, or null if unavailable
 */
export async function processWithAI(extracted, userProfile = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    console.log('[ai] No API key configured — skipping AI processing');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const contentText = buildContentText(extracted);
  if (!contentText || contentText.length < 50) {
    console.log('[ai] Insufficient content for AI processing');
    return null;
  }

  const userInterests = Array.isArray(userProfile.interests) && userProfile.interests.length > 0
    ? userProfile.interests.join(', ')
    : 'AI product design, AI UX, AI agents';

  const prompt = buildPrompt(extracted, contentText, userInterests);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0]?.text || '';
    return parseAIResponse(responseText, extracted);
  } catch (err) {
    console.error('[ai] Claude API error:', err.message);
    return null;
  }
}

// ── Prompt construction ──────────────────────────────────────

function buildContentText(extracted) {
  // Prefer transcript for video, content_text for articles
  const raw = extracted.transcript || extracted.content_text || extracted.description || '';
  return raw.slice(0, MAX_CONTENT_CHARS);
}

function buildPrompt(extracted, contentText, userInterests) {
  const typeHints = {
    youtube: 'This is a YouTube video.',
    medium: 'This is a Medium article.',
    substack: 'This is a Substack newsletter post.',
    pdf: 'This is a PDF document.',
    article: 'This is a web article.',
  };
  const typeHint = typeHints[extracted.source_type] || 'This is web content.';
  const knownTitle = extracted.title ? `Known title: ${extracted.title}` : '';
  const knownCreator = extracted.creator_name || extracted.author_name
    ? `Known creator/author: ${extracted.creator_name || extracted.author_name}`
    : '';

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
- ai_key_takeaways should be specific and concrete (avoid vague statements like "covers important concepts")
- duration_seconds: only for video/audio (integer seconds)
- reading_time_minutes: only for text content (integer minutes)
- omit any field you cannot confidently fill`;
}

// ── Response parsing ─────────────────────────────────────────

function parseAIResponse(text, extracted) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  // Extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('[ai] Could not find JSON in response');
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('[ai] JSON parse error:', err.message);
    return null;
  }

  // Validate and sanitise
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
      .map(t => t.trim())
      .slice(0, 5);
  }

  if (Array.isArray(parsed.topics)) {
    // Only keep topics from the known list
    result.topics = parsed.topics
      .filter(t => typeof t === 'string')
      .map(t => t.trim())
      .filter(t => KNOWN_TOPICS.some(k => k.toLowerCase() === t.toLowerCase()))
      // Normalise to canonical case
      .map(t => KNOWN_TOPICS.find(k => k.toLowerCase() === t.toLowerCase()) || t)
      .slice(0, 5);
  }

  if (typeof parsed.duration_seconds === 'number' && parsed.duration_seconds > 0)
    result.duration_seconds = Math.round(parsed.duration_seconds);

  if (typeof parsed.reading_time_minutes === 'number' && parsed.reading_time_minutes > 0)
    result.reading_time_minutes = Math.round(parsed.reading_time_minutes);

  return result;
}
