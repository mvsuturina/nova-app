# NOVA — контекст для Claude

## Стек
- Vanilla JS SPA, без фреймворка
- Supabase (PostgreSQL + Auth + Storage + RLS)
- Один файл `index.html` (скелет) + раздельные JS/CSS файлы

## Структура файлов
```
index.html          — HTML-скелет, подключает скрипты в порядке ниже
css/style.css       — все стили
js/state.js         — глобальные переменные (sb, currentUser, todayScore, todayCheckins, ...)
js/score.js         — getZone(), getCheckinCoefficient(), recalculateScore()
js/daylog.js        — лог дня (SURVEY_NAMES const, loadDayLog, лайтбокс фото)
js/breakdown.js     — разбор скора (использует SURVEY_NAMES из daylog.js)
js/home.js          — renderHome(), renderScore(), renderSurveyCta(), задачи
js/survey.js        — опрос 1 (утро) + чекины 2-6 (_submitCheckin)
js/chat.js          — чат с NOVA (Groq API)
js/journal.js       — голосовой/текстовый дневник
js/auth.js          — вход/регистрация/настройка профиля
js/app.js           — initApp(), loadUserData(), debugResetDay()
config.js           — SUPABASE_URL, SUPABASE_ANON_KEY
schema.sql          — полная схема БД (только документация, не применять целиком)
```

> **ВАЖНО**: `daylog.js` загружается раньше `breakdown.js` — константа `SURVEY_NAMES` объявлена в daylog.js и используется в breakdown.js. Порядок тегов `<script>` в index.html нельзя менять.

## Архитектура скора

### Хранение
- `daily_scores` — лог каждого пересчёта (user_id, date, value, source, session_id). Текущий скор = последняя строка за сегодня
- `daily_survey_sessions` — одна строка на каждый пройденный опрос/чекин. Колонка времени: **`completed_at`** (не `created_at` — её нет!)
- `daily_survey_answers` — ответы на вопросы (session_id, question_id, value как text). Для живота и эмоций вопросы берутся из таблицы `questions` по ключам 'stomach' и 'emotion' (`surveyRef.stomachQId`, `surveyRef.emotionQId`). Сон — hardcoded `question_id=2`
- `emotion_log` — текстовая заметка к эмоции (emotion_type_id, note, session_id). Заметки сохраняются сюда, **не** в `journal_entries` (CHECK constraint там не пропускает source='emotion_note')

### Зоны
- green < 45 (включая отрицательные), yellow 45–64, red 65–99, catastrophe ≥ 100
- Вес положительный = стресс растёт, отрицательный = снижается
- `renderScore()` показывает `Math.max(0, todayScore)`, но внутреннее значение может быть отрицательным

### Формула recalculateScore()
```
s = todayCycleWeight
  + todaySleepWeight
  + (toilet ? -20 : +10)
  + (work   ? -20 : +10)
  + (warmup  ? -10 : 0)
  + (workout ? -30 : 0)
  + (walk    ? -10 : 0)
  + Σ meals: plan→-10, slip→+10
  + todayDynamic.stomachWeight                   ← последний чекин (живот — полный вес, без коэффициента)
  + Σ todayCheckins: round(emotionWeight × coeff) ← все чекины (эмоции — накопительно, с коэффициентом)
  - completedTasks × 10
```

### Накопительные чекины (`todayCheckins`)
- `todayCheckins: Array<{stomachWeight, emotionWeight, surveyId}>` — глобальный массив в state.js
- Каждый чекин (survey_id 2-6) добавляет своё слагаемое к скору. Последний чекин не заменяет предыдущие — они **суммируются**
- Защита от дубля в памяти: если `_submitCheckin` вызывается дважды с одним `surveyId` (технический сбой), второй вызов заменяет первый элемент в массиве, а не добавляет новый. На практике не происходит — кнопка чекина исчезает после `todaySurveyNDone = true`
- `todayDynamic` = последний чекин (для отображения в UI)
- Загружается в `loadUserData()` одним батч-запросом по всем session_id

