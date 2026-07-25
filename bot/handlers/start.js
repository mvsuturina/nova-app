const { supabase } = require('../lib/supabase');

async function startCommand(ctx) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return ctx.reply('NOVA_USER_ID не задан в .env бота — см. README.');

  const { error } = await supabase
    .from('telegram_links')
    .upsert({ user_id: userId, telegram_chat_id: ctx.chat.id }, { onConflict: 'telegram_chat_id' });

  if (error) {
    console.error('[start]', error);
    return ctx.reply('Не удалось привязать чат: ' + error.message);
  }

  ctx.reply(
    'Готово, этот чат привязан к NOVA.\n\n' +
    'Команды:\n' +
    '/plan — прислать план дня (JSON)\n' +
    '/today — задачи на сегодня\n' +
    '/progress — сводка за неделю\n' +
    '/goals — список целей'
  );
}

module.exports = { startCommand };
