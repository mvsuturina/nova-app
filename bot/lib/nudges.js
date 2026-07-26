// Мягкие подсказки — правила поверх уже существующих данных NOVA, без ИИ и без
// новых таблиц. Три проверки раз в день в фиксированное время: если к этому часу
// пункт ещё не закрыт — одно короткое сообщение, иначе тишина. Время подобрано
// на глаз (14:00/18:00/19:00 по NOVA_TIMEZONE) — легко поменять, если неудобно.
const cron = require('node-cron');
const { supabase } = require('./supabase');
const { todayKey, TZ } = require('./timezone');

async function getGoalId(userId, name) {
  const { data } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();
  return data?.id ?? null;
}

async function isGoalDoneToday(userId, goalName) {
  const goalId = await getGoalId(userId, goalName);
  if (!goalId) return false;

  const { data: plan } = await supabase
    .from('goal_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('date', todayKey())
    .maybeSingle();
  if (!plan) return false;

  const { count } = await supabase
    .from('goal_plan_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', plan.id)
    .eq('goal_id', goalId)
    .eq('status', 'done');

  return (count ?? 0) > 0;
}

async function sendNudge(userId, bot, text) {
  const { data: link } = await supabase
    .from('telegram_links')
    .select('telegram_chat_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!link) return;
  await bot.telegram.sendMessage(link.telegram_chat_id, text);
}

async function checkWaterNudge(bot) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return;

  const { count } = await supabase
    .from('water_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', todayKey());

  if ((count ?? 0) < 4) {
    await sendNudge(userId, bot, '💧 К этому часу обычно уже несколько стаканов воды — если давно не пила, самое время.');
  }
}

async function checkActivityNudge(bot) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return;

  const { count: activityCount } = await supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', todayKey());
  if ((activityCount ?? 0) > 0) return;

  if (await isGoalDoneToday(userId, 'Активность')) return;

  await sendNudge(userId, bot, '🧘 Сегодня ещё не было никакой активности — необязательно тренировка, можно просто размяться или пройтись.');
}

async function checkEnglishNudge(bot) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return;

  if (await isGoalDoneToday(userId, 'Английский C1')) return;

  await sendNudge(userId, bot, '🇬🇧 Английского сегодня ещё не было — 10-15 минут чего угодно на английском засчитаются.');
}

function startNudges(bot) {
  const wrap = (fn, label) => () => fn(bot).catch(err => console.error(`[nudge:${label}]`, err));
  cron.schedule('0 14 * * *', wrap(checkWaterNudge, 'water'), { timezone: TZ });
  cron.schedule('0 18 * * *', wrap(checkActivityNudge, 'activity'), { timezone: TZ });
  cron.schedule('0 19 * * *', wrap(checkEnglishNudge, 'english'), { timezone: TZ });
}

module.exports = { startNudges, checkWaterNudge, checkActivityNudge, checkEnglishNudge };
