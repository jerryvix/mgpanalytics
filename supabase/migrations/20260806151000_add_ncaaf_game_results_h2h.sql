-- CFB Matchup Intelligence, Signal 2 (head-to-head history): completed game
-- results from CollegeFootballData.com, keyed by CFBD's own game id.
--
-- Deliberately separate from ncaaf_games: that table is the ESPN-sourced
-- forward slate (external_id = espn_ncaaf_<id>), this one is the CFBD-sourced
-- results history. The current season exists in both under different ids —
-- that overlap is intentional (slate vs history reads); do NOT dedupe them.

CREATE TABLE IF NOT EXISTS public.ncaaf_game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cfbd_game_id bigint NOT NULL UNIQUE,
  season int NOT NULL,
  week int,
  season_type text CHECK (season_type IN ('regular', 'postseason')),
  date timestamptz,
  home_school text NOT NULL,
  away_school text NOT NULL,
  home_conference text,
  away_conference text,
  home_points int NOT NULL,
  away_points int NOT NULL,
  neutral_site boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ngr_home ON public.ncaaf_game_results(home_school, season);
CREATE INDEX IF NOT EXISTS idx_ngr_away ON public.ncaaf_game_results(away_school, season);

ALTER TABLE public.ncaaf_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read ncaaf_game_results" ON public.ncaaf_game_results;
CREATE POLICY "Anyone can read ncaaf_game_results"
  ON public.ncaaf_game_results FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ncaaf_game_results" ON public.ncaaf_game_results;
CREATE POLICY "Admins can insert ncaaf_game_results"
  ON public.ncaaf_game_results FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update ncaaf_game_results" ON public.ncaaf_game_results;
CREATE POLICY "Admins can update ncaaf_game_results"
  ON public.ncaaf_game_results FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ncaaf_game_results" ON public.ncaaf_game_results;
CREATE POLICY "Admins can delete ncaaf_game_results"
  ON public.ncaaf_game_results FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Head-to-head between two CFBD schools over the last p_seasons seasons of
-- stored results, both venue orientations. School names can contain parens
-- ("Miami (OH)") which break PostgREST or() filters — that's why this is an
-- RPC rather than a client-side query. Verdict/streak classification happens
-- client-side in src/utils/matchupIntel.ts from the games array.
CREATE OR REPLACE FUNCTION get_ncaaf_head_to_head(
  p_team1 TEXT,
  p_team2 TEXT,
  p_seasons INTEGER DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_season INTEGER;
  v_team1_wins INTEGER := 0;
  v_team2_wins INTEGER := 0;
  v_games JSON;
BEGIN
  SELECT COALESCE(MAX(season), 0) - (p_seasons - 1) INTO v_min_season
  FROM ncaaf_game_results;

  SELECT COALESCE(json_agg(g ORDER BY g.date DESC NULLS LAST, g.season DESC), '[]'::json)
  INTO v_games
  FROM (
    SELECT season, date, home_school, away_school, home_points, away_points, neutral_site
    FROM ncaaf_game_results
    WHERE season >= v_min_season
      AND (
        (home_school = p_team1 AND away_school = p_team2)
        OR
        (home_school = p_team2 AND away_school = p_team1)
      )
  ) g;

  SELECT COUNT(*) INTO v_team1_wins
  FROM ncaaf_game_results
  WHERE season >= v_min_season
    AND (
      (home_school = p_team1 AND away_school = p_team2 AND home_points > away_points)
      OR
      (away_school = p_team1 AND home_school = p_team2 AND away_points > home_points)
    );

  SELECT COUNT(*) INTO v_team2_wins
  FROM ncaaf_game_results
  WHERE season >= v_min_season
    AND (
      (home_school = p_team2 AND away_school = p_team1 AND home_points > away_points)
      OR
      (away_school = p_team2 AND home_school = p_team1 AND away_points > home_points)
    );

  RETURN json_build_object(
    'team1', p_team1,
    'team2', p_team2,
    'team1_wins', v_team1_wins,
    'team2_wins', v_team2_wins,
    'total_games', v_team1_wins + v_team2_wins,
    'min_season', v_min_season,
    'games', v_games
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_ncaaf_head_to_head(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- Register the daily results job with the dispatcher
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('NCAAF', 'results', '24h', true)
ON CONFLICT (sport, data_type) DO NOTHING;

-- Refresh PostgREST schema cache so the REST API serves the new table/RPC
-- immediately (required when applying DDL outside the normal migration runner).
NOTIFY pgrst, 'reload schema';
