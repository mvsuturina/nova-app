// Отправляет Web Push уведомление нужному пользователю
// Запускается из GitHub Actions по расписанию

const webpush = require('web-push');

// Тексты уведомлений по UTC-часу (PDT = UTC-7)
const SURVEYS = {
  14: { title: 'Nova · Утро',        body: 'Время утреннего опроса 🌅' },
  16: { title: 'Nova · Отчёт',       body: 'Заполни утренний отчёт ☀️' },
  17: { title: 'Nova · Чекин 10:00', body: 'Как дела? Быстрый чекин 🌿' },
  21: { title: 'Nova · Чекин 14:00', body: 'Дневной чекин — 2 минуты ⚡' },
  23: { title: 'Nova · Чекин 16:00', body: 'Почти вечер — отметься 🌆' },
   4: { title: 'Nova · Вечер',       body: 'Подведи итог дня ✨' },
};

async function main() {
  const hour = new Date().getUTCHours();
  const survey = SURVEYS[hour];
  if (!survey) { console.log(`Нет опроса для UTC hour=${hour}`); return; }

  // Получаем подписку из Supabase
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${process.env.NOVA_USER_ID}&select=push_subscription`;
  const res  = await fetch(url, {
    headers: {
      'apikey':        process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
    },
  });
  const rows = await res.json();
  const sub  = rows[0]?.push_subscription;

  if (!sub) { console.log('Нет push-подписки в профиле'); return; }

  webpush.setVapidDetails(
    'mailto:nova@app.local',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );

  const payload = JSON.stringify({ title: survey.title, body: survey.body });
  const subObj  = typeof sub === 'string' ? JSON.parse(sub) : sub;

  try {
    await webpush.sendNotification(subObj, payload);
    console.log(`✓ Отправлено: ${survey.title}`);
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Подписка истекла — удаляем из профиля
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${process.env.NOVA_USER_ID}`,
        {
          method: 'PATCH',
          headers: {
            'apikey':        process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ push_subscription: null }),
        }
      );
      console.log('Подписка устарела — удалена из профиля');
    } else {
      throw err;
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
