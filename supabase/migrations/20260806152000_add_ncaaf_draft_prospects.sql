-- CFB Matchup Intelligence, Signal 1 (NFL draft talent): consensus big-board
-- prospects for the upcoming draft, scraped weekly from Tankathon's Top 101.
-- The board is replaced per sync run (upsert + prune rows that fell off), so
-- captured_at on any row dates the whole board; a stale board (>21 days)
-- degrades the signal to "insufficient" client-side rather than lying.
-- School names are stored to match CFBD school names where they differ.

CREATE TABLE IF NOT EXISTS public.ncaaf_draft_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_year int NOT NULL,
  rank int NOT NULL,
  player_name text NOT NULL,
  position text,
  school text NOT NULL,
  height text,
  weight int,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_year, player_name)
);

CREATE INDEX IF NOT EXISTS idx_ndpr_school ON public.ncaaf_draft_prospects(school, draft_year);

ALTER TABLE public.ncaaf_draft_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read ncaaf_draft_prospects" ON public.ncaaf_draft_prospects;
CREATE POLICY "Anyone can read ncaaf_draft_prospects"
  ON public.ncaaf_draft_prospects FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ncaaf_draft_prospects" ON public.ncaaf_draft_prospects;
CREATE POLICY "Admins can insert ncaaf_draft_prospects"
  ON public.ncaaf_draft_prospects FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update ncaaf_draft_prospects" ON public.ncaaf_draft_prospects;
CREATE POLICY "Admins can update ncaaf_draft_prospects"
  ON public.ncaaf_draft_prospects FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ncaaf_draft_prospects" ON public.ncaaf_draft_prospects;
CREATE POLICY "Admins can delete ncaaf_draft_prospects"
  ON public.ncaaf_draft_prospects FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Register the weekly board refresh with the dispatcher
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('NCAAF', 'draft_board', '7d', true)
ON CONFLICT (sport, data_type) DO NOTHING;

-- Refresh PostgREST schema cache so the REST API serves the new table
-- immediately (required when applying DDL outside the normal migration runner).
NOTIFY pgrst, 'reload schema';
