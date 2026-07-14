-- MLB batting stats support. Additive only — no existing columns touched.
-- player_season_stats and player_game_logs are shared multi-sport tables keyed
-- by a `sport` column; these columns are populated for sport='MLB' rows.

ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS at_bats integer,
  ADD COLUMN IF NOT EXISTS hits integer,
  ADD COLUMN IF NOT EXISTS doubles integer,
  ADD COLUMN IF NOT EXISTS triples integer,
  ADD COLUMN IF NOT EXISTS home_runs integer,
  ADD COLUMN IF NOT EXISTS rbi integer,
  ADD COLUMN IF NOT EXISTS walks integer,
  ADD COLUMN IF NOT EXISTS strikeouts integer,
  ADD COLUMN IF NOT EXISTS stolen_bases integer,
  ADD COLUMN IF NOT EXISTS batting_avg numeric,
  ADD COLUMN IF NOT EXISTS on_base_pct numeric,
  ADD COLUMN IF NOT EXISTS slugging_pct numeric,
  ADD COLUMN IF NOT EXISTS ops numeric,
  ADD COLUMN IF NOT EXISTS hit_streak integer,
  ADD COLUMN IF NOT EXISTS hit_streak_avg numeric;

ALTER TABLE public.player_game_logs
  ADD COLUMN IF NOT EXISTS at_bats integer,
  ADD COLUMN IF NOT EXISTS hits integer,
  ADD COLUMN IF NOT EXISTS doubles integer,
  ADD COLUMN IF NOT EXISTS triples integer,
  ADD COLUMN IF NOT EXISTS home_runs integer,
  ADD COLUMN IF NOT EXISTS rbi integer,
  ADD COLUMN IF NOT EXISTS walks integer,
  ADD COLUMN IF NOT EXISTS strikeouts integer,
  ADD COLUMN IF NOT EXISTS stolen_bases integer,
  ADD COLUMN IF NOT EXISTS total_bases integer;
