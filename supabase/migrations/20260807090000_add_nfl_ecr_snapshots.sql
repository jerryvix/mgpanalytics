-- FantasyPros expert consensus ranks (ECR), mirrored daily by the
-- DynastyProcess data repo. Powers the Fantasy tab's 2026 draft board with
-- projected positional ranks (RB1, RB2, ...). gsis_id resolves through the
-- repo's own fantasypros_id -> gsis_id crosswalk at ingest.
CREATE TABLE IF NOT EXISTS public.nfl_ecr_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  source text NOT NULL DEFAULT 'fp_ppr_redraft',
  fp_id text NOT NULL,
  player_name text NOT NULL,
  position text,
  team text,
  ecr numeric NOT NULL,          -- average expert overall rank, e.g. 3.33
  sd numeric,
  best int,
  worst int,
  gsis_id text,
  scrape_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, source, fp_id)
);

CREATE INDEX IF NOT EXISTS idx_nes_season ON public.nfl_ecr_snapshots(season, source, position);

ALTER TABLE public.nfl_ecr_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read nfl_ecr_snapshots" ON public.nfl_ecr_snapshots;
CREATE POLICY "Anyone can read nfl_ecr_snapshots"
  ON public.nfl_ecr_snapshots FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert nfl_ecr_snapshots" ON public.nfl_ecr_snapshots;
CREATE POLICY "Admins can insert nfl_ecr_snapshots"
  ON public.nfl_ecr_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update nfl_ecr_snapshots" ON public.nfl_ecr_snapshots;
CREATE POLICY "Admins can update nfl_ecr_snapshots"
  ON public.nfl_ecr_snapshots FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete nfl_ecr_snapshots" ON public.nfl_ecr_snapshots;
CREATE POLICY "Admins can delete nfl_ecr_snapshots"
  ON public.nfl_ecr_snapshots FOR DELETE
  TO authenticated
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
