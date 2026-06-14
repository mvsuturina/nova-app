-- ══════════════════════════════════════════════════════════════════════════
-- NOVA — Schema v3
-- MVP: 3 показателя (цикл, сон, туалет) + движок опросов + инструменты
--
-- КАК ПРИМЕНИТЬ:
--   Supabase Dashboard → SQL Editor → вставить весь файл → Run
--   Скрипт идемпотентен: DROP IF EXISTS в начале позволяет запускать повторно.
--   ВНИМАНИЕ: удаляет все старые данные включая task_logs и chat_messages.
--
-- Принципы:
--   • daily_scores — лог пересчётов (каждый пересчёт = новая строка)
--   • текущий скор = последняя строка daily_scores за сегодня
--   • снэпшот создаётся только при изменении полей модели (через опрос)
--   • выполнение таски → только новый daily_score (без нового снэпшота)
--   • все справочники читаются любым auth пользователем (RLS SELECT)
-- ══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
-- RESET — удаляем всё старое перед созданием нового
-- ══════════════════════════════════════════════════════════════════════════

-- Функции
DROP FUNCTION IF EXISTS public.set_updated_at()            CASCADE;
DROP FUNCTION IF EXISTS public.calculate_score(int,int,int,bool) CASCADE;
DROP FUNCTION IF EXISTS public.max_possible_score(int)     CASCADE;
DROP FUNCTION IF EXISTS public.is_red_zone(int,int)        CASCADE;
DROP FUNCTION IF EXISTS public.ensure_daily_score(uuid,date) CASCADE;

-- Дневные таблицы (порядок важен: дочерние раньше родительских)
DROP TABLE IF EXISTS public.mini_goals             CASCADE;
DROP TABLE IF EXISTS public.journal_entries        CASCADE;
DROP TABLE IF EXISTS public.meal_log                CASCADE;
DROP TABLE IF EXISTS public.water_log               CASCADE;
DROP TABLE IF EXISTS public.activity_log            CASCADE;
DROP TABLE IF EXISTS public.emotion_log             CASCADE;
DROP TABLE IF EXISTS public.hunger_log              CASCADE;
DROP TABLE IF EXISTS public.daily_score_snapshots  CASCADE;
DROP TABLE IF EXISTS public.daily_survey_answers   CASCADE;
DROP TABLE IF EXISTS public.daily_tasks            CASCADE;
DROP TABLE IF EXISTS public.daily_scores           CASCADE;
DROP TABLE IF EXISTS public.daily_survey_sessions  CASCADE;

-- ВНИМАНИЕ: Storage bucket 'journal-audio' не сбрасывается через SQL.
-- При необходимости очистить аудио-файлы → Supabase Dashboard → Storage → journal-audio → Empty bucket

-- Справочники
DROP TABLE IF EXISTS public.survey_tools                  CASCADE;
DROP TABLE IF EXISTS public.survey_question_assignments   CASCADE;
DROP TABLE IF EXISTS public.questions                     CASCADE;
DROP TABLE IF EXISTS public.surveys                       CASCADE;
DROP TABLE IF EXISTS public.tools                         CASCADE;
DROP TABLE IF EXISTS public.sleeps                        CASCADE;
DROP TABLE IF EXISTS public.stomach_states                CASCADE;
DROP TABLE IF EXISTS public.emotion_types                 CASCADE;
DROP TABLE IF EXISTS public.toilet_states                 CASCADE;
DROP TABLE IF EXISTS public.periods                       CASCADE;

-- Старые таблицы (v1/v2)
DROP TABLE IF EXISTS public.task_logs    CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.profiles     CASCADE;
-- ══════════════════════════════════════════════════════════════════════════


-- ─── ПРОФИЛЬ ──────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name          text,
  focus         text,
  challenges    text,
  goals         jsonb DEFAULT '[]'::jsonb,
  groq_api_key  text,
  role          text DEFAULT 'Software Engineer',
  timezone      text DEFAULT 'UTC',
  updated_at    timestamptz DEFAULT now()
);

-- Incremental (existing DB): ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';


-- ─── ЧАТ (NOVA) ───────────────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id         int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_user ON public.chat_messages (user_id, created_at DESC);


