// ============================================================
// Embedding generation
// Primary: OpenAI text-embedding-3-small (1536-dim)
// Fallback: deterministic pseudo-embedding (non-semantic, for dev)
// ============================================================

const EMBEDDING_DIM = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.warn('[embeddings] OPENAI_API_KEY not set — using fallback pseudo-embedding');
    return fallbackEmbedding(text);
  }

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8191),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI Embedding API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.data[0].embedding as number[];
}

export function embeddingTextFor(resource: {
  title?: string;
  ai_summary?: string;
  content_text?: string;
  transcript?: string;
  ai_concepts?: string[];
  ai_keywords?: string[];
}): string {
  const parts: string[] = [];
  if (resource.title) parts.push(resource.title);
  if (resource.ai_summary) parts.push(resource.ai_summary);
  if (resource.ai_concepts?.length) parts.push(resource.ai_concepts.join(', '));
  if (resource.ai_keywords?.length) parts.push(resource.ai_keywords.join(', '));
  // Include content/transcript snippet for richer embedding
  const body = resource.transcript ?? resource.content_text ?? '';
  if (body) parts.push(body.slice(0, 2000));
  return parts.join('\n').trim();
}

// Deterministic, non-semantic fallback — useful for dev without OpenAI key.
// Produces a normalized vector from character n-grams. NOT suitable for production semantic search.
function fallbackEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length - 1; i++) {
    const h = (charCode(normalized, i) * 31 + charCode(normalized, i + 1)) % EMBEDDING_DIM;
    vec[Math.abs(h)] += 1;
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return Array.from(vec).map(v => v / mag);
}

function charCode(s: string, i: number): number {
  return s.charCodeAt(i) || 0;
}
