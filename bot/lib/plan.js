const { supabase } = require('./supabase');
const { todayKey, tomorrowKey } = require('./timezone');

// Формат planJson — см. bot/README.md:
// { date, focus?, tasks: [{ time?, title, priority, goal_id?, remind? }] }
//
// date: "today" | "tomorrow" | "YYYY-MM-DD". "today"/"tomorrow" рекомендуются —
// дата резолвится самим ботом по NOVA_TIMEZONE, а не вычисляется человеком на
// глаз по часам того устройства, с которого он пишет боту (на разных устройствах
// может быть выставлена разная TZ).
function resolveDate(date) {
  if (date === 'today') return todayKey();
  if (date === 'tomorrow') return tomorrowKey();
  return date;
}

async function upsertPlan(userId, planJson) {
  const date = resolveDate(planJson.date);
  const { focus, tasks } = planJson;
  if (!date || !Array.isArray(tasks)) {
    throw new Error('план должен содержать "date" ("today" / "tomorrow" / "YYYY-MM-DD") и массив "tasks"');
  }

  const { data: plan, error: planErr } = await supabase
    .from('goal_plans')
    .upsert({ user_id: userId, date, focus: focus ?? null }, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (planErr) throw planErr;

  // Полная замена задач плана — план всегда приходит целиком.
  const { error: delErr } = await supabase
    .from('goal_plan_tasks')
    .delete()
    .eq('plan_id', plan.id);
  if (delErr) throw delErr;

  if (tasks.length > 0) {
    const rows = tasks.map(t => ({
      plan_id: plan.id,
      goal_id: t.goal_id ?? null,
      time: t.time ?? null,
      title: t.title,
      priority: t.priority,
      remind: t.remind ?? true,
    }));

    const { error: insErr } = await supabase.from('goal_plan_tasks').insert(rows);
    if (insErr) throw insErr;
  }

  return plan;
}

module.exports = { upsertPlan };