-- ══════════════════════════════════════════════════════════════════════════
-- СПРАВОЧНИКИ (reference tables)
-- Данные вставляются один раз, расширяются вручную или через admin UI
-- ══════════════════════════════════════════════════════════════════════════


-- ─── ФАЗЫ ЦИКЛА ───────────────────────────────────────────────────────────
-- weight: положительный = добавляет к скору (хуже), отрицательный = снижает
CREATE TABLE public.periods (
  id     int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,  -- '1-4', '5-10', '11-19', '20-26'
  weight int  NOT NULL
);

INSERT INTO public.periods (label, weight) VALUES
  ('1-4',   30),
  ('5-10',  -10),
  ('11-19',  0),
  ('20-26',  25);


-- ─── ТУАЛЕТ ───────────────────────────────────────────────────────────────
CREATE TABLE public.toilet_states (
  id     int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,  -- 'yes', 'no'
  weight int  NOT NULL
);

INSERT INTO public.toilet_states (label, weight) VALUES
  ('yes', -10),
  ('no',   20);


-- ─── ВАРИАНТЫ СНА ─────────────────────────────────────────────────────────
CREATE TABLE public.sleeps (
  id     int PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,  -- '<7h', '7-8h', '>8h'
  weight int  NOT NULL
);

INSERT INTO public.sleeps (label, weight) VALUES
  ('<7h',  30),
  ('7-8h', 10),
  ('>8h',   0);


-- ─── СОСТОЯНИЕ ЖИВОТА ─────────────────────────────────────────────────────
CREATE TABLE public.stomach_states (
  id     int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,
  weight int  NOT NULL
);

INSERT INTO public.stomach_states (label, weight) VALUES
  ('норм',                          0),
  ('тяжесть',                      25),
  ('дискомфорт',                   30),
  ('сильная тяжесть и дискомфорт', 40);


-- ─── ЭМОЦИИ ───────────────────────────────────────────────────────────────
CREATE TABLE public.emotion_types (
  id     int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label  text NOT NULL UNIQUE,
  weight int  NOT NULL
);

INSERT INTO public.emotion_types (label, weight) VALUES
  ('нейтрально',  0),
  ('радость',    10),
  ('любовь',     10),
  ('гнев',       10),
  ('страх',      10),
  ('грусть',     10);


-- ─── ИНСТРУМЕНТЫ / ПРАКТИКИ ───────────────────────────────────────────────
-- tool_type: 'practice' — выполняется сразу | 'journal' — открывает ввод текста/голоса
-- weight: отрицательный (снижают скор при выполнении)
CREATE TABLE public.tools (
  id           int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name         text NOT NULL,
  duration_min int  NOT NULL,
  weight       int  NOT NULL CHECK (weight < 0),
  tool_type    text NOT NULL DEFAULT 'practice' CHECK (tool_type IN ('practice', 'journal'))
);

INSERT INTO public.tools (name, duration_min, weight, tool_type) VALUES
  ('Дыхание',                          10,  -5,  'practice'),
  ('Разминка',                          5, -10,  'practice'),
  ('Тренировка',                       60, -40,  'practice'),
  ('Запиши что чувствуешь в дневник',  5,  -15, 'journal'),
  ('Прогулка с подкастом',             15, -20,  'practice'),
  ('Ложись до 9',                       5, -15,  'practice');


-- ─── ОПРОСЫ (шаблоны) ─────────────────────────────────────────────────────
-- base_weight: базовый вклад в скор от факта прохождения опроса в это время
-- red_zone_pct: порог красной зоны в % от максимально возможного скора
CREATE TABLE public.surveys (
  id               int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name             text NOT NULL UNIQUE,
  time_to_initial  time NOT NULL,   -- время push-уведомления и старта
  base_weight      int  NOT NULL DEFAULT 0,
  day_order        int  NOT NULL,   -- порядок в течение дня (1, 2, 3...)
  red_zone_pct     int  NOT NULL DEFAULT 65 CHECK (red_zone_pct BETWEEN 1 AND 100)
);

