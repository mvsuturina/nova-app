const { isConfigured } = require('../lib/googleSheets');
const { askPantryAgent } = require('../lib/pantryAgent');

async function askAndReply(ctx, content) {
  if (!isConfigured()) {
    return ctx.reply('Ассистент по кухне ещё не настроен: не заданы GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON в .env.');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return ctx.reply('ANTHROPIC_API_KEY не задан в .env.');
  }

  await ctx.sendChatAction('typing').catch(() => {});
  try {
    const reply = await askPantryAgent(ctx.chat.id, content);
    await ctx.reply(reply);
  } catch (err) {
    console.error('[pantryChat]', err);
    await ctx.reply('Не получилось обработать запрос: ' + err.message);
  }
}

const pantryChatHandler = ctx => askAndReply(ctx, ctx.message.text);
const cookCommand = ctx => askAndReply(ctx, 'Что приготовить на этой неделе, учитывая текущие остатки и мои предпочтения?');
const shoppingCommand = ctx => askAndReply(ctx, 'Составь список покупок: сравни текущие остатки с минимумами и с тем, что нужно докупить.');

module.exports = { pantryChatHandler, cookCommand, shoppingCommand };
