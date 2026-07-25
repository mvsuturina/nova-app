const { supabase } = require('../lib/supabase');

async function goalsCommand(ctx) {
  const userId = process.env.NOVA_USER_ID;
  if (!userId) return ctx.reply('NOVA_USER_ID не задан в .env бота.');

  const { data, error } = await supabase
    .from('goals')
    .select('name, status, deadline')
    .eq('user_id', userId)
    .order('status');

  if (error) {
    console.error('[goals]', error);
    return ctx.reply('Не удалось загрузить цели: ' + error.message);
  }
  if (!data?.length) return ctx.reply('Целей пока нет.');

  const lines = data.map(g => `• ${g.name} [${g.status}]${g.deadline ? ' — до ' + g.deadline : ''}`);
  ctx.reply(lines.join('\n'));
}

module.exports = { goalsCommand };