INSERT INTO public.surveys (name, time_to_initial, base_weight, day_order) VALUES
  ('InitialMorningCheckup',  '03:58', 0,  1),
  ('FirstMorningCheckup',    '07:00', 5,  2),
  ('SecondMorningCheckup',   '10:00', 10, 3),
  ('FirstDailyCheckup',      '13:00', 15, 4),
  ('SecondDailyCheckup',     '16:00', 25, 5),
  ('EveningCheckup',         '19:30', 35, 6);


-- ─── БАНК ВОПРОСОВ ────────────────────────────────────────────────────────
-- key: уникальный идентификатор вопроса (используется в бизнес-логике)
-- type: radio (выбор из ref_table), bool (да/нет)
-- ref_table: 'periods' | 'sleeps' | NULL
CREATE TABLE public.questions (
  id          int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key         text NOT NULL UNIQUE,
  text        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('radio', 'bool', 'counter', 'scale', 'text', 'photo')),
  ref_table   text CHECK (ref_table IN ('periods', 'sleeps', 'stomach_states', 'emotion_types')),
  weight_yes   int,   -- для bool: вес когда ответ true  (отриц. = снижает стресс)
  weight_no    int,   -- для bool: вес когда ответ false (полож. = добавляет стресс)
  weights_json jsonb  -- для scale: {"1":60,"2":40,...} значение → добавка к скору
);

INSERT INTO public.questions (key, text, type, ref_table, weight_yes, weight_no, weights_json) VALUES
  -- Опрос 1: базовые факторы
  ('cycle_phase', 'День цикла?',              'radio', 'periods', NULL,  NULL,  NULL),
  ('sleep',       'Сколько спала?',           'radio', 'sleeps',  NULL,  NULL,  NULL),
  ('toilet',      'Туалет был?',              'bool',  NULL,      -10,   20,    NULL),
  -- Опрос 2: утренний отчёт
  ('warmup',      'Зарядка была?',            'bool',  NULL,      -10,   5,     NULL),
  ('workout',     'Разминка была?',           'bool',  NULL,      -10,   0,     NULL),
  ('water',       'Воду пила?',               'bool',  NULL,      -5,    10,    NULL),
  ('work',        'Работа продолжается?',     'bool',  NULL,      -10,   10,    NULL),
  -- Голод (опрос 1 + 2): шкала 1-10, экстремальные значения = стресс
  ('hunger',      'Голод?',                   'scale', NULL,           NULL,  NULL,  '{"1":60,"2":40,"3":20,"4":0,"5":0,"6":0,"7":0,"8":20,"9":40,"10":60}'),
  -- Состояние живота: radio из stomach_states
  ('stomach',     'Состояние живота?',        'radio', 'stomach_states', NULL,  NULL,  NULL),
  -- Эмоции: radio из emotion_types, заметка хранится в emotion_log
  ('emotion',        'Эмоции?',                  'radio', 'emotion_types',  NULL,  NULL,  NULL),
  -- Завтрак / Обед: спрашивают если не залогировано через виджет
  ('meal_breakfast',  'Завтракала?',                  'bool', NULL, 0,    15,   NULL),
  ('meal_lunch',      'Пообедала?',                   'bool', NULL, 0,    15,   NULL),
  ('meal_dinner',     'Поужинала?',                   'bool', NULL, 0,    15,   NULL),
  ('what_worked',     'Что сегодня получилось?',      'text', NULL, 0,    0,    NULL),
  ('what_failed',     'Что не получилось?',            'text', NULL, 0,    0,    NULL),
  ('tomorrow_goals',  'Мини-цели на завтра',           'text', NULL, 0,    0,    NULL);


-- ─── ВОПРОСЫ ПО ОПРОСАМ (M:M) ────────────────────────────────────────────
-- skip_if_answered_today: не повторять если вопрос уже отвечен сегодня
-- skip_if_value:          если задан — пропускать только когда предыдущий ответ совпадает
--                         null = пропускать при любом ответе; 'true'/'false' = только при этом значении
-- min_survey_occurrence:  с какого опроса дня показывать (1 = с первого)
CREATE TABLE public.survey_question_assignments (
  survey_id              int  REFERENCES public.surveys(id)   ON DELETE CASCADE,
  question_id            int  REFERENCES public.questions(id) ON DELETE CASCADE,
  order_index            int  NOT NULL DEFAULT 0,
  skip_if_answered_today bool NOT NULL DEFAULT true,
  skip_if_value          text DEFAULT NULL,
  min_survey_occurrence  int  NOT NULL DEFAULT 1,
  PRIMARY KEY (survey_id, question_id)
);

