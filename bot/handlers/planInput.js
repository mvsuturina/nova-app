const { supabase } = require('../lib/supabase');
const { upsertPlan } = require('../lib/plan');

function requireUserId() {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) throw new Error('NOVA_USER_ID не задан в .env');
  return userId;
}

async function applyPlan(ctx, jsonText) {
  let planJson;
  try {
    planJson = JSON.parse(jsonText);
  } catch {
    return ctx.reply('Не смог разобрать JSON плана. Формат — см. README бота.');
  }

  try {
    const userId = requireUserId();
    const plan = await upsertPlan(userId, planJson);
    await ctx.reply(`План на ${plan.date} сохранён (${planJson.tasks.length} задач).`);
  } catch (err) {
    console.error('[plan]', err);
    await ctx.reply('Не удалось сохранить план: ' + err.message);
  }
}

// /plan {...json...}
async function planCommand(ctx) {
  const text = ctx.message.text.replace(/^\/plan(@\w+)?\s*/, '').trim();
  if (!text) return ctx.reply('Пришли JSON плана после команды /plan, либо просто сообщением целиком.');
  await applyPlan(ctx, text);
}

// Обычные текстовые сообщения: либо ответ-заметка после "Сделано", либо голый JSON плана.
// Возвращает true, если сообщение обработано здесь (дальше по цепочке идти не надо),
// иначе false — тогда index.js передаёт текст диалоговому ассистенту по кухне.
async function handlePlanText(ctx, awaitingNote) {
  const text = ctx.message.text?.trim();
  if (!text) return false;

  const chatId = ctx.chat.id;
  if (awaitingNote.has(chatId)) {
    const taskId = awaitingNote.get(chatId);
    awaitingNote.delete(chatId);
    const { error } = await supabase.from('goal_plan_tasks').update({ note: text }).eq('id', taskId);
    await ctx.reply(error ? 'Не удалось сохранить заметку.' : 'Заметка сохранена.');
    return true;
  }

  if (text.startsWith('{')) {
    await applyPlan(ctx, text);
    return true;
  }

  return false;
}

module.exports = { planCommand, handlePlanText };
