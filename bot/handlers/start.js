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
    '/progress [week|month|year] — сводка за период (по умолчанию неделя)\n' +
    '/goals — список целей\n\n' +
    'Ассистент по кухне (Claude + Google Sheets):\n' +
    '/cook — что приготовить на неделе\n' +
    '/shopping — список покупок\n' +
    'Фото чека/накладной — распознает и обновит остатки\n' +
    'Или просто напиши вопрос своими словами — например «что у меня есть на кухне?»'
  );
}

module.exports = { startCommand };
