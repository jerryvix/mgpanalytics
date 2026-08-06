-- Fantasy trajectory engine: weekly PPR scoring rows ingested from nflverse
-- (stats_player release) plus live views computing positional finishes.
-- Self-contained from the BDL tables — nflverse keys players by GSIS id and
-- carries each player's position for that season, so historical ranks stay
-- correct even for retired/departed players.

CREATE TABLE IF NOT EXISTS public.nfl_fantasy_weekly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gsis_id text NOT NULL,             -- nflverse player_id
  player_name text NOT NULL,         -- nflverse player_display_name
  position text NOT NULL,            -- position that season (historical-accurate)
  pos_group text NOT NULL CHECK (pos_group IN ('QB','RB','WR','TE')),
  season int NOT NULL,
  week int NOT NULL,
  season_type text NOT NULL CHECK (season_type IN ('REG','POST')),
  team text,
  fantasy_points numeric,
  fantasy_points_ppr numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gsis_id, season, week, season_type)
);

CREATE INDEX IF NOT EXISTS idx_nfw_season ON public.nfl_fantasy_weekly(season, season_type, pos_group);
CREATE INDEX IF NOT EXISTS idx_nfw_player ON public.nfl_fantasy_weekly(gsis_id, season);

ALTER TABLE public.nfl_fantasy_weekly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read nfl_fantasy_weekly" ON public.nfl_fantasy_weekly;
CREATE POLICY "Anyone can read nfl_fantasy_weekly"
  ON public.nfl_fantasy_weekly FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert nfl_fantasy_weekly" ON public.nfl_fantasy_weekly;
CREATE POLICY "Admins can insert nfl_fantasy_weekly"
  ON public.nfl_fantasy_weekly FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update nfl_fantasy_weekly" ON public.nfl_fantasy_weekly;
CREATE POLICY "Admins can update nfl_fantasy_weekly"
  ON public.nfl_fantasy_weekly FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete nfl_fantasy_weekly" ON public.nfl_fantasy_weekly;
CREATE POLICY "Admins can delete nfl_fantasy_weekly"
  ON public.nfl_fantasy_weekly FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Season-end positional finishes (Layer 1) + points-per-game ranks (Layer 1b).
-- WR and TE rank separately per standard fantasy convention. RANK() lets ties
-- share a finish. PPG rank only among players with >= 6 games — filters
-- one-week wonders while keeping half-season injury cases, which are exactly
-- the players the PPG view exists to surface.
CREATE OR REPLACE VIEW public.nfl_fantasy_season_ranks
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    gsis_id,
    season,
    (array_agg(player_name ORDER BY week DESC))[1] AS player_name,
    mode() WITHIN GROUP (ORDER BY position)         AS position,
    mode() WITHIN GROUP (ORDER BY pos_group)        AS pos_group,
    (array_agg(team ORDER BY week DESC))[1]         AS team,
    round(sum(fantasy_points), 2)                   AS total_std,
    round(sum(fantasy_points_ppr), 2)               AS total_ppr,
    count(*)::int                                   AS games
  FROM public.nfl_fantasy_weekly
  WHERE season_type = 'REG'
  GROUP BY gsis_id, season
)
SELECT
  a.gsis_id,
  a.season,
  a.player_name,
  a.position,
  a.pos_group,
  a.team,
  a.total_std,
  a.total_ppr,
  a.games,
  round(a.total_ppr / NULLIF(a.games, 0), 2) AS ppg_ppr,
  (RANK() OVER (PARTITION BY a.season, a.pos_group ORDER BY a.total_ppr DESC))::int AS position_rank,
  CASE WHEN a.games >= 6 THEN
    (RANK() OVER (PARTITION BY a.season, a.pos_group, (a.games >= 6)
                  ORDER BY a.total_ppr / NULLIF(a.games, 0) DESC))::int
  END AS ppg_position_rank
FROM agg a;

-- Second-half momentum window (Layer 1c): weeks 10–18 of the regular season.
-- The REG filter makes postseason week-numbering collisions impossible.
CREATE OR REPLACE VIEW public.nfl_fantasy_second_half_ranks
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    gsis_id,
    season,
    (array_agg(player_name ORDER BY week DESC))[1] AS player_name,
    mode() WITHIN GROUP (ORDER BY pos_group)        AS pos_group,
    round(sum(fantasy_points_ppr), 2)               AS second_half_ppr,
    count(*)::int                                   AS second_half_games
  FROM public.nfl_fantasy_weekly
  WHERE season_type = 'REG' AND week BETWEEN 10 AND 18
  GROUP BY gsis_id, season
)
SELECT
  a.gsis_id,
  a.season,
  a.player_name,
  a.pos_group,
  a.second_half_ppr,
  a.second_half_games,
  round(a.second_half_ppr / NULLIF(a.second_half_games, 0), 2) AS second_half_ppg,
  (RANK() OVER (PARTITION BY a.season, a.pos_group ORDER BY a.second_half_ppr DESC))::int AS second_half_rank
FROM agg a;

-- Refresh PostgREST schema cache so the REST API serves the new table/views
-- immediately (required when applying DDL outside the normal migration runner).
NOTIFY pgrst, 'reload schema';