INSERT INTO public.survey_question_assignments
  (survey_id, question_id, order_index, skip_if_answered_today, skip_if_value, min_survey_occurrence)
VALUES
  -- Опрос 1: базовые факторы
  (1, 1, 1, true,  NULL,   1),  -- cycle_phase
  (1, 2, 2, true,  NULL,   1),  -- sleep
  (1, 3, 3, true,  NULL,   1),  -- toilet
  -- Опрос 2: утренний отчёт
  (2, 4, 1, false, NULL,   2),  -- workout: всегда спрашивать
  (2, 5, 2, false, NULL,   2),  -- water:   всегда спрашивать
  (2, 6, 3, true,  NULL,   2),  -- work:    пропустить при любом ответе
  (2, 3, 4, true,  'true', 2),  -- toilet:  пропустить только если ответ был 'true'
  -- Голод: всегда спрашивать в обоих опросах (skip_if_answered_today=false)
  (1, 7, 4, false, NULL,   1),  -- hunger в опросе 1
  (2, 7, 5, false, NULL,   2),  -- hunger в опросе 2
  -- Состояние живота: всегда спрашивать в обоих опросах
  (1, 8, 5, false, NULL,   1),  -- stomach в опросе 1
  (2, 8, 6, false, NULL,   2),  -- stomach в опросе 2
  -- Эмоции: всегда спрашивать в обоих опросах
  (1, 9, 6, false, NULL,   1),  -- emotion в опросе 1
  (2, 9, 7, false, NULL,   2),  -- emotion в опросе 2
  -- Завтрак: опрос 2 и 3, пропустить если уже отмечено (в опросе или через виджет)
  (2, 10, 8, true, NULL,    2),  -- meal_breakfast в опросе 2
  -- Опрос 3 (10:00): как опрос 2, работа показывается только если был ответ 'yes', без обеда
  (3, 4,  1, false, NULL,   3),  -- workout
  (3, 5,  2, false, NULL,   3),  -- water
  (3, 6,  3, true, 'false', 3),  -- work: пропустить если предыдущий ответ был 'false' (работа закончена)
  (3, 3,  4, true, 'true',  3),  -- toilet: пропустить если предыдущий ответ был 'true'
  (3, 7,  5, false, NULL,   3),  -- hunger
  (3, 8,  6, false, NULL,   3),  -- stomach
  (3, 9,  7, false, NULL,   3),  -- emotion
  (3, 10, 8, true,  NULL,   3),  -- meal_breakfast
  -- Опрос 4 (14:00): как опрос 3 + вопрос про обед
  (4, 4,  1, false, NULL,   4),  -- workout
  (4, 5,  2, false, NULL,   4),  -- water
  (4, 6,  3, true, 'false', 4),  -- work
  (4, 3,  4, true, 'true',  4),  -- toilet
  (4, 7,  5, false, NULL,   4),  -- hunger
  (4, 8,  6, false, NULL,   4),  -- stomach
  (4, 9,  7, false, NULL,   4),  -- emotion
  (4, 10, 8, true,  NULL,   4),  -- meal_breakfast
  (4, 11, 9, true,  NULL,   4),  -- meal_lunch
  -- Опрос 5 (16:00): как опрос 4, вопроса про ужин пока нет
  (5, 4,  1, false, NULL,   5),
  (5, 5,  2, false, NULL,   5),
  (5, 6,  3, true, 'false', 5),
  (5, 3,  4, true, 'true',  5),
  (5, 7,  5, false, NULL,   5),
  (5, 8,  6, false, NULL,   5),
  (5, 9,  7, false, NULL,   5),
  (5, 10, 8, true,  NULL,   5),   -- meal_breakfast
  (5, 11, 9, true,  NULL,   5),   -- meal_lunch
  -- Опрос 6 (19:30): вечерний — без вопроса о работе, + ужин + рефлексия + мини-цели
  (6, 4,  1, false, NULL,   6),   -- workout
  (6, 5,  2, false, NULL,   6),   -- water
  (6, 3,  3, true, 'true',  6),   -- toilet
  (6, 7,  4, false, NULL,   6),   -- hunger
  (6, 8,  5, false, NULL,   6),   -- stomach
  (6, 9,  6, false, NULL,   6),   -- emotion
  (6, 10, 7, true,  NULL,   6),   -- meal_breakfast
  (6, 11, 8, true,  NULL,   6),   -- meal_lunch
  (6, 12, 9, true,  NULL,   6),   -- meal_dinner
  (6, 13, 10, false, NULL,  6),   -- what_worked
  (6, 14, 11, false, NULL,  6),   -- what_failed
  (6, 15, 12, false, NULL,  6);   -- tomorrow_goals


