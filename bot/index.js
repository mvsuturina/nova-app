require('dotenv').config();
const { Telegraf } = require('telegraf');

const { startCommand } = require('./handlers/start');
const { planCommand, handlePlanText } = require('./handlers/planInput');
const { todayCommand } = require('./handlers/today');
const { progressCommand } = require('./handlers/progress');
const { goalsCommand } = require('./handlers/goals');
const { registerCallbacks } = require('./handlers/callbacks');
const { startReminders } = require('./lib/reminders');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env — см. README.md');

const bot = new Telegraf(token);

// chatId -> taskId: ждём текстовую заметку после нажатия "Сделано" на задаче с целью.
const awaitingNote = new Map();

bot.start(startCommand);
bot.command('plan', planCommand);
bot.command('today', todayCommand);
bot.command('progress', progressCommand);
bot.command('goals', goalsCommand);

registerCallbacks(bot, awaitingNote);

// Должен идти после всех bot.command(...) — иначе он не будет вызван для команд,
// т.к. Telegraf останавливает цепочку на первом сработавшем обработчике.
bot.on('text', ctx => handlePlanText(ctx, awaitingNote));

startReminders(bot);

bot.launch()
  .then(() => console.log('bot.launch() resolved (бот остановлен)'))
  .catch(err => console.error('bot.launch() упал с ошибкой:', err));

bot.telegram.getMe()
  .then(me => console.log('NOVA bot запущен (long polling), username:', me.username))
  .catch(err => console.error('getMe() не удался:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
