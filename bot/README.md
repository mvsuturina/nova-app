# NOVA goals bot

Отдельный Node-процесс. Не часть SPA, не Service Worker, не деплоится вместе с
`index.html`/`sw.js`. Единственный компонент проекта с доступом через Supabase
**service role key** (обходит RLS) — читает/пишет `goals`, `goal_plans`,
`goal_plan_tasks`, `telegram_links` напрямую.

## Перед первым запуском

1. Убедись, что миграция `../sql/20260725_add_goals_module.sql` уже применена в
   Supabase (после дампа боевых данных — см. CLAUDE.md проекта, раздел
   «Безопасность данных и работа со схемой»).
2. Создай бота через [@BotFather](https://t.me/BotFather) → `/newbot` → получишь
   `TELEGRAM_BOT_TOKEN`. Для тестов — заведи отдельного тестового бота, не тот,
   что пойдёт в прод.
3. Возьми `SUPABASE_SERVICE_ROLE_KEY` в Supabase Dashboard → Project Settings →
   API → `service_role` (не anon key).

## Локальный запуск

```bash
cd bot
npm install
cp .env.example .env
# заполнить .env: SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, NOVA_USER_ID
npm start
```

В Telegram: `/start` у бота → привяжет чат к `NOVA_USER_ID` (запись в
`telegram_links`). Дальше `/plan`, `/today`, `/progress`, `/goals`.

## Формат плана дня

Присылается боту либо командой `/plan <json>`, либо просто сообщением, целиком
состоящим из JSON (бот распознаёт по `{` в начале сообщения):

```json
{
  "date": "today",
  "focus": "Сдать черновик курса и не сорвать тренировку",
  "tasks": [
    { "time": "09:00", "title": "Написать план на день", "priority": "A", "goal_id": 6, "remind": true },
    { "time": "13:00", "title": "Тренировка", "priority": "A", "goal_id": 2, "remind": true },
    { "time": null, "title": "Купить продукты", "priority": "C", "goal_id": null, "remind": false }
  ]
}
```

`date` — `"today"`, `"tomorrow"` или явная `"YYYY-MM-DD"`. **Используйте `"today"`/
`"tomorrow"`, если пишете боту не с одного устройства** — бот сам резолвит дату по
своей `NOVA_TIMEZONE`, а не по часам того устройства (телефон/компьютер), с которого
отправлено сообщение: у них может быть выставлена разная системная таймзона, и дата
"на глаз" может не совпасть с тем, что бот считает сегодняшним днём.

`time` — всегда в `NOVA_TIMEZONE` бота (не в таймзоне устройства, с которого пишете).

`goal_id` — числовой id из таблицы `goals` (не uuid). План на дату при повторной
отправке полностью заменяется (старые задачи плана удаляются, новые вставляются).

## Команды

- `/start` — привязать текущий Telegram-чат к аккаунту (`NOVA_USER_ID` из `.env`)
- `/plan <json>` — сохранить план дня (см. формат выше)
- `/today` — задачи на сегодня со статусами
- `/progress` — сводка за последние 7 дней по целям (кол-во выполненных задач +
  сумма `duration_minutes`, если заполнялось)
- `/goals` — список целей со статусами и дедлайнами

Inline-кнопки под напоминанием: ✅ Сделано / ⏭ Позже / ⏩ Пропустить. Для задачи,
привязанной к цели, после «Сделано» бот попросит короткую заметку — следующее
текстовое сообщение сохранится в `goal_plan_tasks.note`.

## Напоминания

`lib/reminders.js` — `node-cron`, проверка каждую минуту. Берёт задачи плана на
сегодня с `remind = true`, `status = 'pending'`, `reminded_at IS NULL`, `time` не
пусто, и чьё время попадает в окно ±5 минут от текущего (таймзона —
`NOVA_TIMEZONE` в `.env`, по умолчанию `America/Los_Angeles`, совпадает с
таймзоной, принятой в остальном проекте). После отправки проставляет
`reminded_at`, чтобы не дублировать.

## Деплой

Бот работает через long polling (`bot.launch()`), поэтому не требует публичного
HTTPS-адреса — подходит любой хостинг с постоянно работающим Node-процессом:

- **Railway / Render**: создать Node-сервис, root directory `bot/`, build
  `npm install`, start `npm start`, переменные окружения — из `.env.example`
- **VPS**: `pm2 start index.js --name nova-bot` (или systemd-юнит) в папке `bot/`

Ничего в этой папке не влияет на деплой самого SPA — `bot/package.json`
независим от корневого `package.json` NOVA.