-- ─── ИНСТРУМЕНТЫ ПО ОПРОСАМ (красная зона) ────────────────────────────────
-- Какие инструменты предлагаются после конкретного опроса при красной зоне
CREATE TABLE public.survey_tools (
  survey_id int REFERENCES public.surveys(id) ON DELETE CASCADE,
  tool_id   int REFERENCES public.tools(id)   ON DELETE CASCADE,
  PRIMARY KEY (survey_id, tool_id)
);

INSERT INTO public.survey_tools (survey_id, tool_id) VALUES
  -- Опрос 1: Дыхание, Разминка, Дневник (Тренировка убрана — слишком ранно)
  (1, 1), (1, 2), (1, 4),
  -- Опрос 2: только короткие (Дыхание, Разминка)
  (2, 1), (2, 2),
  -- Опрос 3: Дыхание, Тренировка, Дневник, Прогулка с подкастом
  (3, 1), (3, 3), (3, 4), (3, 5),
  -- Опрос 4: те же инструменты
  (4, 1), (4, 3), (4, 4), (4, 5),
  -- Опрос 5: те же инструменты
  (5, 1), (5, 3), (5, 4), (5, 5),
  -- Опрос 6: Ложись до 9, Дыхание, Дневник
  (6, 6), (6, 1), (6, 4);


-- ══════════════════════════════════════════════════════════════════════════
-- ДНЕВНЫЕ ТАБЛИЦЫ (пишутся каждый день, растут линейно)
-- ══════════════════════════════════════════════════════════════════════════


-- ─── СЕССИИ ОПРОСОВ ───────────────────────────────────────────────────────
-- Факт прохождения опроса. После подсчёта скора → заполняется daily_score_id
CREATE TABLE public.daily_survey_sessions (
  id             int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id        uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  survey_id      int  REFERENCES public.surveys(id) NOT NULL,
  date           date NOT NULL DEFAULT current_date,
  completed_at   timestamptz DEFAULT now(),
  daily_score_id int  -- FK добавляется ниже, после создания daily_scores
);

CREATE INDEX idx_dss_user_date ON public.daily_survey_sessions (user_id, date DESC);


-- ─── ОТВЕТЫ НА ВОПРОСЫ ────────────────────────────────────────────────────
-- value всегда text: для radio = id из periods/sleeps, для bool = 'true'/'false'
CREATE TABLE public.daily_survey_answers (
  id          int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_id  int  REFERENCES public.daily_survey_sessions(id) ON DELETE CASCADE NOT NULL,
  question_id int  REFERENCES public.questions(id) NOT NULL,
  value       text NOT NULL,
  answered_at timestamptz DEFAULT now()
);

CREATE INDEX idx_dsa_session     ON public.daily_survey_answers (session_id);
CREATE INDEX idx_dsa_user_qdate  ON public.daily_survey_answers (question_id, answered_at DESC);