### Коэффициенты чекинов (`getCheckinCoefficient(surveyId)`)
Привязаны к номеру опроса, **не** к часовому поясу:
| surveyId | Название | Коэффициент |
|----------|----------|-------------|
| 1 | Начало | 0 (нет эмоции в утреннем опросе) |
| 2 | Чекап 7:00 | 1 |
| 3 | Чекап 10:00 | 1.25 |
| 4 | Чекап 13:00 | 1.25 |
| 5 | Чекап 16:00 | 1.5 |
| 6 | Рефлексия дня | 1.5 |
| 7 | SOS | 1 |

### Веса справочников (текущие в БД)
**emotion_types:**
- нейтрально: 0, радость: 15, любовь: 15, грусть: 15, гнев: 20, страх: 20

**stomach_states:**
- норм: 0, тяжесть: 25, дискомфорт: 30, сильная тяжесть и дискомфорт: 40

---

### Правило: при изменении скора обновить ОБА экрана

Если меняешь что-то в логике скора или добавляешь новый фактор — нужно обновить **три места**:
1. `score.js` — формула `recalculateScore()`
2. `daylog.js` — отображение в логе дня (чипы, константы `DL_ANS_LABEL`)
3. `breakdown.js` — разбор скора (строки `bkdRow`)

## Опросы
- **Опрос 1** (`survey_id=1`): утренний, hardcoded — цикл, сон, туалет, живот
- **Чекины 2-6** (`survey_id=2..6`): динамика — живот + эмоция + заметка. Рендерит `showCheckin()` / `_submitCheckin()`

### Как работает generic движок (Опрос 2)
1. `showSurvey2()` читает `survey_question_assignments` JOIN `questions` (поля: `id, key, text, type, weight_yes, weight_no, weights_json`)
2. Проверяет `skip_if_answered_today` + `skip_if_value` против ответов за сегодня → `s2ActiveQuestions[]`
3. `renderSurvey2Step()` рендерит по типу: `bool` → кнопки Да/Нет, `scale` → шкала 1–10
4. Скор: `bool` → `weight_yes`/`weight_no`, `scale` → `weights_json[String(val)]`

### skip_if_value семантика
- `null` — пропустить при ЛЮБОМ ответе сегодня
- `'true'` — пропустить только если предыдущий ответ был `'true'`
- `'false'` — пропустить только если предыдущий ответ был `'false'`

---

## Виды свойств скора

### 1. bool — да/нет
**Примеры:** туалет, тренировка, вода, работа

Два веса: `weight_yes` (ответ «да») и `weight_no` (ответ «нет»).
Логика: если плохое состояние = «не было» → weight_no положительный (стресс растёт).

```sql
-- questions:
('my_param', 'Вопрос?', 'bool', NULL, -10, 10, NULL)
--                                          ^^^  ^^^
--                                     weight_yes weight_no
```

**Хранение в снэпшоте:** jsonb-лог (несколько ответов в день) или скалярное поле (одно значение).
- Лог: `my_param_log jsonb NOT NULL DEFAULT '[]'` → `[{time, value: bool}, ...]`
- Скаляр: `my_param_done bool` → последнее значение

**Поведение в опросе:**
- Всегда спрашивать: `skip_if_answered_today = false`
- Пропустить если уже ответили: `skip_if_answered_today = true, skip_if_value = null`
- Пропустить только если ответили «да»: `skip_if_answered_today = true, skip_if_value = 'true'`  
  *(так работает туалет в опросе 2 — если утром был, днём не спрашиваем)*

**UI:** готовые классы `bool-toggle` / `bool-btn` / `bool-btn.selected`

---

### 2. scale — числовая шкала
**Примеры:** голод (1–10)

Вес зависит от конкретного значения. Хранится в `weights_json` на вопросе.
Экстремальные значения могут давать одинаковый вес (V-образная кривая).

```sql
-- questions:
('my_param', 'Вопрос?', 'scale', NULL, NULL, NULL,
 '{"1":60,"2":40,"3":20,"4":0,"5":0,"6":0,"7":0,"8":20,"9":40,"10":60}')
```

