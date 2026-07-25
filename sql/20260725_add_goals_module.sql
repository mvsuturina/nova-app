-- NOVA: модуль долгосрочных целей + план дня + привязка Telegram-бота.
-- Безопасная инкрементальная миграция: существующие таблицы и данные не меняет.
-- Изолировано от логики скора стресса — ничего здесь не пишет в daily_scores /
-- daily_score_snapshots и не читается из recalculateScore().

-- ─── ЦЕЛИ ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id          int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id     uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  description text,
  metric      text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'experiment', 'paused', 'done')),
  deadline    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_status
  ON public.goals (user_id, status);

-- ─── ПЛАН ДНЯ ───────────────────────────────────────────────────────────
-- Один план на пользователя на дату.
CREATE TABLE IF NOT EXISTS public.goal_plans (
  id         int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date       date NOT NULL,
  focus      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_plans_user_date
  ON public.goal_plans (user_id, date);

-- ─── ЗАДАЧИ ПЛАНА ДНЯ ───────────────────────────────────────────────────
-- goal_id nullable — задача может быть не привязана ни к одной цели.
-- duration_minutes — опционально, для целей с числовым маркером прогресса
-- (например «английский» — часы/занятия в неделю), считается в /progress бота.
CREATE TABLE IF NOT EXISTS public.goal_plan_tasks (
  id               int  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  plan_id          int  REFERENCES public.goal_plans(id) ON DELETE CASCADE NOT NULL,
  goal_id          int  REFERENCES public.goals(id) ON DELETE SET NULL,
  time             time,
  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  priority         text NOT NULL CHECK (priority IN ('A', 'B', 'C')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  note             text,
  remind           bool NOT NULL DEFAULT true,
  reminded_at      timestamptz,
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_plan_tasks_plan
  ON public.goal_plan_tasks (plan_id);

CREATE INDEX IF NOT EXISTS idx_goal_plan_tasks_goal
  ON public.goal_plan_tasks (goal_id);

-- Напоминания бота: только pending + remind + ещё не отправлено.
CREATE INDEX IF NOT EXISTS idx_goal_plan_tasks_reminders
  ON public.goal_plan_tasks (time)
  WHERE remind = true AND status = 'pending' AND reminded_at IS NULL;

-- ─── ПРИВЯЗКА TELEGRAM ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telegram_links (
  id               int    PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id          uuid   REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  telegram_chat_id bigint NOT NULL,
  linked_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_links_chat_id
  ON public.telegram_links (telegram_chat_id);

-- ─── RLS ────────────────────────────────────────────────────────────────
-- SPA работает через anon key + auth.uid(). Бот обходит RLS через service role key.
ALTER TABLE public.goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_links  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own goals" ON public.goals;
CREATE POLICY "own goals" ON public.goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own goal_plans" ON public.goal_plans;
CREATE POLICY "own goal_plans" ON public.goal_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- goal_plan_tasks не хранит user_id напрямую — доступ через владельца плана.
DROP POLICY IF EXISTS "own goal_plan_tasks" ON public.goal_plan_tasks;
CREATE POLICY "own goal_plan_tasks" ON public.goal_plan_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.goal_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.goal_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own telegram_links" ON public.telegram_links;
CREATE POLICY "own telegram_links" ON public.telegram_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
