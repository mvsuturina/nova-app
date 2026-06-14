# NOVA — контекст для Claude

## Стек
- Vanilla JS SPA, без фреймворка
- Supabase (PostgreSQL + Auth + Storage + RLS)
- Один файл `index.html` (скелет) + раздельные JS/CSS файлы

## Структура файлов
```
index.html          — HTML-скелет, подключает скрипты в порядке ниже
css/style.css       — все стили
js/state.js         — глобальные переменные (sb, currentUser, todayScore, ...)
js/score.js         — getZone(), ZONE_LABELS, ZONE_DESCS
js/home.js          — renderHome(), renderScore(), renderSurveyCta(), задачи
js/survey.js        — оба опроса + выбор практик
js/chat.js          — чат с NOVA (Groq API)
js/journal.js       — голосовой/текстовый дневник
js/auth.js          — вход/регистрация/настройка профиля
js/app.js           — initApp(), loadUserData(), debugResetDay()
config.js           — SUPABASE_URL, SUPABASE_ANON_KEY
schema.sql          — полная схема БД (идемпотентный DROP+CREATE)
```

## Архитектура скора
- `daily_scores` — лог пересчётов, текущий скор = последняя строка за сегодня
- `daily_score_snapshots` — полный снимок модели при каждом опросе (переносит поля из предыдущего)
- Зоны: green < 45, yellow 45–64, red 65–99, catastrophe ≥ 100
- Вес положительный = стресс растёт, отрицательный = снижается

## Опросы
- **Опрос 1** (`survey_id=1`): утренний, частично hardcoded в `renderSurveyStep()` — цикл, сон, туалет, голод
- **Опрос 2** (`survey_id=2`): DB-driven, вопросы из `survey_question_assignments`, рендерится generic

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
- `water_log` — одна строка = один стакан; цель 8 в день
- При логировании через виджет → `showSurvey2()` пропускает соответствующий вопрос через `externalAnsweredKeys`
- Обед и ужин будут в будущих опросах; сейчас в Survey 2 только `meal_breakfast`

## Важные детали
- `daily_survey_answers.value` всегда `text`: для bool → `'true'`/`'false'`, для radio → строка id, для scale → `'5'`
- Circular FK: `daily_scores.session_id ↔ daily_survey_sessions.daily_score_id` — оба заполняются после INSERT
- Опрос 1 использует hardcoded `question_id` 1, 2, 3 в `daily_survey_answers` — не менять порядок INSERT в questions
- `debugResetDay()` в `app.js` — кнопка для сброса данных за сегодня (dev only)
