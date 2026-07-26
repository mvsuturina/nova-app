const { isConfigured } = require('../lib/googleSheets');
const { askPantryAgent } = require('../lib/pantryAgent');

async function receiptPhotoHandler(ctx) {
  if (!isConfigured() || !process.env.ANTHROPIC_API_KEY) {
    return ctx.reply('Ассистент по кухне ещё не настроен — см. .env (GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON / ANTHROPIC_API_KEY).');
  }

  await ctx.sendChatAction('typing').catch(() => {});
  try {
    const sizes = ctx.message.photo;
    const largest = sizes[sizes.length - 1]; // Telegram отдаёт по возрастанию размера
    const fileUrl = await ctx.telegram.getFileLink(largest.file_id);

    // Скачиваем байты сами — не передаём Claude ссылку с токеном бота внутри пути.
    const res = await fetch(fileUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const base64 = buf.toString('base64');

    const caption = ctx.message.caption?.trim();
    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      {
        type: 'text',
        text: caption || 'Вот фото — это может быть чек/накладная с несколькими позициями, ИЛИ фото одного товара (упаковка/этикетка/штрихкод). Распознай, что это, и добавь/обнови соответствующие позиции в остатках.',
      },
    ];

    const reply = await askPantryAgent(ctx.chat.id, userContent);
    await ctx.reply(reply);
  } catch (err) {
    console.error('[receiptPhoto]', err);
    await ctx.reply('Не получилось обработать фото: ' + err.message);
  }
}

module.exports = { receiptPhotoHandler };
