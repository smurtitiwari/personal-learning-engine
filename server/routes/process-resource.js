/**
 * POST /api/process-resource
 *
 * Internal endpoint — triggered via a non-awaited fetch() from the POST /api/resources
 * handler so that it runs as a completely separate Vercel function invocation.
 *
 * Each HTTP request on Vercel is an independent invocation, so this one runs
 * to completion even after the caller has already responded to the browser.
 */

import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { extractContent, detectSourceType, extractYouTubeId } from '../services/content-extractor.js';
import { processWithAI } from '../services/ai-processor.js';

const router = Router();

function buildFallbackSummary(extracted) {
  const raw = extracted.description || extracted.transcript || extracted.content_text || '';
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const selected = [];
  let length = 0;
  for (const sentence of sentences) {
    const text = sentence.trim();
    if (!text) continue;
    if (selected.length > 0 && length + text.length > 600) break;
    selected.push(text);
    length += text.length + 1;
    if (selected.length === 3 || length >= 280) break;
  }
  const excerpt = (selected.join(' ') || clean)
    .replace(/\bI\b/gi, 'the creator')
    .replace(/\bmy\b/gi, "the creator's")
    .replace(/\bwe\b/gi, 'the content')
    .replace(/\bour\b/gi, "the content's")
    .replace(/\byou\b/gi, 'the audience')
    .replace(/\byour\b/gi, "the audience's")
    .slice(0, 520);
  const title = extracted.title?.trim();
  return title ? `${title} explores its subject through practical examples. ${excerpt}` : excerpt;
}

// Simple secret to prevent public access
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'learning-engine-internal';

router.post('/', async (req, res) => {
  // Validate internal secret
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { resource_id } = req.body;
  if (!resource_id) return res.status(400).json({ error: 'resource_id required' });

  // Do ALL work synchronously within this request — Vercel keeps the invocation
  // alive until we send the response. The caller (POST /api/resources) fires this
  // without awaiting it, so the user gets their 201 immediately while this runs.
  try {
    const { data: resource, error: fetchError } = await supabase
      .from('resources')
      .select('id, url, user_id')
      .eq('id', resource_id)
      .single();

    if (fetchError || !resource) {
      console.error('[process-resource] resource not found:', resource_id);
      return res.status(404).json({ error: 'Resource not found' });
    }

    const sourceType = detectSourceType(resource.url);
    const extracted = await extractContent(resource.url, sourceType);

    // Fetch user preferences for personalised AI summary
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('interests')
      .eq('user_id', resource.user_id)
      .single();

    const aiResult = await processWithAI(extracted, prefs ?? {});

    // Map content-extractor source types → DB enum values
    const sourceTypeMap = {
      youtube: 'video',
      medium: 'article',
      substack: 'newsletter',
      pdf: 'pdf',
      article: 'article',
    };
    const dbSourceType = sourceTypeMap[extracted.source_type ?? sourceType] ?? 'article';

    const updatePayload = {
      processing_status: 'ready',
      title: aiResult?.title || extracted.title || resource.url,
      creator_name: aiResult?.creator_name || extracted.creator_name || null,
      source_type: dbSourceType,
      thumbnail_url: extracted.thumbnail_url || extracted.thumbnail
        || (dbSourceType === 'video' ? (() => { const vid = extractYouTubeId(resource.url); return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null; })() : null),
      duration_seconds: extracted.duration_seconds || null,
      reading_time_minutes: extracted.reading_time_minutes || null,
      ai_summary: aiResult?.ai_summary || buildFallbackSummary(extracted),
      ai_key_takeaways: aiResult?.ai_key_takeaways ?? [],
      content_text: extracted.content_text?.slice(0, 10000) || null,
    };

    const { error: updateError } = await supabase
      .from('resources')
      .update(updatePayload)
      .eq('id', resource_id);

    if (updateError) throw updateError;

    // Upsert topics
    const topics = aiResult?.topics ?? extracted.topics ?? [];
    for (const topicName of topics) {
      let { data: topic } = await supabase
        .from('topics')
        .select('id')
        .eq('name', topicName)
        .single();

      if (!topic) {
        const { data: newTopic } = await supabase
          .from('topics')
          .insert({ name: topicName })
          .select('id')
          .single();
        topic = newTopic;
      }

      if (topic) {
        await supabase
          .from('resource_topics')
          .upsert({ resource_id, topic_id: topic.id }, { onConflict: 'resource_id,topic_id' });
      }
    }

    console.log(`[process-resource] done ${resource_id} (${dbSourceType}) topics:${topics.length}`);
    return res.json({ ok: true, source_type: dbSourceType });
  } catch (err) {
    console.error('[process-resource] failed:', err.message);
    await supabase
      .from('resources')
      .update({ processing_status: 'failed', processing_error: err.message?.slice(0, 500) })
      .eq('id', resource_id);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
