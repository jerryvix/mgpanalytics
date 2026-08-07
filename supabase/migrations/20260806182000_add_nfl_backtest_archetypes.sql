-- Projection Accuracy Backtester, Tier 2: per-player-season archetype
-- attributes and the flagship player-season grain. Both are VIEWS — every
-- input (modal team per season, rookie year, draft capital) already lives in
-- nfl_fantasy_weekly and nfl_player_ids, so deriving on read means no sync
-- job and no staleness. snap_share is a NULL placeholder until the Phase 4
-- snap-counts ingest lands (nflverse snap_counts, 2012+, CC-BY).

-- Situation-change semantics: team is the player's modal REG-season team;
-- new_team compares against the previous season *present in the data*
-- (a gap year to the same team is not a change; to a new team it is).
-- NULL new_team = no prior season in the window (rookie or pre-backfill).
CREATE OR REPLACE VIEW public.nfl_player_seasons
WITH (security_invoker = true) AS
WITH season_team AS (
  SELECT
    gsis_id,
    season,
    mode() WITHIN GROUP (ORDER BY team) AS team
  FROM public.nfl_fantasy_weekly
  WHERE season_type = 'REG'
  GROUP BY gsis_id, season
),
with_prev AS (
  SELECT
    gsis_id,
    season,
    team,
    LAG(team) OVER (PARTITION BY gsis_id ORDER BY season) AS prev_team
  FROM season_team
)
SELECT
  wp.gsis_id,
  wp.season,
  wp.team,
  wp.prev_team,
  CASE
    WHEN wp.prev_team IS NULL THEN NULL
    ELSE wp.prev_team IS DISTINCT FROM wp.team
  END AS new_team,
  CASE
    WHEN npi.rookie_season IS NOT NULL AND wp.season >= npi.rookie_season
      THEN wp.season - npi.rookie_season + 1
  END AS experience_year,
  npi.draft_round,
  npi.draft_pick,
  npi.rookie_season,
  NULL::numeric AS snap_share  -- Phase 4 fast-follow (nflverse snap_counts)
FROM with_prev wp
LEFT JOIN public.nfl_player_ids npi ON npi.gsis_id = wp.gsis_id;

-- The spec's flagship grain: one row per (player, season) tying the
-- preseason number (ADP + positional ADP rank) to the actual result
-- (positional finish, games) and the archetype attributes. Archetype BUCKET
-- definitions (experience 1/2/3/veteran, draft capital rounds_1_2/round_3/
-- day3_udfa, situation change) live in src/utils/backtestArchetypes.ts so
-- they are unit-testable; this view supplies the raw attributes.
CREATE OR REPLACE VIEW public.nfl_backtest_player_season
WITH (security_invoker = true) AS
SELECT
  a.season,
  a.gsis_id,
  a.player_name,
  a.position,
  a.team,
  a.adp,
  a.adp_pos_rank,
  a.finish_pos_rank,
  a.total_ppr,
  a.games,
  ps.experience_year,
  ps.draft_round,
  ps.draft_pick,
  ps.rookie_season,
  ps.new_team,
  ps.prev_team,
  ps.snap_share
FROM public.nfl_backtest_adp_results a
LEFT JOIN public.nfl_player_seasons ps
  ON ps.gsis_id = a.gsis_id
 AND ps.season = a.season
WHERE a.gsis_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
