// ============================================================
// generate-recommendations Edge Function
// ONE recommendation engine for both Discover and Goals.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, getUserId, ok, err, corsHeaders } from '../_shared/supabase-client.ts';
import { rankRecommendations } from '../_shared/ai.ts';
import { getUserTopTopics, getGoalTopics } from '../_shared/retrieval.ts';

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

  // Optional: goal_id to generate goal-specific recommendations
  const url = new URL(req.url);
  const goalId = url.searchParams.get('goal_id') ?? undefined;

  const db = getSupabaseAdmin();

  // ── Step 1: Build user learning context ──────────────────────
  const [topTopics, goalTopics, recentResources, activeGoals] = await Promise.all([
    getUserTopTopics(db, userId, 15),
    getGoalTopics(db, userId, goalId),
    getRecentResources(db, userId),
    getActiveGoals(db, userId),
  ]);

  if (topTopics.length === 0 && goalTopics.length === 0) {
    // No data yet — return empty list gracefully
    return ok([]);
  }

  // ── Step 2: Identify gaps ────────────────────────────────────
  const exploredTopics = new Set(topTopics.map(t => t.topic));
  const lessExplored = goalTopics.filter(t => !exploredTopics.has(t));
  const allRelevant = [...new Set([...goalTopics, ...topTopics.map(t => t.topic)])];

  // ── Step 3: Build candidates ─────────────────────────────────
  const candidates: Array<{ topic: string; gap_score: number; goal_relevance: number }> = [];

  for (const topic of allRelevant.slice(0, 20)) {
    const topicData = topTopics.find(t => t.topic === topic);
    const isGoalTopic = goalTopics.includes(topic);
    const isLessExplored = lessExplored.includes(topic);
    const recentCount = topicData?.recent_count ?? 0;
    const totalCount = topicData?.count ?? 0;

    // Gap score: higher = less explored relative to goal relevance
    const gap_score = isLessExplored ? 0.9 : Math.max(0, 1 - recentCount / Math.max(totalCount, 1));
    const goal_relevance = isGoalTopic ? 1.0 : 0.3;

    candidates.push({ topic, gap_score, goal_relevance });
  }

  if (candidates.length === 0) return ok([]);

  // ── Step 4: Build context string for AI ──────────────────────
  const userContext = buildUserContext(topTopics, goalTopics, activeGoals, recentResources);

  // ── Step 5: AI ranks and explains candidates ─────────────────
  let ranked: Array<{ topic: string; score: number; reason: string; reason_detail: string }>;
  try {
    ranked = await rankRecommendations(candidates, userContext, 8);
  } catch (e) {
    console.warn('[generate-recommendations] AI ranking failed, using heuristic ranking:', e);
    ranked = candidates
      .sort((a, b) => (b.goal_relevance + b.gap_score) - (a.goal_relevance + a.gap_score))
      .slice(0, 8)
      .map(c => ({
        topic: c.topic,
        score: (c.goal_relevance + c.gap_score) / 2,
        reason: `Relevant to your ${goalId ? 'goal' : 'learning areas'}`,
        reason_detail: '',
      }));
  }

  // ── Step 6: Delete old active recommendations for this user ──
  // (Re-generating refreshes the list)
  const deleteQuery = db
    .from('recommendations')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (goalId) {
    await deleteQuery.eq('goal_id', goalId);
  } else {
    await deleteQuery.is('goal_id', null);
  }

  // ── Step 7: Insert new recommendations ───────────────────────
  const newRecs = ranked.map(r => ({
    user_id: userId,
    goal_id: goalId ?? null,
    title: r.topic,
    source_type: 'article',
    topics: [r.topic],
    score: Math.min(1, Math.max(0, r.score)),
    reason: r.reason,
    reason_detail: r.reason_detail,
    score_breakdown: { goal_relevance: candidates.find(c => c.topic === r.topic)?.goal_relevance ?? 0 },
    recommendation_type: goalId ? 'goal' : 'general',
    status: 'active' as const,
    generated_at: new Date().toISOString(),
  }));

  const { data: inserted, error: insertErr } = await db
    .from('recommendations')
    .insert(newRecs)
    .select();

  if (insertErr) {
    console.error('[generate-recommendations] insert failed:', insertErr.message);
    return err('Failed to save recommendations', 500);
  }

  // Return in the shape the frontend expects
  return ok(formatRecommendations(inserted ?? []));
});

// ── Helpers ───────────────────────────────────────────────────

async function getRecentResources(db: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data } = await db
    .from('resources')
    .select('id, title, source_type, ai_summary')
    .eq('user_id', userId)
    .eq('processing_status', 'ready')
    .is('deleted_at', null)
    .order('saved_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getActiveGoals(db: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data } = await db
    .from('goals')
    .select('id, title, ai_rationale, goal_topics(topics(name))')
    .eq('user_id', userId)
    .eq('status', 'active');
  return data ?? [];
}

function buildUserContext(
  topTopics: Array<{ topic: string; count: number; recent_count: number }>,
  goalTopics: string[],
  activeGoals: unknown[],
  recentResources: unknown[],
): string {
  const parts: string[] = [];

  if (topTopics.length) {
    parts.push(`Top learning topics (by frequency): ${topTopics.slice(0, 8).map(t => `${t.topic} (${t.count} resources, ${t.recent_count} recent)`).join(', ')}`);
  }

  if (goalTopics.length) {
    parts.push(`Goal-related topics: ${goalTopics.join(', ')}`);
  }

  if (activeGoals.length) {
    const goalTitles = (activeGoals as Array<{ title: string }>).map(g => g.title).join(', ');
    parts.push(`Active learning goals: ${goalTitles}`);
  }

  if (recentResources.length) {
    const titles = (recentResources as Array<{ title?: string }>)
      .map(r => r.title).filter(Boolean).slice(0, 5).join(', ');
    if (titles) parts.push(`Recently saved: ${titles}`);
  }

  return parts.join('\n') || 'New user with no learning history yet';
}

function formatRecommendations(recs: Array<Record<string, unknown>>) {
  return recs.map(r => ({
    id: r.id,
    title: r.title,
    url: r.url ?? null,
    source_type: r.source_type ?? 'article',
    creator_name: r.creator_name ?? null,
    description: r.reason_detail ?? r.reason ?? '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    score: Number(r.score),
    reason: r.reason ?? '',
    reason_detail: r.reason_detail ?? '',
    score_breakdown: r.score_breakdown ?? {},
    generated_at: r.generated_at,
  }));
}
