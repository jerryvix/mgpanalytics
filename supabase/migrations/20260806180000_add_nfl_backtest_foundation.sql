-- Projection Accuracy Backtester, foundation layer: a player identity
-- crosswalk keyed by nflverse GSIS id. One ingest (nflverse players.csv,
-- players_components release) solves three problems at once: name->id
-- resolution for external sources (FFC ADP, prop lines), draft capital
-- (draft_round/draft_pick, NULL round = UDFA), and experience year
-- (rookie_season). Refreshed by sync-nfl-player-ids.

CREATE TABLE IF NOT EXISTS public.nfl_player_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gsis_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  name_normalized text NOT NULL,     -- normalizePlayerName() output
  position text,                     -- nflverse abbreviation (QB, RB, ...)
  position_group text,
  latest_team text,
  rookie_season int,                 -- first NFL season (entry year)
  last_season int,
  draft_year int,
  draft_round int,                   -- NULL = undrafted (UDFA)
  draft_pick int,
  draft_team text,
  espn_id text,
  pfr_id text,
  sleeper_id text,                   -- reserved for a future ff_playerids ingest
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npi_name ON public.nfl_player_ids(name_normalized, position);

ALTER TABLE public.nfl_player_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read nfl_player_ids" ON public.nfl_player_ids;
CREATE POLICY "Anyone can read nfl_player_ids"
  ON public.nfl_player_ids FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert nfl_player_ids" ON public.nfl_player_ids;
CREATE POLICY "Admins can insert nfl_player_ids"
  ON public.nfl_player_ids FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update nfl_player_ids" ON public.nfl_player_ids;
CREATE POLICY "Admins can update nfl_player_ids"
  ON public.nfl_player_ids FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete nfl_player_ids" ON public.nfl_player_ids;
CREATE POLICY "Admins can delete nfl_player_ids"
  ON public.nfl_player_ids FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Manual escape hatch for names the automatic ladder cannot resolve
-- (nicknames, source typos, true duplicates). source matches the
-- nfl_preseason_lines/nfl_adp_snapshots source values. Fixing a miss =
-- insert a row here + re-run that season's sync (idempotent upserts
-- re-resolve).
CREATE TABLE IF NOT EXISTS public.nfl_name_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_name text NOT NULL,
  gsis_id text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_name)
);

ALTER TABLE public.nfl_name_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read nfl_name_overrides" ON public.nfl_name_overrides;
CREATE POLICY "Anyone can read nfl_name_overrides"
  ON public.nfl_name_overrides FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert nfl_name_overrides" ON public.nfl_name_overrides;
CREATE POLICY "Admins can insert nfl_name_overrides"
  ON public.nfl_name_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update nfl_name_overrides" ON public.nfl_name_overrides;
CREATE POLICY "Admins can update nfl_name_overrides"
  ON public.nfl_name_overrides FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete nfl_name_overrides" ON public.nfl_name_overrides;
CREATE POLICY "Admins can delete nfl_name_overrides"
  ON public.nfl_name_overrides FOR DELETE
  TO authenticated
  USING (public.is_admin());

INSERT INTO public.sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('NFL', 'player_ids', '7d', true)
ON CONFLICT (sport, data_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
