const { supabase } = require('../lib/supabase');
const { todayKey } = require('../lib/timezone');

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h > 0 ? h + 'ч ' : ''}${m}м`;
}

async function progressCommand(ctx) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return ctx.reply('NOVA_USER_ID не задан в .env бота.');

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  const fromKey = todayKey(from);
  const toKey = todayKey(today);

  const { data: plans, error: plansErr } = await supabase
    .from('goal_plans')
    .select('id')
    .eq('user_id', userId)
    .gte('date', fromKey)
    .lte('date', toKey);

  if (plansErr) {
    console.error('[progress]', plansErr);
    return ctx.reply('Не удалось загрузить сводку: ' + plansErr.message);
  }
  if (!plans?.length) return ctx.reply(`Нет данных за ${fromKey}–${toKey}.`);

  const { data: tasks, error: tasksErr } = await supabase
    .from('goal_plan_tasks')
    .select('status, duration_minutes, goal_id, goals(name)')
    .in('plan_id', plans.map(p => p.id));

  if (tasksErr) {
    console.error('[progress]', tasksErr);
    return ctx.reply('Не удалось загрузить сводку: ' + tasksErr.message);
  }

  const byGoal = new Map();
  for (const t of tasks ?? []) {
    const key = t.goal_id ?? 'none';
    if (!byGoal.has(key)) {
      byGoal.set(key, { name: t.goals?.name ?? 'Без цели', done: 0, total: 0, minutes: 0 });
    }
    const g = byGoal.get(key);
    g.total += 1;
    if (t.status === 'done') {
      g.done += 1;
      g.minutes += t.duration_minutes || 0;
    }
  }

  const lines = [...byGoal.values()].map(g => {
    const dur = formatDuration(g.minutes);
    return `${g.name}: ${g.done} из ${g.total}${dur ? ', ' + dur : ''}`;
  });

  ctx.reply(`📊 Сводка за ${fromKey}–${toKey}\n\n${lines.join('\n')}`);
}

module.exports = { progressCommand };
