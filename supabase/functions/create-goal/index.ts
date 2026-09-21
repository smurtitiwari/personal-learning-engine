// ============================================================
// create-goal Edge Function
// Creates a goal and uses AI to identify relevant learning topics.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, getUserId, ok, err, corsHeaders } from '../_shared/supabase-client.ts';
import { analyzeGoal } from '../_shared/ai.ts';

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

  let body: { title: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { title, description } = body;
  if (!title?.trim()) return err('title is required', 400);

  const db = getSupabaseAdmin();

  // ── Step 1: AI identifies relevant topics ────────────────
  let aiAnalysis = { topics: [] as string[], rationale: '' };
  try {
    aiAnalysis = await analyzeGoal(title.trim());
  } catch (e) {
    console.warn('[create-goal] AI analysis failed, proceeding without topics:', e);
  }

  // ── Step 2: Create the goal ──────────────────────────────
  const { data: goal, error: goalErr } = await db
    .from('goals')
    .insert({
      user_id: userId,
      title: title.trim(),
      description: description?.trim() ?? null,
      ai_rationale: aiAnalysis.rationale || null,
      status: 'active',
    })
    .select()
    .single();

  if (goalErr || !goal) {
    return err(goalErr?.message ?? 'Failed to create goal', 500);
  }

  // ── Step 3: Upsert topics and link to goal ───────────────
  const areas: string[] = [];
  if (aiAnalysis.topics.length > 0) {
    const topicRows = aiAnalysis.topics.map(name => ({ name }));
    const { data: upsertedTopics, error: topicErr } = await db
      .from('topics')
      .upsert(topicRows, { onConflict: 'name', ignoreDuplicates: false })
      .select('id, name');

    if (!topicErr && upsertedTopics?.length) {
      const goalTopicRows = upsertedTopics.map((t: { id: string }) => ({
        goal_id: goal.id,
        topic_id: t.id,
      }));
      await db
        .from('goal_topics')
        .upsert(goalTopicRows, { onConflict: 'goal_id,topic_id', ignoreDuplicates: true });

      areas.push(...upsertedTopics.map((t: { name: string }) => t.name));
    }
  }

  return ok({
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    areas,
    reason: aiAnalysis.rationale || null,
    resource_count: 0,
    completed_count: 0,
    learning_seconds: 0,
    topic_coverage: {},
    knowledge_gaps: areas,
    focus_area: areas[0] ?? null,
    created_at: goal.created_at,
    updated_at: goal.updated_at,
  }, 201);
});
