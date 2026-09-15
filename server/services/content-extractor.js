/**
 * Content Extractor
 * Handles per-source extraction: YouTube, Medium, Substack, Article, PDF
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── URL utilities ────────────────────────────────────────────

/** Detect source type from URL */
export function detectSourceType(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
    if (host === 'medium.com' || host.endsWith('.medium.com')) return 'medium';
    if (host === 'substack.com' || host.endsWith('.substack.com')) return 'substack';
    if (
      u.pathname.toLowerCase().endsWith('.pdf') ||
      rawUrl.toLowerCase().includes('.pdf?')
    ) return 'pdf';
    return 'article';
  } catch {
    return null;
  }
}

/** Extract YouTube video ID from various URL formats */
export function extractYouTubeId(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v') || null;
  } catch {
    return null;
  }
}

// ── Main extraction entry point ──────────────────────────────

/**
 * Extract content from a URL based on detected source type.
 * Returns a partial resource object — always succeeds (may return empty fields).
 */
export async function extractContent(url, sourceType) {
  try {
    switch (sourceType) {
      case 'youtube':  return await extractYouTube(url);
      case 'medium':   return await extractArticle(url, 'medium');
      case 'substack': return await extractArticle(url, 'substack');
      case 'pdf':      return await extractPDF(url);
      default:         return await extractArticle(url, 'article');
    }
  } catch (err) {
    console.warn(`[extractor] Extraction failed for ${url}:`, err.message);
    return { url, source_type: sourceType };
  }
}

// ── YouTube ─────────────────────────────────────────────────

async function extractYouTube(url) {
  const videoId = extractYouTubeId(url);
  const result = { url, source_type: 'youtube', source: 'YouTube' };

  // 1. oEmbed — title + channel name + thumbnail
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (oembedRes.ok) {
      const oe = await oembedRes.json();
      result.title        = oe.title || undefined;
      result.creator_name = oe.author_name || undefined;
      result.thumbnail    = oe.thumbnail_url || undefined;
    }
  } catch (e) {
    console.warn('[extractor] oEmbed failed:', e.message);
  }

  // 2. Transcript via youtube-transcript package
  if (videoId) {
    try {
      const { YoutubeTranscript } = await import('youtube-transcript');
      const lines = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      if (lines && lines.length > 0) {
        result.transcript = lines.map(l => l.text).join(' ');
        // Estimate duration from transcript offsets
        const last = lines[lines.length - 1];
        if (last?.offset && last?.duration) {
          result.duration_seconds = Math.round((last.offset + last.duration) / 1000);
        }
      }
    } catch (e) {
      console.warn('[extractor] Transcript fetch failed:', e.message);
    }
  }

  // 3. Try parsing duration from page HTML as fallback
  if (!result.duration_seconds && videoId) {
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const m = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
        if (m) result.duration_seconds = parseInt(m[1], 10);

        // Also try to get description
        const descMatch = html.match(/"description"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]{20,500})"/);
        if (descMatch) result.description = descMatch[1].replace(/\\n/g, ' ').trim();
      }
    } catch (e) {
      console.warn('[extractor] YouTube page fetch failed:', e.message);
    }
  }

  // Populate content_text from transcript for AI processing
  if (result.transcript) {
    result.content_text = result.transcript;
  }

  return result;
}

// ── Articles / Medium / Substack ─────────────────────────────

async function extractArticle(url, hint = 'article') {
  const result = { url, source_type: hint === 'article' ? 'article' : hint };

  let html = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.warn('[extractor] Fetch failed:', e.message);
    return result;
  }

  const $ = cheerio.load(html);

  // ─ Title
  result.title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    undefined;

  // ─ Source / platform name
  result.source =
    $('meta[property="og:site_name"]').attr('content') ||
    deriveSourceName(url) ||
    undefined;

  // ─ Author / creator
  result.author_name =
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content') ||
    $('[rel="author"]').first().text().trim() ||
    $('.author').first().text().trim() ||
    $('[class*="author"]').first().text().trim() ||
    undefined;

  result.creator_name = result.author_name;

  // ─ Description
  result.description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    undefined;

  // ─ Thumbnail
  result.thumbnail =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    undefined;

  // ─ Published date
  result.published_at =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').attr('datetime') ||
    undefined;

  // ─ Main content text
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content-body',
    '#content',
  ];

  let bodyText = '';
  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length > 0) {
      // Remove scripts, styles, nav, footer
      el.find('script, style, nav, footer, aside, [aria-hidden="true"]').remove();
      bodyText = el.text().replace(/\s+/g, ' ').trim();
      if (bodyText.length > 200) break;
    }
  }

  // Fallback: body text
  if (!bodyText || bodyText.length < 200) {
    $('script, style, nav, footer, header, aside').remove();
    bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  }

  result.content_text = bodyText.slice(0, 15000); // cap at 15k chars

  // Estimate reading time (avg 200 wpm)
  const wordCount = result.content_text.split(/\s+/).length;
  result.reading_time_minutes = Math.max(1, Math.round(wordCount / 200));

  return result;
}

// ── PDF ──────────────────────────────────────────────────────

async function extractPDF(url) {
  const result = { url, source_type: 'pdf', source: 'PDF' };

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, { max: 30 }); // max 30 pages

    result.content_text    = data.text?.slice(0, 15000) || '';
    result.page_count      = data.numpages || undefined;
    result.reading_time_minutes = Math.max(1, Math.round((data.text?.split(/\s+/).length || 0) / 200));

    // Try to pull title from PDF metadata
    if (data.info?.Title) result.title = data.info.Title;
    if (data.info?.Author) {
      result.author_name  = data.info.Author;
      result.creator_name = data.info.Author;
    }
  } catch (e) {
    console.warn('[extractor] PDF parse failed:', e.message);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────

function deriveSourceName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Map known hosts to friendly names
    const MAP = {
      'medium.com': 'Medium',
      'substack.com': 'Substack',
      'vercel.com': 'Vercel Blog',
      'figma.com': 'Figma Blog',
      'linear.app': 'Linear Blog',
      'anthropic.com': 'Anthropic',
      'nngroup.com': 'Nielsen Norman Group',
      'every.to': 'Every',
      'lennysnewsletter.com': "Lenny's Newsletter",
    };
    if (MAP[host]) return MAP[host];
    // Capitalise the domain name
    const parts = host.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return undefined;
  }
}
