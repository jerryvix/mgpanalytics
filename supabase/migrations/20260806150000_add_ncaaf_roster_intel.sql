-- CFB Matchup Intelligence, Signal 3 (roster continuity): returning
-- production, transfer portal moves, and NFL draft departures per school,
-- ingested from CollegeFootballData.com (CFBD). School names are stored as
-- CFBD school names ("Alabama", "Miami (OH)") so joins between these tables
-- are exact; translation from ESPN display names happens client-side in
-- src/utils/cfbdSchools.ts.

CREATE TABLE IF NOT EXISTS public.ncaaf_returning_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  school text NOT NULL,
  conference text,
  total_ppa numeric,
  percent_ppa numeric,               -- share of prior-season PPA returning (0-100)
  percent_passing_ppa numeric,
  percent_receiving_ppa numeric,
  percent_rushing_ppa numeric,
  usage_returning numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, school)
);

CREATE INDEX IF NOT EXISTS idx_nrp_school ON public.ncaaf_returning_production(school, season);

CREATE TABLE IF NOT EXISTS public.ncaaf_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,               -- portal cycle year (CFBD convention)
  player_name text NOT NULL,
  position text,
  origin_school text,
  destination_school text,           -- null = in portal / undecided
  transfer_date date,
  rating numeric,
  stars int,
  eligibility text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, player_name, origin_school)
);

CREATE INDEX IF NOT EXISTS idx_ntr_origin ON public.ncaaf_transfers(origin_school, season);
CREATE INDEX IF NOT EXISTS idx_ntr_dest ON public.ncaaf_transfers(destination_school, season);

CREATE TABLE IF NOT EXISTS public.ncaaf_draft_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_year int NOT NULL,
  round int,
  overall_pick int,
  nfl_team text,
  player_name text NOT NULL,
  position text,
  college_school text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_year, overall_pick)
);

CREATE INDEX IF NOT EXISTS idx_ndp_school ON public.ncaaf_draft_picks(college_school, draft_year);

ALTER TABLE public.ncaaf_returning_production ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncaaf_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncaaf_draft_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read ncaaf_returning_production" ON public.ncaaf_returning_production;
CREATE POLICY "Anyone can read ncaaf_returning_production"
  ON public.ncaaf_returning_production FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ncaaf_returning_production" ON public.ncaaf_returning_production;
CREATE POLICY "Admins can insert ncaaf_returning_production"
  ON public.ncaaf_returning_production FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update ncaaf_returning_production" ON public.ncaaf_returning_production;
CREATE POLICY "Admins can update ncaaf_returning_production"
  ON public.ncaaf_returning_production FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ncaaf_returning_production" ON public.ncaaf_returning_production;
CREATE POLICY "Admins can delete ncaaf_returning_production"
  ON public.ncaaf_returning_production FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read ncaaf_transfers" ON public.ncaaf_transfers;
CREATE POLICY "Anyone can read ncaaf_transfers"
  ON public.ncaaf_transfers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ncaaf_transfers" ON public.ncaaf_transfers;
CREATE POLICY "Admins can insert ncaaf_transfers"
  ON public.ncaaf_transfers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update ncaaf_transfers" ON public.ncaaf_transfers;
CREATE POLICY "Admins can update ncaaf_transfers"
  ON public.ncaaf_transfers FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ncaaf_transfers" ON public.ncaaf_transfers;
CREATE POLICY "Admins can delete ncaaf_transfers"
  ON public.ncaaf_transfers FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read ncaaf_draft_picks" ON public.ncaaf_draft_picks;
CREATE POLICY "Anyone can read ncaaf_draft_picks"
  ON public.ncaaf_draft_picks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ncaaf_draft_picks" ON public.ncaaf_draft_picks;
CREATE POLICY "Admins can insert ncaaf_draft_picks"
  ON public.ncaaf_draft_picks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update ncaaf_draft_picks" ON public.ncaaf_draft_picks;
CREATE POLICY "Admins can update ncaaf_draft_picks"
  ON public.ncaaf_draft_picks FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ncaaf_draft_picks" ON public.ncaaf_draft_picks;
CREATE POLICY "Admins can delete ncaaf_draft_picks"
  ON public.ncaaf_draft_picks FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- One row per (school, season): the year-over-year continuity read.
-- Draft departures for season N are the picks in draft year N (players who
-- left after the N-1 season), same offset CFBD uses for portal cycles.
CREATE OR REPLACE VIEW public.ncaaf_roster_continuity
WITH (security_invoker = true) AS
SELECT
  rp.season,
  rp.school,
  rp.conference,
  rp.percent_ppa,
  rp.percent_passing_ppa,
  rp.percent_receiving_ppa,
  rp.percent_rushing_ppa,
  rp.usage_returning,
  COALESCE(t_in.cnt, 0)  AS portal_in,
  COALESCE(t_out.cnt, 0) AS portal_out,
  COALESCE(t_in.cnt, 0) - COALESCE(t_out.cnt, 0) AS net_portal,
  COALESCE(dp.cnt, 0)    AS draft_departures
FROM public.ncaaf_returning_production rp
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt FROM public.ncaaf_transfers t
  WHERE t.destination_school = rp.school AND t.season = rp.season
) t_in ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt FROM public.ncaaf_transfers t
  WHERE t.origin_school = rp.school AND t.season = rp.season
) t_out ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt FROM public.ncaaf_draft_picks d
  WHERE d.college_school = rp.school AND d.draft_year = rp.season
) dp ON true;

-- Register the weekly job with the dispatcher
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('NCAAF', 'roster_intel', '7d', true)
ON CONFLICT (sport, data_type) DO NOTHING;

-- Refresh PostgREST schema cache so the REST API serves the new tables/view
-- immediately (required when applying DDL outside the normal migration runner).
NOTIFY pgrst, 'reload schema';
