-- Follows/Favorites + login-streak gamification. New user-scoped tables with
-- row-level security so each user only reads/writes their own rows.

-- ---- Follows ----
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('team','player')),
  entity_key text NOT NULL,      -- team "SPORT:Team Name" or player uuid
  entity_label text,             -- display name
  sport text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_key)
);
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own follows select" ON public.user_follows;
CREATE POLICY "own follows select" ON public.user_follows
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own follows insert" ON public.user_follows;
CREATE POLICY "own follows insert" ON public.user_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own follows delete" ON public.user_follows;
CREATE POLICY "own follows delete" ON public.user_follows
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---- Streaks ----
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  total_visits int NOT NULL DEFAULT 0,
  last_visit_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own streak select" ON public.user_streaks;
CREATE POLICY "own streak select" ON public.user_streaks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomic, tamper-resistant streak update. Runs as definer; only ever touches
-- the caller's own row via auth.uid().
CREATE OR REPLACE FUNCTION public.record_daily_visit()
RETURNS public.user_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rec public.user_streaks;
  today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO rec FROM public.user_streaks WHERE user_id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, total_visits, last_visit_date)
    VALUES (uid, 1, 1, 1, today)
    RETURNING * INTO rec;
    RETURN rec;
  END IF;

  IF rec.last_visit_date = today THEN
    RETURN rec;  -- already counted today
  ELSIF rec.last_visit_date = today - 1 THEN
    UPDATE public.user_streaks SET
      current_streak = rec.current_streak + 1,
      longest_streak = GREATEST(rec.longest_streak, rec.current_streak + 1),
      total_visits = rec.total_visits + 1,
      last_visit_date = today,
      updated_at = now()
    WHERE user_id = uid RETURNING * INTO rec;
  ELSE
    UPDATE public.user_streaks SET
      current_streak = 1,
      total_visits = rec.total_visits + 1,
      last_visit_date = today,
      updated_at = now()
    WHERE user_id = uid RETURNING * INTO rec;
  END IF;

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_daily_visit() TO authenticated;
