import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';
import { extractContent, detectSourceType } from '../services/content-extractor.js';
import { processWithAI } from '../services/ai-processor.js';

const router = Router();

// Attach topics to a resource
async function withTopics(resource) {
  const { data: rows } = await supabase
    .from('resource_topics')
    .select('topics(name)')
    .eq('resource_id', resource.id);
  return {
    ...resource,
    topics: (rows ?? []).map(r => r.topics?.name).filter(Boolean),
  };
}

function mapResource(r, topics = []) {
  return {
    id: r.id,
    _id: r.id,
    type: r.source_type,
    by: r.creator_name ?? '',
    title: r.title ?? '',
    meta: r.duration_seconds
      ? `${Math.round(r.duration_seconds / 60)} min`
      : r.reading_time_minutes
      ? `${r.reading_time_minutes} min read`
      : r.page_count
      ? `${r.page_count} pages`
      : '',
    date: r.saved_at ? `Saved ${new Date(r.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '',
    topics,
    url: r.url,
    thumbnail: r.thumbnail_url ?? null,
    summary: r.ai_summary ?? r.content_text?.slice(0, 300) ?? '',
    ai_summary: r.ai_summary ?? null,
    description: r.ai_summary ?? null,
    covers: Array.isArray(r.ai_key_takeaways) ? r.ai_key_takeaways : [],
    status: r.processing_status,
    progress: r.progress_percentage ?? 0,
    source: r.source ?? '',
    source_type: r.source_type,
    creator_name: r.creator_name ?? '',
    added_at: r.saved_at,
    completed_at: r.completed_at ?? null,
    updated_at: r.updated_at,
  };
}

// GET /api/resources
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { type, topic, search, limit = 50 } = req.query;

    let query = supabase
      .from('resources')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('saved_at', { ascending: false })
      .limit(Number(limit));

    if (type && type !== 'all') query = query.eq('source_type', type === 'youtube' ? 'video' : type);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data: resources, error } = await query;
    if (error) throw createError(error.message, 500);

    // Fetch all topics for these resources in one query
    const ids = (resources ?? []).map(r => r.id);
    let topicMap = {};
    if (ids.length > 0) {
      const { data: topicRows } = await supabase
        .from('resource_topics')
        .select('resource_id, topics(name)')
        .in('resource_id', ids);
      for (const row of topicRows ?? []) {
        if (!topicMap[row.resource_id]) topicMap[row.resource_id] = [];
        if (row.topics?.name) topicMap[row.resource_id].push(row.topics.name);
      }
    }

    // Filter by topic if requested
    let filtered = resources ?? [];
    if (topic && topic !== 'all') {
      filtered = filtered.filter(r => (topicMap[r.id] ?? []).includes(topic));
    }

    const mapped = filtered.map(r => mapResource(r, topicMap[r.id] ?? []));
    res.json({ data: mapped });
  } catch (err) { next(err); }
});

// GET /api/resources/:id
router.get('/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data: resource, error } = await supabase
      .from('resources')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !resource) throw createError('Resource not found', 404);

    const withT = await withTopics(resource);
    const mapped = mapResource(withT, withT.topics);

    // Find related resources by shared topics
    let related = [];
    if (withT.topics.length > 0) {
      const { data: topicRows } = await supabase
        .from('topics')
        .select('id')
        .in('name', withT.topics);
      const topicIds = (topicRows ?? []).map(t => t.id);

      if (topicIds.length > 0) {
        const { data: relRows } = await supabase
          .from('resource_topics')
          .select('resource_id, resources!inner(id, title, source_type, creator_name, saved_at, ai_summary, thumbnail_url, user_id, deleted_at, processing_status)')
          .in('topic_id', topicIds)
          .neq('resource_id', req.params.id)
          .eq('resources.user_id', userId)
          .is('resources.deleted_at', null)
          .limit(8);

        const seen = new Set();
        related = (relRows ?? [])
          .map(r => r.resources)
          .filter(r => r && !seen.has(r.id) && seen.add(r.id))
          .slice(0, 4)
          .map(r => mapResource(r));
      }
    }

    res.json({ data: { ...mapped, related } });
  } catch (err) { next(err); }
});

// POST /api/resources
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { url } = req.body;
    if (!url) throw createError('URL is required', 400);

    // Normalize URL
    const normalizedUrl = url.trim().replace(/\/$/, '');
    try { new URL(normalizedUrl); } catch { throw createError('Invalid URL', 400); }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('resources')
      .select('id, processing_status')
      .eq('user_id', userId)
      .eq('url', normalizedUrl)
      .is('deleted_at', null)
      .single();

    if (existing) {
      return res.json({ data: { id: existing.id, status: existing.processing_status }, duplicate: true });
    }

    // Create resource
    const { data: resource, error } = await supabase
      .from('resources')
      .insert({
        user_id: userId,
        url: normalizedUrl,
        processing_status: 'processing',
      })
      .select()
      .single();

    if (error || !resource) throw createError(error?.message ?? 'Failed to create resource', 500);

    // Respond immediately so the client can start polling
    res.status(201).json({
      data: {
        id: resource.id,
        status: resource.processing_status,
        source_type: resource.source_type,
      },
    });

    // Process in background — Vercel Fluid Compute keeps the function alive after res.json()
    (async () => {
      try {
        const sourceType = detectSourceType(normalizedUrl);
        const extracted = await extractContent(normalizedUrl, sourceType);

        // Fetch user profile for personalised AI summary
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('interests')
          .eq('user_id', userId)
          .single();

        const aiResult = await processWithAI(extracted, prefs ?? {});

        // Map content-extractor source types to DB enum values
        const sourceTypeMap = { youtube: 'video', medium: 'article', substack: 'newsletter', pdf: 'pdf', article: 'article' };
        const dbSourceType = sourceTypeMap[extracted.source_type ?? sourceType] ?? 'article';

        const updatePayload = {
          processing_status: 'ready',
          title: aiResult?.title || extracted.title || normalizedUrl,
          creator_name: aiResult?.creator_name || extracted.creator_name || null,
          source_type: dbSourceType,
          thumbnail_url: extracted.thumbnail_url || null,
          duration_seconds: extracted.duration_seconds || null,
          reading_time_minutes: extracted.reading_time_minutes || null,
          ai_summary: aiResult?.ai_summary || extracted.description || null,
          ai_key_takeaways: aiResult?.ai_key_takeaways || null,
          content_text: extracted.content_text?.slice(0, 10000) || null,
        };

        const { error: updateError } = await supabase
          .from('resources')
          .update(updatePayload)
          .eq('id', resource.id);

        if (updateError) {
          console.error('[resources] update failed:', updateError.message);
          throw updateError;
        }

        // Upsert topics
        const topics = aiResult?.topics ?? extracted.topics ?? [];
        if (topics.length > 0) {
          for (const topicName of topics) {
            // Get or create topic
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
                .upsert({ resource_id: resource.id, topic_id: topic.id }, { onConflict: 'resource_id,topic_id' });
            }
          }
        }

        console.log(`[resources] processed ${resource.id} (${dbSourceType}) — topics: ${topics.length}`);
      } catch (err) {
        console.error('[resources] background processing failed:', err.message);
        await supabase
          .from('resources')
          .update({ processing_status: 'failed', processing_error: err.message?.slice(0, 500) })
          .eq('id', resource.id);
      }
    })();
  } catch (err) { next(err); }
});

// PATCH /api/resources/:id/progress
router.patch('/:id/progress', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { progress_percentage } = req.body;
    if (progress_percentage == null) throw createError('progress_percentage is required', 400);

    const { data, error } = await supabase
      .from('resources')
      .update({ progress_percentage: Math.min(100, Math.max(0, Number(progress_percentage))) })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw createError('Resource not found', 404);
    res.json({ data: { id: data.id, progress_percentage: data.progress_percentage } });
  } catch (err) { next(err); }
});

// POST /api/resources/:id/complete
router.post('/:id/complete', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data, error } = await supabase
      .from('resources')
      .update({ progress_percentage: 100, completed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw createError('Resource not found', 404);

    await supabase.from('activity_events').insert({
      user_id: userId,
      resource_id: req.params.id,
      event_type: 'completed',
      progress_percentage: 100,
    });

    res.json({ data: { id: data.id, completed_at: data.completed_at } });
  } catch (err) { next(err); }
});

// DELETE /api/resources/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data, error } = await supabase
      .from('resources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw createError('Resource not found', 404);
    res.json({ data: { id: data.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
