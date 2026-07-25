# NOVA — краткая спека для проектирования новой фичи

## Что это
Персональный PWA-агент здоровья. Пользователь несколько раз в день проходит короткие опросы
(чекины) о своём состоянии (сон, цикл, туалет, работа, тренировка, еда, эмоции, живот и т.д.),
приложение считает единый **«скор стресса»** на день и по зонам скора (green/yellow/red/catastrophe)
предлагает практики («инструменты») для снижения стресса. Есть чат с NOVA (LLM), голосовой/текстовый
дневник, трекеры еды и воды.

## Стек
- Vanilla JS SPA (без фреймворка), один `index.html`-скелет + отдельные JS/CSS файлы
- Backend: Supabase (PostgreSQL + Auth + Storage + Row Level Security)
- PWA: Service Worker (`sw.js`) с версионированным кешем
- Чат: Groq API (LLM)

## Структура кода
```
index.html      — скелет, порядок <script> тегов ФИКСИРОВАН (daylog.js до breakdown.js — общая константа)
css/style.css    — все стили
js/state.js      — глобальное состояние (sb клиент, currentUser, todayScore, todayCheckins...)
js/score.js      — вся формула скора: getZone(), getCheckinCoefficient(), recalculateScore()
js/survey.js     — опрос 1 (утро, hardcoded) + чекины 2-6 (generic движок)
js/daylog.js     — лог дня, лайтбокс фото
js/breakdown.js  — визуальный разбор скора
js/home.js       — главный экран, задачи, CTA опроса
js/chat.js       — чат с NOVA (Groq)
js/journal.js    — голосовой/текстовый дневник
js/auth.js       — вход/регистрация/онбординг
js/app.js        — initApp(), loadUserData(), debugResetDay()
js/challenge.js, js/export.js, js/norms.js, js/push.js — доп. модули
schema.sql       — документация схемы БД (НЕ применяется целиком в проде — только инкрементально)
```

## Модель данных (ключевое)
- `daily_scores` — лог пересчётов скора за день (текущий скор = последняя запись)
- `daily_survey_sessions` — одна строка на пройденный опрос/чекин (время: `completed_at`)
- `daily_survey_answers` — ответы (session_id, question_id, value:text)
- `questions` / `survey_question_assignments` — generic-движок опросов: тип вопроса (bool/scale/radio/text/counter),
  веса, привязка к номеру опроса, правила skip_if_answered_today / skip_if_value
- `tools` / `survey_tools` / `daily_tasks` — инструменты-практики. Полностью управляются из БД,
  JS их не хардкодит — новый инструмент = только SQL, без деплоя кода
- `emotion_log`, `hunger_log`, `meal_log`, `water_log`, `saved_recipes` — доп. трекеры

## Логика скора (кратко)
- Один скор на день, складывается из множества факторов (см. score.js: recalculateScore())
- Зоны: green <45, yellow 45–64, red 65–99, catastrophe ≥100
- Чекины (survey_id 2–6) НЕ перезаписывают друг друга — эмоции суммируются накопительно с коэффициентом
  по времени чекина, живот берётся только последний
- Правило при изменении скора: обновлять 3 места синхронно — score.js (формула), daylog.js (лог дня),
  breakdown.js (разбор)

## Виды вопросов (generic-движок опроса 2)
bool (да/нет), scale (шкала 1–10, V-образный вес), radio (справочник, напр. цикл/сон), text (свободный текст),
counter (счётчик, не реализован для рендера). Опрос 1 — hardcoded, не через generic-движок.

## Специфика/подводные камни
- Один боевой аккаунт с реальными данными пользователя — перед изменением схемы делать дамп (SQL в CLAUDE.md)
- Изменения схемы в проде — только инкрементально (`ADD COLUMN IF NOT EXISTS` и т.п.), `schema.sql` не гонять целиком
- Каждый деплой JS/CSS требует bump версии кеша в `sw.js` (иначе PWA не обновится)
- Таймзона: даты иногда съезжают на день из-за UTC vs локального времени — известный класс багов

## Полная документация
Подробная спека с полным SQL, паттернами добавления новых параметров скора и примерами — в `CLAUDE.md` в корне проекта.
