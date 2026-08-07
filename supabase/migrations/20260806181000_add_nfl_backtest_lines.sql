-- Projection Accuracy Backtester, Tier 1: preseason lines (season-long player
-- props + team win totals), ADP snapshots, actual team results, and the
-- grading views. Inputs are stored; grades are ALWAYS computed in views so a
-- fixed name match or corrected line regrades automatically and the rules
-- stay versionable SQL.
--
-- Sources: win totals + actual wins scraped from SportsOddsHistory.com
-- (covers.com/sportsoddshistory — citation required); ADP from the Fantasy
-- Football Calculator public API; props from hand-curated preseason captures
-- (see sync-preseason-props/data/). All are preseason snapshots, refreshed
-- annually — this is deliberately NOT live futures tracking (docs/positioning.md).

-- One table for props and win totals: identical shape (subject, line,
-- over/under prices). Win totals are entity_type='team', market='season_wins'.
-- market values for players mirror the player_season_stats column names so
-- the grading view is a CASE expression, not a mapping table.
CREATE TABLE IF NOT EXISTS public.nfl_preseason_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('player','team')),
  market text NOT NULL CHECK (market IN (
    'season_wins','pass_yards','pass_td','rush_yards','rush_td',
    'rec_yards','rec_td','receptions','sacks'
  )),
  subject_name text NOT NULL,        -- raw source spelling, always kept
  gsis_id text,                      -- resolved at ingest (players)
  player_uuid uuid,                  -- players.id (BDL) for the stats join
  team_abbr text,                    -- resolved at ingest (teams)
  line numeric NOT NULL,
  over_odds int,                     -- American odds as integers
  under_odds int,
  source text NOT NULL,              -- 'matchbetwin' | 'sportsoddshistory' | 'manual_seed'
  book text,                         -- sportsbook the line came from, when known
  captured_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, entity_type, market, subject_name, source)
);

CREATE INDEX IF NOT EXISTS idx_npl_season ON public.nfl_preseason_lines(season, entity_type, market);

-- Fantasy ADP snapshots (Fantasy Football Calculator, PPR 12-team; late-Aug
-- capture window each year). adp is the overall pick average.
CREATE TABLE IF NOT EXISTS public.nfl_adp_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  source text NOT NULL DEFAULT 'ffc_ppr_12',
  player_name text NOT NULL,         -- raw source spelling
  position text,
  team text,
  adp numeric NOT NULL,
  high numeric,
  low numeric,
  stdev numeric,
  times_drafted int,
  gsis_id text,                      -- resolved at ingest
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, source, player_name, position)
);

CREATE INDEX IF NOT EXISTS idx_nas_season ON public.nfl_adp_snapshots(season, source, position);

-- Actual team regular-season records, written by the same win-totals scrape
-- (the SportsOddsHistory table includes actual wins). Sidesteps the empty
-- NFL games.home_score columns entirely.
CREATE TABLE IF NOT EXISTS public.nfl_team_season_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  team_abbr text NOT NULL,
  team_name text,
  wins int NOT NULL,
  losses int,
  ties int,
  source text NOT NULL DEFAULT 'sportsoddshistory',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, team_abbr)
);