**Хранение:** отдельная таблица `my_param_log` (одна строка = один ответ).
Не в снэпшоте — потому что нужна история нескольких значений за день.

```sql
CREATE TABLE public.my_param_log (
  id int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT current_date,
  value int NOT NULL CHECK (value BETWEEN 1 AND 10),
  session_id int REFERENCES public.daily_survey_sessions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
```

**UI:** готовые классы `scale-row` / `scale-btn` / `scale-btn.selected`

---

### 3. radio — выбор из справочника
**Примеры:** день цикла (periods), количество сна (sleeps)

Вес берётся из строки справочной таблицы (`periods.weight`, `sleeps.weight`).
На вопросе нет своих весов — только `ref_table`.

```sql
-- questions:
('my_param', 'Вопрос?', 'radio', 'my_ref_table', NULL, NULL, NULL)
```

Требует отдельной справочной таблицы:
```sql
CREATE TABLE public.my_ref_table (
  id     int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,
  weight int  NOT NULL
);
```

**Хранение в снэпшоте:** `my_param_id int REFERENCES public.my_ref_table(id)` — скалярное поле.

**UI:** radio-карточки. В опросе 1 hardcoded, опрос 2 не поддерживает radio (нет generic рендера).

---

### 4. text — свободный ввод от руки
**Примеры:** заметка о самочувствии, описание симптома *(не реализовано)*

Нет числового веса — влияние на скор не прямое (либо фиксированный бонус/штраф за сам факт заполнения, либо не влияет).

```sql
-- questions:
('my_param', 'Опиши...', 'text', NULL, -5, 0, NULL)
-- weight_yes = бонус за то что написала, weight_no = штраф если пропустила
```

**Хранение:** отдельная таблица с `text` полем, или `journal_entries` если это дневник.

**UI:** `<textarea>` — нужно добавить стиль и обработчик. Generic движок опроса 2 его пока не рендерит — потребует расширения `renderSurvey2Step()`.

---

### 5. counter — счётчик
**Примеры:** стаканы воды, таблетки *(не реализовано)*

Вес зависит от количества. Хранится в `weights_json` как у scale, но значения не ограничены 1–10.

```sql
('my_param', 'Сколько стаканов?', 'counter', NULL, NULL, NULL,
 '{"0":20,"1":10,"2":5,"3":0,"4":-5,"5":-10}')
```

**UI:** кнопки +/− или цифровое поле. Не реализовано.

---

## Паттерн добавления нового свойства

### Шаг 1 — определить вид (см. выше) и выбрать хранение

| Ситуация | Хранение |
|----------|----------|
| Одно значение в день, важен только факт | скалярное поле в снэпшоте |
| Несколько ответов в день (утро + вечер) | jsonb-лог в снэпшоте `[{time, value}]` |
| Нужна история / аналитика по значениям | отдельная таблица `my_param_log` |
| Свободный текст | отдельная таблица или `journal_entries` |

---

### Шаг 2 — `schema.sql`

```sql
-- В секцию RESET добавить:
DROP TABLE IF EXISTS public.my_param_log CASCADE;

-- В questions INSERT добавить строку (тип и веса по виду выше)

-- Если нужна отдельная таблица:
CREATE TABLE public.my_param_log ( ... );
ALTER TABLE public.my_param_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own my_param" ON public.my_param_log FOR ALL USING (auth.uid() = user_id);

-- Если нужно поле в снэпшоте — добавить колонку в daily_score_snapshots

-- В survey_question_assignments INSERT добавить:
(1, <id>, <order>, <skip_if_answered_today>, <skip_if_value>, 1),  -- опрос 1
(2, <id>, <order>, <skip_if_answered_today>, <skip_if_value>, 2),  -- опрос 2
```

---

### Шаг 3 — инкрементальный SQL (без сброса данных)

