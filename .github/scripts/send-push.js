// Отправляет Web Push уведомление нужному пользователю
// Запускается из GitHub Actions по расписанию

const webpush = require('web-push');

// Расписание в минутах от полуночи UTC (PDT = UTC-7)
const SURVEYS = [
  { min: 10 * 60 + 58, title: 'Nova · Утренний опрос',  body: 'Доброе утро — заполни опрос 🌅' },
  { min: 14 * 60 +  0, title: 'Nova · Утренний отчёт',  body: 'Время утреннего отчёта ☀️'     },
  { min: 17 * 60 +  0, title: 'Nova · Чекин 10:00',     body: 'Как дела? Быстрый чекин 🌿'    },
  { min: 20 * 60 +  0, title: 'Nova · Чекин 13:00',     body: 'Дневной чекин — 2 минуты ⚡'   },
  { min: 23 * 60 +  0, title: 'Nova · Чекин 16:00',     body: 'Почти вечер — отметься 🌆'     },
  { min:  2 * 60 + 30, title: 'Nova · Вечерний отчёт',  body: 'Подведи итог дня ✨'            },
];

function minuteDiff(a, b) {
  const d = Math.abs(a - b);
  return d > 720 ? 1440 - d : d; // учитываем переход через полночь
}

async function main() {
  const now = new Date();
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  console.log(`UTC ${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2,'0')} (${currentMin} мин)`);

  const closest = SURVEYS.reduce((best, s) => {
    const d = minuteDiff(currentMin, s.min);
    return (!best || d < best.diff) ? { ...s, diff: d } : best;
  }, null);

  const survey = (closest && closest.diff <= 75)
    ? closest
    : (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
        ? { title: 'Nova · Тест', body: 'Уведомления работают ✓' }
        : null);

  if (!survey) { console.log(`Нет опроса — ближайший через ${closest.diff} мин`); return; }
  console.log(`→ ${survey.title} (отклонение ${closest?.diff ?? 0} мин)`);


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
  console.log('Subscription endpoint:', typeof sub === 'string' ? JSON.parse(sub).endpoint : sub.endpoint);

  webpush.setVapidDetails(
    'mailto:mayv666@gmail.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );

  const payload = JSON.stringify({ title: survey.title, body: survey.body });
  const subObj  = typeof sub === 'string' ? JSON.parse(sub) : sub;

  try {
    await webpush.sendNotification(subObj, payload);
    console.log(`✓ Отправлено: ${survey.title}`);
  } catch (err) {
    console.error('Push error statusCode:', err.statusCode);
    console.error('Push error body:', err.body);
    console.error('Push error message:', err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
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
