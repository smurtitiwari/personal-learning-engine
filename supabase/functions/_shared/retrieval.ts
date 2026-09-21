// ============================================================
// Semantic and keyword retrieval — shared by recommendations and Ask AI
// ============================================================
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateEmbedding } from './embeddings.ts';

export interface RetrievedResource {
  id: string;
  title: string;
  source_type: string;
  creator_name?: string;
  ai_summary?: string;
  topics: string[];
  similarity?: number;
}

// Semantic search using pgvector
export async function semanticSearch(
  db: SupabaseClient,
  userId: string,
  query: string,
  limit = 6,
  threshold = 0.65,
): Promise<RetrievedResource[]> {
  const embedding = await generateEmbedding(query);
  const { data, error } = await db.rpc('search_resources_by_embedding', {
    p_user_id: userId,
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
    p_threshold: threshold,
  });
  if (error) {
    console.warn('[retrieval] semantic search failed:', error.message);
    return [];
  }
  if (!data?.length) return [];

  // Hydrate with full resource data
  const ids = (data as Array<{ resource_id: string }>).map(r => r.resource_id);
  const simMap = new Map((data as Array<{ resource_id: string; similarity: number }>)
    .map(r => [r.resource_id, r.similarity]));

  const { data: resources } = await db
    .from('resources')
    .select(`
      id, title, source_type, creator_name, ai_summary,
      resource_topics(topics(name))
    `)
    .in('id', ids)
    .is('deleted_at', null);

  return (resources ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    title: r.title as string,
    source_type: r.source_type as string,
    creator_name: r.creator_name as string | undefined,
    ai_summary: r.ai_summary as string | undefined,
    topics: extractTopicNames(r.resource_topics),
    similarity: simMap.get(r.id as string),
  }));
}

// Topic-based keyword search (fallback when no embeddings)
export async function topicSearch(
  db: SupabaseClient,
  userId: string,
  topics: string[],
  limit = 8,
): Promise<RetrievedResource[]> {
  if (!topics.length) return [];

  const { data: topicRows } = await db
    .from('topics')
    .select('id')
    .in('name', topics);

  const topicIds = (topicRows ?? []).map((t: { id: string }) => t.id);
  if (!topicIds.length) return [];

  const { data } = await db
    .from('resource_topics')
    .select(`
      resources!inner(
        id, title, source_type, creator_name, ai_summary,
        user_id, deleted_at, processing_status
      ),
      topics(name)
    `)
    .in('topic_id', topicIds)
    .eq('resources.user_id', userId)
    .is('resources.deleted_at', null)
    .eq('resources.processing_status', 'ready')
    .limit(limit * 2);

  // Deduplicate by resource id and sort by how many topics match
  const countMap = new Map<string, { res: Record<string, unknown>; count: number; topicNames: string[] }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const res = row.resources as Record<string, unknown>;
    const id = res.id as string;
    const existing = countMap.get(id);
    const topicName = (row.topics as { name: string }).name;
    if (existing) {
      existing.count++;
      existing.topicNames.push(topicName);
    } else {
      countMap.set(id, { res, count: 1, topicNames: [topicName] });
    }
  }

  return Array.from(countMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ res, topicNames }) => ({
      id: res.id as string,
      title: res.title as string,
      source_type: res.source_type as string,
      creator_name: res.creator_name as string | undefined,
      ai_summary: res.ai_summary as string | undefined,
      topics: topicNames,
    }));
}

// Get user's most frequent topics
export async function getUserTopTopics(
  db: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<Array<{ topic: string; count: number; recent_count: number }>> {
  const { data, error } = await db.rpc('get_topic_analytics', { p_user_id: userId });
  if (error || !data) return [];
  return (data as Array<{ topic: string; count: number; recent_count: number }>).slice(0, limit);
}

// Get user's goal topics
export async function getGoalTopics(
  db: SupabaseClient,
  userId: string,
  goalId?: string,
): Promise<string[]> {
  let query = db
    .from('goal_topics')
    .select('goals!inner(user_id, status), topics(name)')
    .eq('goals.user_id', userId)
    .eq('goals.status', 'active');

  if (goalId) query = query.eq('goal_id', goalId);

  const { data } = await query;
  return [...new Set((data ?? []).map((r: Record<string, unknown>) => (r.topics as { name: string }).name))];
}

function extractTopicNames(resource_topics: unknown): string[] {
  if (!Array.isArray(resource_topics)) return [];
  return resource_topics
    .map((rt: unknown) => {
      if (typeof rt === 'object' && rt !== null && 'topics' in rt) {
        const t = (rt as { topics: unknown }).topics;
        if (typeof t === 'object' && t !== null && 'name' in t) {
          return (t as { name: string }).name;
        }
      }
      return null;
    })
    .filter((n): n is string => n !== null);
}