```sql
-- Вопрос
INSERT INTO public.questions (key, text, type, weight_yes, weight_no, weights_json)
VALUES ('my_param', 'Текст?', 'bool', -10, 10, NULL)
ON CONFLICT (key) DO UPDATE SET type = EXCLUDED.type, weights_json = EXCLUDED.weights_json;

-- Лог-таблица (если нужна)
CREATE TABLE IF NOT EXISTS public.my_param_log ( ... );

-- Поле в снэпшоте (если нужно)
ALTER TABLE public.daily_score_snapshots
  ADD COLUMN IF NOT EXISTS my_param_log jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Привязка к опросам
INSERT INTO public.survey_question_assignments
  (survey_id, question_id, order_index, skip_if_answered_today, skip_if_value, min_survey_occurrence)
SELECT 1, id, <N>, false, NULL, 1 FROM public.questions WHERE key = 'my_param'
ON CONFLICT DO NOTHING;

INSERT INTO public.survey_question_assignments
  (survey_id, question_id, order_index, skip_if_answered_today, skip_if_value, min_survey_occurrence)
SELECT 2, id, <N>, false, NULL, 2 FROM public.questions WHERE key = 'my_param'
ON CONFLICT DO NOTHING;
```

---

### Шаг 4 — `js/survey.js`

**Опрос 2 — ничего менять не надо** если тип `bool` или `scale`. Движок generic.  
Для `text`, `counter`, `photo` — потребует расширения `renderSurvey2Step()`.

**Опрос 1 (hardcoded) — 5 мест:**

```javascript
// 1. showSurvey() — загрузить id вопроса и weights_json если нужны:
sb.from('questions').select('id, weights_json').eq('key', 'my_param').maybeSingle()
// → surveyRef.myParamQuestionId, surveyRef.myParamWeights

// 2. renderSurveyStep() — добавить блок вопроса
// bool:
`<div class="bool-toggle">
  <button class="bool-btn" id="mp-yes" onclick="pickMyParam(true)">Да</button>
  <button class="bool-btn" id="mp-no"  onclick="pickMyParam(false)">Нет</button>
</div>`

// scale:
`<div class="scale-row">
  ${[1,2,3,4,5,6,7,8,9,10].map(v =>
    `<button class="scale-btn" id="mp-${v}" onclick="pickMyParamScale(${v})">${v}</button>`
  ).join('')}
</div>`

// text:
`<textarea id="mp-text" oninput="surveyAns.my_param=this.value;checkSurveyReady()"
  rows="3" style="width:100%;..."></textarea>`

// 3. Добавить pick-функцию (bool / scale — по аналогии с pickBool / pickSurvey1Scale)

// 4. checkSurveyReady() — добавить:
&& surveyAns.my_param !== undefined

// 5. submitSurvey() — три места:
// а) скор:
const delta = val ? WEIGHT_YES : WEIGHT_NO;                         // bool
const delta = surveyRef.myParamWeights?.[String(val)] ?? 0;         // scale

// б) daily_survey_answers:
answers.push({ session_id: session.id, question_id: surveyRef.myParamQuestionId, value: String(val) });

// в) хранение (выбрать одно):
await sb.from('my_param_log').insert({ user_id, date, value: val, session_id });  // отдельная таблица
// или добавить в s1snap:
my_param_log: [{ time: new Date().toISOString(), value: val }],                   // jsonb в снэпшоте
```

---

## Текущие параметры скора

| key | type | Опрос 1 | Опрос 2 | Лог |
|-----|------|---------|---------|-----|
| cycle_phase | radio (periods) | ✓ | — | snapshot.period_id |
| sleep | radio (sleeps) | ✓ | — | snapshot.sleep_id |
| toilet | bool | ✓ | ✓ (skip если 'true') | snapshot.toilet_log |
| workout | bool | — | ✓ | snapshot.workout_log |
| water | bool | — | ✓ | snapshot.water_log |
| work | bool | — | ✓ | snapshot.work_done |
| hunger | scale | ✓ | ✓ | hunger_log (отдельная таблица) |
| stomach | radio (stomach_states) | ✓ | ✓ | snapshot.stomach_id |
| emotion | radio (emotion_types) + text note | ✓ | ✓ | snapshot.emotion_type_id + emotion_log.note |
| meal_breakfast | bool | — | ✓ (skip если в meal_log) | meal_log (meal_type='breakfast') |
| meal_lunch | — | — | будущий опрос | meal_log (meal_type='lunch') |
| meal_dinner | — | — | будущий опрос | meal_log (meal_type='dinner') |
| water | bool | — | ✓ (skip если в water_log) | water_log (одна строка = 1 стакан) |

