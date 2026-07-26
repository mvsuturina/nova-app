require('dotenv').config();
const { Telegraf } = require('telegraf');

const { startCommand } = require('./handlers/start');
const { planCommand, handlePlanText } = require('./handlers/planInput');
const { todayCommand } = require('./handlers/today');
const { progressCommand } = require('./handlers/progress');
const { goalsCommand } = require('./handlers/goals');
const { registerCallbacks } = require('./handlers/callbacks');
const { pantryChatHandler, cookCommand, shoppingCommand } = require('./handlers/pantryChat');
const { receiptPhotoHandler } = require('./handlers/receiptPhoto');
const { startReminders } = require('./lib/reminders');
const { startNudges } = require('./lib/nudges');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env — см. README.md');

// Дефолтный таймаут Telegraf на обработку одного апдейта — 90 секунд; разбор чека с
// tool use + web search может легко занять дольше. Поднимаем, чтобы длинная обработка
// не считалась фатальной ошибкой и не роняла bot.launch().
const bot = new Telegraf(token, { handlerTimeout: 5 * 60 * 1000 });

// chatId -> taskId: ждём текстовую заметку после нажатия "Сделано" на задаче с целью.
const awaitingNote = new Map();

bot.start(startCommand);
bot.command('plan', planCommand);
bot.command('today', todayCommand);
bot.command('progress', progressCommand);
bot.command('goals', goalsCommand);
bot.command('cook', cookCommand);
bot.command('shopping', shoppingCommand);

registerCallbacks(bot, awaitingNote);

// Должен идти после всех bot.command(...) — иначе он не будет вызван для команд,
// т.к. Telegraf останавливает цепочку на первом сработавшем обработчике.
// Свободный текст, не распознанный модулем целей (не JSON-план, не заметка) —
// уходит диалоговому ассистенту по кухне (Claude + Google Sheets, см. handlers/pantryChat.js).
bot.on('text', async ctx => {
  const handled = await handlePlanText(ctx, awaitingNote);
  if (!handled) await pantryChatHandler(ctx);
});

bot.on('photo', receiptPhotoHandler);

startReminders(bot);
startNudges(bot);

bot.launch()
  .then(() => console.log('bot.launch() resolved (бот остановлен)'))
  .catch(err => console.error('bot.launch() упал с ошибкой:', err));

bot.telegram.getMe()
  .then(me => console.log('NOVA bot запущен (long polling), username:', me.username))
  .catch(err => console.error('getMe() не удался:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
