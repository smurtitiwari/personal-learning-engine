// ============================================================
// process-resource Edge Function
// Called after a resource is saved to extract content and run AI analysis.
// Idempotent — safe to retry.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, getUserId, ok, err, corsHeaders } from '../_shared/supabase-client.ts';
import { extractContent } from '../_shared/content-extractor.ts';
import { analyzeResource } from '../_shared/ai.ts';
import { generateEmbedding, embeddingTextFor } from '../_shared/embeddings.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string;
  try {
    userId = await getUserId(req);
  } catch (e) {
    return err((e as Error).message, 401);
  }

  let body: { resource_id: string };
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { resource_id } = body;
  if (!resource_id) return err('resource_id is required', 400);

  const db = getSupabaseAdmin();

  // Fetch the resource — verify it belongs to the authenticated user
  const { data: resource, error: fetchErr } = await db
    .from('resources')
    .select('*')
    .eq('id', resource_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !resource) {
    return err('Resource not found or access denied', 404);
  }

  // If already processed successfully, skip (idempotent)
  if (resource.processing_status === 'ready') {
    return ok({ message: 'Already processed', resource_id });
  }

  // Mark as processing (reset failed state if retrying)
  await db
    .from('resources')
    .update({ processing_status: 'processing', processing_error: null })
    .eq('id', resource_id);

  try {
    // ── Step 1: Extract content ──────────────────────────────
    const extracted = await extractContent(resource.url);

    // Merge extracted data into resource fields
    const updates: Record<string, unknown> = {
      source: extracted.source ?? resource.source,
      source_type: extracted.source_type ?? resource.source_type,
    };
    if (extracted.title && !resource.title) updates.title = extracted.title;
    if (extracted.creator) updates.creator_name = extracted.creator;
    if (extracted.thumbnail_url) updates.thumbnail_url = extracted.thumbnail_url;
    if (extracted.duration_seconds) updates.duration_seconds = extracted.duration_seconds;
    if (extracted.reading_time_minutes) updates.reading_time_minutes = extracted.reading_time_minutes;
    if (extracted.page_count) updates.page_count = extracted.page_count;
    if (extracted.published_at) updates.published_at = extracted.published_at;
    if (extracted.content_text) updates.content_text = extracted.content_text;
    if (extracted.transcript) updates.transcript = extracted.transcript;

    // ── Step 2: AI Analysis ──────────────────────────────────
    const contentForAI =
      extracted.transcript ??
      extracted.content_text ??
      resource.content_text ??
      resource.title ??
      resource.url;

    const analysis = await analyzeResource(
      updates.title as string ?? resource.title ?? resource.url,
      extracted.source ?? resource.source ?? '',
      contentForAI,
    );

    updates.ai_summary = analysis.summary;
    updates.ai_key_takeaways = analysis.concepts.slice(0, 5);
    updates.ai_concepts = analysis.concepts;
    updates.ai_keywords = analysis.keywords;
    updates.processing_status = 'ready';

    // ── Step 3: Save AI analysis to resource ─────────────────
    await db.from('resources').update(updates).eq('id', resource_id);

    // ── Step 4: Upsert topics ────────────────────────────────
    if (analysis.topics.length > 0) {
      const topicRows = analysis.topics.map(name => ({ name }));
      const { data: upsertedTopics } = await db
        .from('topics')
        .upsert(topicRows, { onConflict: 'name', ignoreDuplicates: false })
        .select('id, name');

      if (upsertedTopics?.length) {
        const resourceTopicRows = upsertedTopics.map((t: { id: string }) => ({
          resource_id,
          topic_id: t.id,
        }));
        await db
          .from('resource_topics')
          .upsert(resourceTopicRows, { onConflict: 'resource_id,topic_id', ignoreDuplicates: true });
      }
    }

    // ── Step 5: Generate and store embedding ─────────────────
    try {
      const embText = embeddingTextFor({
        title: updates.title as string ?? resource.title,
        ai_summary: analysis.summary,
        content_text: extracted.content_text,
        transcript: extracted.transcript,
        ai_concepts: analysis.concepts,
        ai_keywords: analysis.keywords,
      });

      const embedding = await generateEmbedding(embText);

      await db.from('resource_embeddings').upsert({
        resource_id,
        embedding: JSON.stringify(embedding),
        model: 'text-embedding-3-small',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'resource_id' });
    } catch (embErr) {
      // Embedding failure does not fail the whole processing step
      console.warn('[process-resource] embedding failed:', (embErr as Error).message);
    }

    // ── Step 6: Log activity event ───────────────────────────
    await db.from('activity_events').insert({
      user_id: userId,
      resource_id,
      event_type: 'added',
      metadata: { source: extracted.source, topics: analysis.topics },
    });

    return ok({ resource_id, status: 'ready', topics: analysis.topics });
  } catch (processingError) {
    const message = (processingError as Error).message;
    console.error('[process-resource] failed:', message);

    await db.from('resources').update({
      processing_status: 'failed',
      processing_error: message.slice(0, 500),
    }).eq('id', resource_id);

    return err(`Processing failed: ${message}`, 500);
  }
});