## Трекеры (виджет на главной)
- `meal_log` — одна строка = один приём пищи; `meal_type IN ('breakfast','lunch','dinner')`, `in_window bool`
- `saved_recipes` — личный справочник проверенных порций: уникальное для пользователя название, эталонный вес `portion_grams`, состав и КБЖУ в `nutrition_json`. При выборе рецепт масштабируется по граммам и копируется в `meal_log`
- `nutrition_json` хранит по каждому ингредиенту и в `total`: `kcal`, `p`, `f`, `c`, `fiber` (г), `sodium` (мг). У старых записей `fiber`/`sodium` могут отсутствовать и отображаются как неизвестные
- `water_log` — одна строка = один стакан; цель 8 в день
- При логировании через виджет → `showSurvey2()` пропускает соответствующий вопрос через `externalAnsweredKeys`
- Обед и ужин будут в будущих опросах; сейчас в Survey 2 только `meal_breakfast`

## Важные детали
- `daily_survey_answers.value` всегда `text`: для bool → `'true'`/`'false'`, для radio → строка id, для scale → `'5'`
- Circular FK: `daily_scores.session_id ↔ daily_survey_sessions.daily_score_id` — оба заполняются после INSERT
- Опрос 1 использует hardcoded `question_id` 1, 2, 3 в `daily_survey_answers` — не менять порядок INSERT в questions

---

## Безопасность данных и работа со схемой

### Аккаунты
- **Боевой аккаунт** (mayv666@gmail.com): `d0f3ba43-2690-46d1-8d1e-2b8f4c0abec5`
- **Тестовый аккаунт**: отдельный профиль для проверки изменений перед деплоем

### Правила изменения схемы в продакшне
`schema.sql` — только документация. В Supabase применять исключительно инкрементальные команды:

| Операция | Безопасно | Опасно |
|----------|-----------|--------|
| Новая таблица | `CREATE TABLE IF NOT EXISTS` | `DROP TABLE ... CASCADE` |
| Новая колонка | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | — |
| Переименовать колонку | `ALTER TABLE ... RENAME COLUMN` | — |
| Удалить колонку | только если точно не используется | |
| Изменить тип | `ALTER COLUMN ... TYPE ... USING ...` | — |

**Порядок деплоя:**
1. Сделать дамп боевого аккаунта (SQL ниже)
2. Проверить изменение на тестовом аккаунте
3. Применить инкрементальный SQL на продакшне
4. Bump версию кеша в `sw.js`: `nova-app-vN` → `nova-app-vN+1`
5. Задеплоить JS/CSS + sw.js

### Обновление PWA (Service Worker кеш)
PWA на рабочем столе показывает старую версию пока не обновится SW.
**При каждом деплое менять версию в `sw.js`:**
```javascript
const CACHE = 'nova-app-v3'; // +1 при каждом деплое
```
Механизм: браузер видит изменение `sw.js` → новый SW → `skipWaiting()` → `controllerchange` → авто-перезагрузка страницы → свежие файлы.

### Дамп боевых данных (запускать перед любым изменением схемы)

```sql
SELECT json_build_object(
  'exported_at', now(),
  'user_id', 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5',
  'scores',    (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_scores          WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'sessions',  (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_survey_sessions WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'answers',   (SELECT json_agg(row_to_json(t)) FROM (SELECT a.* FROM daily_survey_answers a JOIN daily_survey_sessions s ON s.id = a.session_id WHERE s.user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'snapshots', (SELECT json_agg(row_to_json(t)) FROM (SELECT sn.* FROM daily_score_snapshots sn JOIN daily_scores sc ON sc.id = sn.score_id WHERE sc.user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'meals',     (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM meal_log              WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'recipes',   (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM saved_recipes          WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'water',     (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM water_log             WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'activity',  (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM activity_log          WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'goals',     (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM mini_goals            WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'tasks',     (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM daily_tasks           WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'journals',  (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM journal_entries       WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'hunger',    (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM hunger_log            WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t),
  'emotions',  (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM emotion_log           WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5') t)
) AS backup;
```