-- ─── ЛОГ ПЕРЕСЧЁТОВ СКОРА ─────────────────────────────────────────────────
-- Каждый пересчёт = новая строка. Текущий скор = последняя строка за сегодня.
--
-- Источник пересчёта:
--   опрос        → session_id заполнен,  task_id NULL,   is_manual false
--   таска готова → session_id NULL,      task_id заполнен, is_manual false
--   вручную      → session_id NULL,      task_id NULL,   is_manual true
CREATE TABLE public.daily_scores (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL DEFAULT current_date,
  value      int  NOT NULL CHECK (value >= 0),  -- полный скор на момент записи
  session_id int  REFERENCES public.daily_survey_sessions(id),
  task_id    int,  -- FK на daily_tasks (добавляется ниже)
  is_manual  bool NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ds_user_date ON public.daily_scores (user_id, date DESC, created_at DESC);


-- ─── СНЭПШОТ МОДЕЛИ ───────────────────────────────────────────────────────
-- Создаётся ТОЛЬКО при изменении полей модели (через опрос).
-- Каждый снэпшот — ПОЛНОЕ состояние на момент создания (переносит поля из предыдущего).
-- Выполнение таски → только новый daily_score, снэпшот НЕ создаётся.
--
-- *_log: [{time: ISO8601, value: bool}] — накопительный лог за день
CREATE TABLE public.daily_score_snapshots (
  id             int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  daily_score_id int  REFERENCES public.daily_scores(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Опрос 1: базовые факторы
  period_id      int  REFERENCES public.periods(id),
  sleep_id       int  REFERENCES public.sleeps(id),
  toilet_log     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Опрос 2: утренний отчёт
  workout_log    jsonb NOT NULL DEFAULT '[]'::jsonb,
  water_log      jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_done      bool,
  stomach_id      int  REFERENCES public.stomach_states(id),
  emotion_type_id int  REFERENCES public.emotion_types(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_dsnap_score ON public.daily_score_snapshots (daily_score_id);


-- ─── ЛОГ ПРИЁМОВ ПИЩИ ────────────────────────────────────────────────────
-- Один приём = одна строка. meal_type: 'breakfast'|'lunch'|'dinner'
-- in_window: попал ли приём в целевое временное окно (6-8, 12-14, 16-18)
CREATE TABLE public.meal_log (
  id           int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id      uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date         date NOT NULL DEFAULT current_date,
  meal_type    text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  in_window    bool NOT NULL DEFAULT false,
  photo_url    text,
  session_id   int  REFERENCES public.daily_survey_sessions(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_ml_user_date ON public.meal_log (user_id, date DESC);


-- ─── ЛОГ АКТИВНОСТИ ────────────────────────────────────────────────────────
-- Одна строка = одна сессия активности. Цель: 3 в день (зарядка, тренировка, прогулка).
CREATE TABLE public.activity_log (
  id            int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date          date NOT NULL DEFAULT current_date,
  activity_type text NOT NULL CHECK (activity_type IN ('warmup', 'workout', 'walk')),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_al_user_date ON public.activity_log (user_id, date DESC);


-- ─── ЛОГ ВОДЫ ─────────────────────────────────────────────────────────────
-- Одна строка = один стакан. Цель: 8 стаканов в день.
CREATE TABLE public.water_log (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_wl_user_date ON public.water_log (user_id, date DESC);


-- ─── ЛОГ ЭМОЦИЙ ──────────────────────────────────────────────────────────
-- Одна запись = один ответ. Хранит и выбранную эмоцию и опциональную текстовую заметку.
CREATE TABLE public.emotion_log (
  id              int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id         uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date            date NOT NULL DEFAULT current_date,
  emotion_type_id int  REFERENCES public.emotion_types(id),
  note            text,
  session_id      int  REFERENCES public.daily_survey_sessions(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_el_user_date ON public.emotion_log (user_id, date DESC);


-- ─── ЛОГ ГОЛОДА ───────────────────────────────────────────────────────────
-- Отдельная таблица: одна запись = один ответ на вопрос о голоде.
-- Несколько записей в день (опрос 1 + опрос 2 и т.д.)
CREATE TABLE public.hunger_log (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL DEFAULT current_date,
  value      int  NOT NULL CHECK (value BETWEEN 1 AND 10),
  session_id int  REFERENCES public.daily_survey_sessions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hl_user_date ON public.hunger_log (user_id, date DESC);


-- ─── МИНИ-ЦЕЛИ ────────────────────────────────────────────────────────────
-- Заполняются в вечернем опросе для следующего дня. Показываются как виджет на главной.
CREATE TABLE public.mini_goals (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL,
  text       text NOT NULL,
  is_done    bool NOT NULL DEFAULT false,
  session_id int  REFERENCES public.daily_survey_sessions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_mg_user_date ON public.mini_goals (user_id, date DESC);


-- ─── ДНЕВНЫЕ ЗАДАЧИ ───────────────────────────────────────────────────────
-- Инструменты выбранные в красной зоне → висят на главной до выполнения.
-- При is_complete = true → пересчёт скора (INSERT daily_scores с task_id).
CREATE TABLE public.daily_tasks (
  id           int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id      uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tool_id      int  REFERENCES public.tools(id) NOT NULL,
  session_id   int  REFERENCES public.daily_survey_sessions(id),
  date         date NOT NULL DEFAULT current_date,
  is_complete  bool NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_dt_user_date ON public.daily_tasks (user_id, date DESC);


-- ─── ДНЕВНИК ──────────────────────────────────────────────────────────────
-- Каждая запись привязана к задаче (task_id) и дню.
-- audio_url → Supabase Storage bucket 'journal-audio'
-- text      → транскрипт (speech-to-text) или ручной ввод
CREATE TABLE public.journal_entries (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL DEFAULT current_date,
  text       text,
  audio_url  text,
  source     text NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice')),
  task_id    int  REFERENCES public.daily_tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_je_user_date ON public.journal_entries (user_id, date DESC);


-- ─── ЗАМЫКАЕМ FK ──────────────────────────────────────────────────────────
ALTER TABLE public.daily_scores
  ADD CONSTRAINT fk_ds_task
  FOREIGN KEY (task_id) REFERENCES public.daily_tasks(id);

ALTER TABLE public.daily_survey_sessions
  ADD CONSTRAINT fk_dss_score
  FOREIGN KEY (daily_score_id) REFERENCES public.daily_scores(id);


-- ══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════

-- Профиль и чат
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profiles"      ON public.profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "own chat"          ON public.chat_messages FOR ALL USING (auth.uid() = user_id);

-- Справочники: читает любой авторизованный пользователь, пишет только сервис
ALTER TABLE public.toilet_states              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sleeps                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_question_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_tools               ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stomach_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read stomach"    ON public.stomach_states              FOR SELECT USING (auth.role() = 'authenticated');
ALTER TABLE public.emotion_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read emotion_types" ON public.emotion_types            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read toilet"     ON public.toilet_states               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read periods"    ON public.periods                     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read sleeps"     ON public.sleeps                      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read tools"      ON public.tools                       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read surveys"    ON public.surveys                     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read questions"  ON public.questions                   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read sqa"        ON public.survey_question_assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read st"         ON public.survey_tools                FOR SELECT USING (auth.role() = 'authenticated');

-- Дневные таблицы: только свои данные
ALTER TABLE public.daily_survey_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_survey_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tasks           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions" ON public.daily_survey_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own scores"   ON public.daily_scores          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own tasks"    ON public.daily_tasks           FOR ALL USING (auth.uid() = user_id);

-- Ответы и снэпшоты доступны через владельца сессии/скора
CREATE POLICY "own answers" ON public.daily_survey_answers FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.daily_survey_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "own snapshots" ON public.daily_score_snapshots FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.daily_scores ds
    WHERE ds.id = daily_score_id AND ds.user_id = auth.uid()
  )
);

-- Приёмы пищи и вода
ALTER TABLE public.meal_log      ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meals"        ON public.meal_log      FOR ALL USING (auth.uid() = user_id);
ALTER TABLE public.activity_log  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity"     ON public.activity_log  FOR ALL USING (auth.uid() = user_id);
ALTER TABLE public.water_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own water"  ON public.water_log FOR ALL USING (auth.uid() = user_id);

-- Эмоции
ALTER TABLE public.emotion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own emotion" ON public.emotion_log FOR ALL USING (auth.uid() = user_id);

-- Голод
ALTER TABLE public.hunger_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hunger" ON public.hunger_log FOR ALL USING (auth.uid() = user_id);

-- Дневник
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal" ON public.journal_entries FOR ALL USING (auth.uid() = user_id);
ALTER TABLE public.mini_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals"   ON public.mini_goals   FOR ALL USING (auth.uid() = user_id);


-- ─── STORAGE: голосовые записи дневника ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-audio', 'journal-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Загружать может только владелец (путь начинается с user_id)
CREATE POLICY "upload own audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'journal-audio'
    AND auth.uid()::text = (storage.foldername(name))[1]);

-- Читать (воспроизводить) — публично по URL (bucket public=true, политика не нужна)


-- ══════════════════════════════════════════════════════════════════════════
-- БИЗНЕС-ЛОГИКА (Postgres функции)
-- ══════════════════════════════════════════════════════════════════════════


-- ─── ПЕРЕСЧЁТ СКОРА ───────────────────────────────────────────────────────
-- Вызывается после завершения опроса.
-- Возвращает итоговый скор (сумма всех весов, минимум 0).
--
-- toilet: true = был (+влияние −10), false = не был (+влияние +10)
CREATE OR REPLACE FUNCTION public.calculate_score(
  p_survey_id  int,
  p_period_id  int,
  p_sleep_id   int,
  p_toilet     bool
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_base    int;
  v_period  int;
  v_sleep   int;
  v_toilet  int;
BEGIN
  SELECT base_weight INTO v_base   FROM public.surveys WHERE id = p_survey_id;
  SELECT weight      INTO v_period FROM public.periods WHERE id = p_period_id;
  SELECT weight      INTO v_sleep  FROM public.sleeps  WHERE id = p_sleep_id;

  v_toilet := CASE WHEN p_toilet THEN -10 ELSE 10 END;

  RETURN GREATEST(0,
    COALESCE(v_base, 0)
    + COALESCE(v_period, 0)
    + COALESCE(v_sleep, 0)
    + v_toilet
  );
END;
$$;


-- ─── МАКСИМАЛЬНО ВОЗМОЖНЫЙ СКОР ───────────────────────────────────────────
-- Используется для вычисления % красной зоны.
-- MVP: base + худшая фаза (30) + худший сон (20) + нет туалета (10)
CREATE OR REPLACE FUNCTION public.max_possible_score(p_survey_id int)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT base_weight + 30 + 20 + 10
  FROM public.surveys
  WHERE id = p_survey_id;
$$;


-- ─── ПРОВЕРКА КРАСНОЙ ЗОНЫ ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_red_zone(p_score int, p_survey_id int)
RETURNS bool
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p_score >= (
    public.max_possible_score(p_survey_id)
    * red_zone_pct::numeric / 100
  )
  FROM public.surveys
  WHERE id = p_survey_id;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- ДИАГРАММА ФЛОУ (для справки)
-- ══════════════════════════════════════════════════════════════════════════
--
-- [PUSH 03:58] ──► открытие приложения
--                      │
--                      ▼
--             daily_survey_sessions (INSERT, survey_id=1)
--                      │
--                  показ вопросов
--                      │
--             daily_survey_answers (INSERT × 3)
--                      │
--                calculate_score()
--                      │
--             daily_scores (INSERT, value=X, session_id)
--             daily_score_snapshots (INSERT, period_id, sleep_id, toilet_log)
--             daily_survey_sessions.daily_score_id (UPDATE)
--                      │
--               is_red_zone(X)?
--              YES ────┤
--                      ▼
--              показ инструментов (из survey_tools WHERE survey_id=1)
--                      │
--              пользователь выбирает
--                      ▼
--             daily_tasks (INSERT × N, is_complete=false)
--                      │
--              висят на главной
--                      │
--              тап → complete task
--                      ▼
--             daily_tasks (UPDATE is_complete=true, completed_at)
--             daily_scores (INSERT, value = prev_value + tool.weight, task_id)
--                          ↑ НЕТ нового снэпшота
-- ══════════════════════════════════════════════════════════════════════════
