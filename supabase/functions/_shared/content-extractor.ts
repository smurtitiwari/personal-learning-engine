// ============================================================
// Content extraction per source type
// Returns structured content for AI analysis
// ============================================================
import type { ExtractedContent } from './types.ts';

export function detectSourceType(url: string): {
  type: ExtractedContent['source_type'];
  source: string;
} {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { type: 'video', source: 'YouTube' };
  if (u.includes('substack.com')) return { type: 'newsletter', source: 'Substack' };
  if (u.includes('medium.com')) return { type: 'article', source: 'Medium' };
  if (u.includes('arxiv.org')) return { type: 'pdf', source: 'arXiv' };
  if (u.endsWith('.pdf')) return { type: 'pdf', source: 'PDF' };
  if (u.includes('github.com')) return { type: 'article', source: 'GitHub' };
  if (u.includes('loom.com') || u.includes('vimeo.com') || u.includes('wistia.com')) {
    return { type: 'video', source: 'Video' };
  }
  return { type: 'article', source: new URL(url).hostname.replace(/^www\./, '') };
}

// ── YouTube ──────────────────────────────────────────────────

async function extractYouTube(url: string): Promise<Partial<ExtractedContent>> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error(`Could not parse YouTube video ID from: ${url}`);

  // oEmbed for title and thumbnail
  const oembed = await fetchJSON<{ title?: string; thumbnail_url?: string; author_name?: string }>(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  );

  // Try to fetch auto-generated transcript via timedtext API
  let transcript: string | undefined;
  try {
    transcript = await fetchYouTubeTranscript(videoId);
  } catch (e) {
    console.warn('[content-extractor] transcript fetch failed:', e);
  }

  return {
    title: oembed.title,
    creator: oembed.author_name,
    thumbnail_url: oembed.thumbnail_url,
    transcript,
    source_type: 'video',
    source: 'YouTube',
  };
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // Fetch the video page to find the timedtext URL
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const html = await pageResp.text();

  // Extract the caption track URL
  const captionMatch = html.match(/"captionTracks":\s*\[\{"baseUrl":"([^"]+)"/);
  if (!captionMatch) throw new Error('No caption track found');

  const captionUrl = captionMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
  const xmlResp = await fetch(captionUrl);
  const xml = await xmlResp.text();

  // Parse the XML to extract text
  const texts = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m =>
    m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim(),
  );

  return texts.join(' ');
}

// ── Article / Generic HTML ───────────────────────────────────

async function extractArticle(url: string): Promise<Partial<ExtractedContent>> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LearningEngine/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();

  const title = extractMetaOrTitle(html, 'og:title') ?? extractTag(html, 'title');
  const description = extractMetaOrTitle(html, 'og:description') ?? extractMetaOrTitle(html, 'description');
  const thumbnail_url = extractMetaOrTitle(html, 'og:image');
  const author = extractMetaOrTitle(html, 'author') ?? extractMetaOrTitle(html, 'article:author');
  const published = extractMetaOrTitle(html, 'article:published_time');
  const content_text = extractArticleText(html, description);

  const wordCount = content_text ? content_text.split(/\s+/).length : 0;
  const reading_time_minutes = Math.max(1, Math.round(wordCount / 220));

  return {
    title: title?.trim(),
    creator: author?.trim(),
    thumbnail_url: thumbnail_url?.trim(),
    content_text,
    reading_time_minutes,
    published_at: published?.trim(),
  };
}

function extractMetaOrTitle(html: string, prop: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHTMLEntities(m[1]);
  }
  return undefined;
}

function extractTag(html: string, tag: string): string | undefined {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return m ? decodeHTMLEntities(m[1]) : undefined;
}

function extractArticleText(html: string, fallback?: string): string {
  // Remove scripts, styles, nav, header, footer
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Take the first ~4000 meaningful characters
  if (clean.length > 4000) clean = clean.slice(0, 4000);
  return clean || fallback || '';
}

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ── Generic fetch helper ─────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LearningEngine/1.0)' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.json() as Promise<T>;
}

// ── Main dispatcher ──────────────────────────────────────────

export async function extractContent(url: string): Promise<ExtractedContent> {
  const { type, source } = detectSourceType(url);

  try {
    let partial: Partial<ExtractedContent>;

    if (type === 'video' && source === 'YouTube') {
      partial = await extractYouTube(url);
    } else {
      partial = await extractArticle(url);
    }

    return {
      source_type: type,
      source,
      ...partial,
    };
  } catch (err) {
    // Return minimal structure — don't fail completely if extraction fails
    console.error(`[content-extractor] failed for ${url}:`, err);
    return { source_type: type, source };
  }
}