-- RLS: public read, admin write (house convention)
ALTER TABLE public.nfl_preseason_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfl_adp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfl_team_season_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read nfl_preseason_lines" ON public.nfl_preseason_lines;
CREATE POLICY "Anyone can read nfl_preseason_lines" ON public.nfl_preseason_lines FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert nfl_preseason_lines" ON public.nfl_preseason_lines;
CREATE POLICY "Admins can insert nfl_preseason_lines" ON public.nfl_preseason_lines FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update nfl_preseason_lines" ON public.nfl_preseason_lines;
CREATE POLICY "Admins can update nfl_preseason_lines" ON public.nfl_preseason_lines FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete nfl_preseason_lines" ON public.nfl_preseason_lines;
CREATE POLICY "Admins can delete nfl_preseason_lines" ON public.nfl_preseason_lines FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read nfl_adp_snapshots" ON public.nfl_adp_snapshots;
CREATE POLICY "Anyone can read nfl_adp_snapshots" ON public.nfl_adp_snapshots FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert nfl_adp_snapshots" ON public.nfl_adp_snapshots;
CREATE POLICY "Admins can insert nfl_adp_snapshots" ON public.nfl_adp_snapshots FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update nfl_adp_snapshots" ON public.nfl_adp_snapshots;
CREATE POLICY "Admins can update nfl_adp_snapshots" ON public.nfl_adp_snapshots FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete nfl_adp_snapshots" ON public.nfl_adp_snapshots;
CREATE POLICY "Admins can delete nfl_adp_snapshots" ON public.nfl_adp_snapshots FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read nfl_team_season_results" ON public.nfl_team_season_results;
CREATE POLICY "Anyone can read nfl_team_season_results" ON public.nfl_team_season_results FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert nfl_team_season_results" ON public.nfl_team_season_results;
CREATE POLICY "Admins can insert nfl_team_season_results" ON public.nfl_team_season_results FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update nfl_team_season_results" ON public.nfl_team_season_results;
CREATE POLICY "Admins can update nfl_team_season_results" ON public.nfl_team_season_results FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete nfl_team_season_results" ON public.nfl_team_season_results;
CREATE POLICY "Admins can delete nfl_team_season_results" ON public.nfl_team_season_results FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grading views. Hit/miss/push semantics (per spec Definitions, verbatim):
--   over  = actual strictly above the line
--   under = actual strictly below the line
--   push  = actual lands EXACTLY on the line (only possible on whole-number
--           lines). Pushes are EXCLUDED from the hit-rate denominator and
--           reported as a separate count — a push is the book being exactly
--           right, and folding it into either side biases the estimate; the
--           stake-returned betting convention matches exclusion. Computed in
--           src/utils/backtestMetrics.ts, documented in the UI footnote.
--   ungraded = no actual found (unmatched player or season not yet ingested).
-- NOTE: views grade whatever actuals exist — for an in-progress season that
-- means partial numbers. Consumers must filter to completed seasons via
-- mostRecentCompletedNflSeason() (src/utils/nflSeason.ts).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.nfl_backtest_prop_results
WITH (security_invoker = true) AS
SELECT
  l.id AS line_id,
  l.season,
  l.market,
  l.subject_name,
  l.gsis_id,
  l.player_uuid,
  l.line,
  l.over_odds,
  l.under_odds,
  l.source,
  l.book,
  p.position,
  pss.games_played,
  CASE l.market
    WHEN 'pass_yards' THEN pss.pass_yards
    WHEN 'pass_td'    THEN pss.pass_td
    WHEN 'rush_yards' THEN pss.rush_yards
    WHEN 'rush_td'    THEN pss.rush_td
    WHEN 'rec_yards'  THEN pss.rec_yards
    WHEN 'rec_td'     THEN pss.rec_td
    WHEN 'receptions' THEN pss.receptions
    WHEN 'sacks'      THEN pss.sacks
  END AS actual,
  CASE
    WHEN (CASE l.market
      WHEN 'pass_yards' THEN pss.pass_yards
      WHEN 'pass_td'    THEN pss.pass_td
      WHEN 'rush_yards' THEN pss.rush_yards
      WHEN 'rush_td'    THEN pss.rush_td
      WHEN 'rec_yards'  THEN pss.rec_yards
      WHEN 'rec_td'     THEN pss.rec_td
      WHEN 'receptions' THEN pss.receptions
      WHEN 'sacks'      THEN pss.sacks
    END) IS NULL THEN 'ungraded'
    WHEN (CASE l.market
      WHEN 'pass_yards' THEN pss.pass_yards
      WHEN 'pass_td'    THEN pss.pass_td
      WHEN 'rush_yards' THEN pss.rush_yards
      WHEN 'rush_td'    THEN pss.rush_td
      WHEN 'rec_yards'  THEN pss.rec_yards
      WHEN 'rec_td'     THEN pss.rec_td
      WHEN 'receptions' THEN pss.receptions
      WHEN 'sacks'      THEN pss.sacks
    END) > l.line THEN 'over'
    WHEN (CASE l.market
      WHEN 'pass_yards' THEN pss.pass_yards
      WHEN 'pass_td'    THEN pss.pass_td
      WHEN 'rush_yards' THEN pss.rush_yards
      WHEN 'rush_td'    THEN pss.rush_td
      WHEN 'rec_yards'  THEN pss.rec_yards
      WHEN 'rec_td'     THEN pss.rec_td
      WHEN 'receptions' THEN pss.receptions
      WHEN 'sacks'      THEN pss.sacks
    END) < l.line THEN 'under'
    ELSE 'push'
  END AS result
