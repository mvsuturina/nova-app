const cron = require('node-cron');
const { supabase } = require('./supabase');
const { todayKey, nowHHMM } = require('./timezone');

const WINDOW_MINUTES = 5; // окно "сейчас ± N минут"

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function checkAndSendReminders(bot) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return;

  const { data: plan } = await supabase
    .from('goal_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('date', todayKey())
    .maybeSingle();
  if (!plan) return;

  const { data: tasks, error } = await supabase
    .from('goal_plan_tasks')
    .select('id, time, title, priority, goals(name)')
    .eq('plan_id', plan.id)
    .eq('remind', true)
    .eq('status', 'pending')
    .is('reminded_at', null)
    .not('time', 'is', null);
  if (error || !tasks?.length) return;

  const nowMinutes = toMinutes(nowHHMM());
  const due = tasks.filter(t => Math.abs(nowMinutes - toMinutes(t.time.slice(0, 5))) <= WINDOW_MINUTES);
  if (!due.length) return;

  const { data: link } = await supabase
    .from('telegram_links')
    .select('telegram_chat_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!link) return;

  for (const t of due) {
    const text = `⏰ ${t.time.slice(0, 5)} — ${t.title}\nПриоритет: ${t.priority}${t.goals?.name ? ' · Цель: ' + t.goals.name : ''}`;

    await bot.telegram.sendMessage(link.telegram_chat_id, text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Сделано', callback_data: `done:${t.id}` },
          { text: '⏭ Позже', callback_data: `later:${t.id}` },
          { text: '⏩ Пропустить', callback_data: `skip:${t.id}` },
        ]],
      },
    });

    await supabase
      .from('goal_plan_tasks')
      .update({ reminded_at: new Date().toISOString() })
      .eq('id', t.id);
  }
}

function startReminders(bot) {
  cron.schedule('* * * * *', () => {
    checkAndSendReminders(bot).catch(err => console.error('[reminders]', err));
  });
}

module.exports = { startReminders };