### Частые фиксы

**Даты сохранились на день раньше/позже** (баг UTC vs локальный TZ):
```sql
-- Проверить
SELECT id, text, date, created_at FROM public.mini_goals
WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5' ORDER BY created_at DESC LIMIT 20;

-- Сдвинуть на день назад (если created_at < 07:00 UTC = до полуночи LA)
UPDATE public.mini_goals SET date = date - 1
WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5'
  AND date = CURRENT_DATE AND created_at < CURRENT_DATE + interval '7 hours';

-- Сдвинуть на завтра → сегодня (если goals сохранились как +1 лишний день)
UPDATE public.mini_goals SET date = CURRENT_DATE
WHERE user_id = 'd0f3ba43-2690-46d1-8d1e-2b8f4c0abec5'
  AND date = CURRENT_DATE + 1;
```
- `debugResetDay()` в `app.js` — кнопка для сброса данных за сегодня (dev only)

---

## Инструменты (tools) — как добавлять

### Архитектура
Все инструменты хранятся **только в БД**, JS код их не хардкодит.

| Таблица | Роль |
|---------|------|
| `tools` | Справочник: название, вес, тип, флаг red_zone |
| `survey_tools` | Привязка: какой инструмент предлагается после какого чекина |
| `daily_tasks` | Лог: что юзер выбрал на сегодня (tool_id + is_complete) |

### Два вида инструментов

**1. Инструменты чекинов** — появляются в экране выбора практик после прохождения опроса:
- `is_red_zone = false`
- Привязаны к опросу через `survey_tools`
- Юзер сам выбирает → добавляется в `daily_tasks`, каждый даёт **−10** к скору при выполнении

**2. Инструменты красной зоны** — появляются на главной панелью «ВЫБЕРИ ПРАКТИКУ» когда скор ≥ 65:
- `is_red_zone = true`
- Не привязаны к опросам
- Даёт реальный вес из поля `weight` (например −20, −15)

### Добавить новый инструмент чекина
```sql
-- 1. Добавить в справочник
INSERT INTO public.tools (name, duration_min, weight, tool_type)
VALUES ('Название', 10, -10, 'practice');  -- tool_type: 'practice' или 'journal'

-- 2. Привязать к нужному чекину (survey_id 1-6)
INSERT INTO public.survey_tools (survey_id, tool_id)
SELECT 2, id FROM public.tools WHERE name = 'Название';
-- survey_id: 1=Начало, 2=Чекап7, 3=Чекап10, 4=Чекап13, 5=Чекап16, 6=Рефлексия
```
JS менять не нужно.

### Добавить новый инструмент красной зоны
```sql
INSERT INTO public.tools (name, duration_min, weight, tool_type, is_red_zone)
VALUES ('Название', 15, -10, 'practice', true);
-- weight должен быть отрицательным
```
JS менять не нужно.

### Изменить вес или название
```sql
UPDATE public.tools SET weight = -15, name = 'Новое название' WHERE id = <id>;
```

### Удалить инструмент
```sql
-- Сначала отвязать от опросов
DELETE FROM public.survey_tools WHERE tool_id = <id>;
-- Потом удалить (daily_tasks.tool_id имеет ON DELETE CASCADE через tasks FK — проверь перед удалением)
DELETE FROM public.tools WHERE id = <id>;
```

### Как сказать Claude чтобы он понял контекст
Напиши: **«добавь инструмент [название] вес [число] для [чекина N / красной зоны]»**

Примеры:
- «добавь инструмент Медитация 10 мин вес −10 для чекина 3»
- «добавь инструмент Горячая ванна вес −15 для красной зоны»
- «измени вес инструмента Дыхание на −10»

Claude выдаст готовый SQL — запусти в Supabase, деплоить JS не нужно.