FROM public.nfl_preseason_lines l
LEFT JOIN public.player_season_stats pss
  ON pss.player_id = l.player_uuid
 AND pss.season = l.season
 AND pss.sport = 'NFL'
 AND pss.season_type = 'regular'
LEFT JOIN public.players p ON p.id = l.player_uuid
WHERE l.entity_type = 'player';

-- Win totals. Ties are NOT half-wins: an 8-8-1 season grades against 8 wins
-- (standard book rule for season win totals).
CREATE OR REPLACE VIEW public.nfl_backtest_win_total_results
WITH (security_invoker = true) AS
SELECT
  l.id AS line_id,
  l.season,
  l.subject_name,
  l.team_abbr,
  l.line,
  l.over_odds,
  l.under_odds,
  l.source,
  l.book,
  r.wins AS actual,
  r.losses,
  r.ties,
  CASE
    WHEN r.wins IS NULL THEN 'ungraded'
    WHEN r.wins > l.line THEN 'over'
    WHEN r.wins < l.line THEN 'under'
    ELSE 'push'
  END AS result
FROM public.nfl_preseason_lines l
LEFT JOIN public.nfl_team_season_results r
  ON r.team_abbr = l.team_abbr
 AND r.season = l.season
WHERE l.entity_type = 'team' AND l.market = 'season_wins';

-- ADP vs actual positional finish. adp_pos_rank is the player's positional
-- draft slot (RANK over the season's snapshot by overall ADP); finish is
-- position_rank from the nflverse-backed season ranks view. Players absent
-- from the ranks view (zero REG-season stat lines) grade as 'did not play' —
-- src/utils/backtestMetrics.ts documents how those enter bust rates.
CREATE OR REPLACE VIEW public.nfl_backtest_adp_results
WITH (security_invoker = true) AS
SELECT
  a.id AS adp_id,
  a.season,
  a.source,
  a.player_name,
  a.position,
  a.team,
  a.adp,
  a.gsis_id,
  (RANK() OVER (PARTITION BY a.season, a.source, a.position ORDER BY a.adp ASC))::int AS adp_pos_rank,
  r.position_rank AS finish_pos_rank,
  r.total_ppr,
  r.games
FROM public.nfl_adp_snapshots a
LEFT JOIN public.nfl_fantasy_season_ranks r
  ON r.gsis_id = a.gsis_id
 AND r.season = a.season
WHERE a.position IN ('QB','RB','WR','TE');

-- Every stored input row whose identity could not be resolved at ingest.
-- Surfaced in the admin BacktestSyncCard; fix = nfl_name_overrides row +
-- re-run that season's sync.
CREATE OR REPLACE VIEW public.nfl_backtest_unmatched
WITH (security_invoker = true) AS
SELECT 'prop_line' AS kind, source, season, subject_name, market
FROM public.nfl_preseason_lines
WHERE entity_type = 'player' AND (gsis_id IS NULL OR player_uuid IS NULL)
UNION ALL
SELECT 'win_total' AS kind, source, season, subject_name, market
FROM public.nfl_preseason_lines
WHERE entity_type = 'team' AND team_abbr IS NULL
UNION ALL
SELECT 'adp' AS kind, source, season, player_name AS subject_name, position AS market
FROM public.nfl_adp_snapshots
WHERE gsis_id IS NULL AND position IN ('QB','RB','WR','TE');

INSERT INTO public.sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES
  ('NFL', 'win_totals', '30d', true),
  ('NFL', 'adp', '30d', true),
  ('NFL', 'preseason_props', '30d', true)
ON CONFLICT (sport, data_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
