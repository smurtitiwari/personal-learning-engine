import { Router } from 'express';
import { supabase, getUserId } from '../db/supabase.js';
import { createError } from '../middleware/error.js';

const router = Router();

// GET /api/analytics
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

    const [
      { count: total_resources },
      { count: completed_resources },
      { count: in_progress_resources },
      { count: resources_added_week },
      activityData,
    ] = await Promise.all([
      supabase.from('resources').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
      supabase.from('resources').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null).not('completed_at', 'is', null),
      supabase.from('resources').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null).gt('progress_percentage', 0).is('completed_at', null),
      supabase.from('resources').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null).gte('saved_at', weekStart.toISOString()),
      supabase.from('activity_events').select('duration_seconds, created_at').eq('user_id', userId).gte('created_at', monthStart.toISOString()),
    ]);

    const events = activityData.data ?? [];
    const total_seconds = events.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
    const today_seconds = events.filter(e => e.created_at >= todayStart.toISOString()).reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
    const week_seconds = events.filter(e => e.created_at >= weekStart.toISOString()).reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
    const month_seconds = total_seconds;

    // Resources explored this week (opened/progressed)
    const { count: resources_explored_week } = await supabase
      .from('activity_events')
      .select('resource_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('event_type', ['opened', 'progressed', 'completed'])
      .gte('created_at', weekStart.toISOString());

    res.json({
      data: {
        total_resources: total_resources ?? 0,
        completed_resources: completed_resources ?? 0,
        in_progress_resources: in_progress_resources ?? 0,
        total_seconds,
        today_seconds,
        week_seconds,
        month_seconds,
        resources_added_week: resources_added_week ?? 0,
        resources_explored_week: resources_explored_week ?? 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/weekly
router.get('/weekly', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      days.push(d);
    }

    const { data: events } = await supabase
      .from('activity_events')
      .select('duration_seconds, created_at')
      .eq('user_id', userId)
      .gte('created_at', days[0].toISOString());

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const result = days.map(day => {
      const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
      const seconds = (events ?? [])
        .filter(e => e.created_at >= day.toISOString() && e.created_at <= dayEnd.toISOString())
        .reduce((s, e) => s + (e.duration_seconds ?? 0), 0);
      return {
        date: day.toISOString().split('T')[0],
        day: dayNames[day.getDay()],
        seconds,
      };
    });

    res.json({ data: result });
  } catch (err) { next(err); }
});

// GET /api/analytics/topics
router.get('/topics', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const { data: topicData, error } = await supabase.rpc('get_topic_analytics', { p_user_id: userId });
    if (error) throw createError(error.message, 500);

    const rows = topicData ?? [];
    const total = rows.reduce((s, r) => s + Number(r.count), 0);

    const result = rows.map(r => ({
      topic: r.topic,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
      recent_count: Number(r.recent_count),
      trend: Number(r.recent_count) > Number(r.count) * 0.4 ? 'rising' : 'stable',
    }));

    // Simple insight
    const topTopic = result[0];
    const insight = topTopic
      ? `You focus most on ${topTopic.topic} (${topTopic.count} resources). ${result.length > 1 ? `${result[1].topic} is your second most explored area.` : ''}`
      : 'Add resources to see topic insights.';

    res.json({ data: result, insight });
  } catch (err) { next(err); }
});

export default router;
