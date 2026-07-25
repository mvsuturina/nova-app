const { supabase } = require('../lib/supabase');

// Сообщение с кнопками может относиться к одной задаче (напоминание) или сразу
// к нескольким (/today, где на каждую незакрытую задачу — своя строка кнопок).
// Меняем/убираем только строку нажатой задачи, а не весь reply_markup, иначе на
// /today клик по одной задаче задевал бы кнопки у всех остальных в том же сообщении.
async function replaceTaskRow(ctx, taskId, newRow) {
  const markup = ctx.callbackQuery.message?.reply_markup;
  if (!markup) return;
  const rows = markup.inline_keyboard.map(row =>
    row.some(btn => btn.callback_data?.endsWith(`:${taskId}`)) ? (newRow ?? []) : row
  ).filter(row => row.length);
  await ctx.editMessageReplyMarkup(rows.length ? { inline_keyboard: rows } : undefined).catch(() => {});
}

const { doneSkipRow, undoRow } = require('../lib/buttons');

// awaitingNote: Map<chatId, taskId> — общая с planInput.js, живёт в index.js
function registerCallbacks(bot, awaitingNote) {
  bot.action(/^done:(\d+)$/, async ctx => {
    const taskId = Number(ctx.match[1]);
    const { data: task, error } = await supabase
      .from('goal_plan_tasks')
      .update({ status: 'done' })
      .eq('id', taskId)
      .select('id, title, goal_id, goals(name)')
      .single();

    if (error) {
      console.error('[callback:done]', error);
      await ctx.answerCbQuery('Ошибка');
      return;
    }

    await ctx.answerCbQuery('Отмечено ✅');
    await replaceTaskRow(ctx, taskId, undoRow(taskId));

    // Задача привязана к цели с прогрессом (напр. активность) — попросить короткую заметку.
    if (task.goal_id) {
      awaitingNote.set(ctx.chat.id, taskId);
      await ctx.reply(`Коротко: как самочувствие/энергия после «${task.title}»? (можно пропустить, просто не отвечай)`);
    }
  });

  bot.action(/^later:(\d+)$/, async ctx => {
    // reminded_at не сбрасывается — задача останется без повторного напоминания,
    // но и без изменения статуса; отметить можно вручную через /today.
    const taskId = Number(ctx.match[1]);
    await ctx.answerCbQuery('Ок');
    await replaceTaskRow(ctx, taskId, null);
  });

  bot.action(/^skip:(\d+)$/, async ctx => {
    const taskId = Number(ctx.match[1]);
    const { error } = await supabase.from('goal_plan_tasks').update({ status: 'skipped' }).eq('id', taskId);
    await ctx.answerCbQuery(error ? 'Ошибка' : 'Пропущено');
    await replaceTaskRow(ctx, taskId, undoRow(taskId));
  });

  bot.action(/^undo:(\d+)$/, async ctx => {
    const taskId = Number(ctx.match[1]);
    const { error } = await supabase.from('goal_plan_tasks').update({ status: 'pending' }).eq('id', taskId);
    await ctx.answerCbQuery(error ? 'Ошибка' : 'Возвращено');
    if (error) return;
    // если ждали заметку именно по этой задаче — отменяем ожидание
    if (awaitingNote.get(ctx.chat.id) === taskId) awaitingNote.delete(ctx.chat.id);
    await replaceTaskRow(ctx, taskId, doneSkipRow(taskId));
  });
}

module.exports = { registerCallbacks };
