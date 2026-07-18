-- NOVA: личный справочник сохранённой еды/рецептов.
-- Безопасная инкрементальная миграция: существующие таблицы и данные не меняет.

CREATE TABLE IF NOT EXISTS public.saved_recipes (
  id             bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id        uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  portion_grams  numeric(8,2) NOT NULL CHECK (portion_grams > 0),
  nutrition_json jsonb NOT NULL CHECK (jsonb_typeof(nutrition_json) = 'object'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_recipes_user_name
  ON public.saved_recipes (user_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_recipes_user_normalized_name
  ON public.saved_recipes (user_id, lower(btrim(name)));

ALTER TABLE public.saved_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own saved recipes" ON public.saved_recipes;
CREATE POLICY "own saved recipes" ON public.saved_recipes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
