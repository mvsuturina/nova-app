const { supabase } = require('../lib/supabase');
const { todayKey } = require('../lib/timezone');

const STATUS_EMOJI = { pending: '⬜', done: '✅', skipped: '⏩' };

async function todayCommand(ctx) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return ctx.reply('NOVA_USER_ID не задан в .env бота.');

  const { data: plan } = await supabase
    .from('goal_plans')
    .select('id, focus')
    .eq('user_id', userId)
    .eq('date', todayKey())
    .maybeSingle();

  if (!plan) return ctx.reply('План на сегодня ещё не загружен. Пришли /plan с JSON.');

  const { data: tasks, error } = await supabase
    .from('goal_plan_tasks')
    .select('id, time, title, priority, status, goals(name)')
    .eq('plan_id', plan.id)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[today]', error);
    return ctx.reply('Не удалось загрузить задачи: ' + error.message);
  }

  if (!tasks?.length) return ctx.reply('План на сегодня пуст.');

  const lines = tasks.map((t, i) => {
    const time = t.time ? t.time.slice(0, 5) + ' — ' : '';
    const goal = t.goals?.name ? ` (${t.goals.name})` : '';
    return `${i + 1}. ${STATUS_EMOJI[t.status] ?? '•'} [${t.priority}] ${time}${t.title}${goal}`;
  });

  // Кнопки для каждой задачи — не только pending, чтобы можно было отменить уже
  // закрытую (done/skipped) прямо отсюда, а не только с исходного напоминания.
  const keyboard = tasks.map((t, i) =>
    t.status === 'pending'
      ? [
          { text: `${i + 1}. ✅`, callback_data: `done:${t.id}` },
          { text: `${i + 1}. ⏩`, callback_data: `skip:${t.id}` },
        ]
      : [{ text: `${i + 1}. ↩️ Отменить`, callback_data: `undo:${t.id}` }]
  );

  const header = plan.focus ? `Фокус дня: ${plan.focus}\n\n` : '';
  ctx.reply(header + lines.join('\n'), keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : undefined);
}

module.exports = { todayCommand };
