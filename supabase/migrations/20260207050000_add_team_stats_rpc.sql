-- RPC functions for computing team stats from nba_games data

-- Indexes for efficient team record queries
CREATE INDEX IF NOT EXISTS idx_nba_games_home_team_season
  ON nba_games(home_team_name, season) WHERE is_final = true;
CREATE INDEX IF NOT EXISTS idx_nba_games_visitor_team_season
  ON nba_games(visitor_team_name, season) WHERE is_final = true;

-- Function 1: Get team record (W-L, home/away splits)
CREATE OR REPLACE FUNCTION get_nba_team_record(
  p_team_name TEXT,
  p_season INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season INTEGER;
  v_home_wins INTEGER := 0;
  v_home_losses INTEGER := 0;
  v_away_wins INTEGER := 0;
  v_away_losses INTEGER := 0;
BEGIN
  IF p_season IS NULL THEN
    IF EXTRACT(MONTH FROM now()) >= 10 THEN
      v_season := EXTRACT(YEAR FROM now())::INTEGER + 1;
    ELSE
      v_season := EXTRACT(YEAR FROM now())::INTEGER;
    END IF;
  ELSE
    v_season := p_season;
  END IF;

  SELECT COUNT(*) INTO v_home_wins
  FROM nba_games
  WHERE home_team_name = p_team_name
    AND season = v_season AND is_final = true
    AND home_score > away_score;

  SELECT COUNT(*) INTO v_home_losses
  FROM nba_games
  WHERE home_team_name = p_team_name
    AND season = v_season AND is_final = true
    AND home_score < away_score;

  SELECT COUNT(*) INTO v_away_wins
  FROM nba_games
  WHERE visitor_team_name = p_team_name
    AND season = v_season AND is_final = true
    AND away_score > home_score;

  SELECT COUNT(*) INTO v_away_losses
  FROM nba_games
  WHERE visitor_team_name = p_team_name
    AND season = v_season AND is_final = true
    AND away_score < home_score;

  RETURN json_build_object(
    'wins', v_home_wins + v_away_wins,
    'losses', v_home_losses + v_away_losses,
    'record', (v_home_wins + v_away_wins) || '-' || (v_home_losses + v_away_losses),
    'home_record', v_home_wins || '-' || v_home_losses,
    'away_record', v_away_wins || '-' || v_away_losses,
    'season', v_season
  );
END;
$$;

-- Function 2: Get head-to-head record between two teams
CREATE OR REPLACE FUNCTION get_nba_head_to_head(
  p_team1 TEXT,
  p_team2 TEXT,
  p_season INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season INTEGER;
  v_team1_wins INTEGER := 0;
  v_team2_wins INTEGER := 0;
BEGIN
  IF p_season IS NULL THEN
    IF EXTRACT(MONTH FROM now()) >= 10 THEN
      v_season := EXTRACT(YEAR FROM now())::INTEGER + 1;
    ELSE
      v_season := EXTRACT(YEAR FROM now())::INTEGER;
    END IF;
  ELSE
    v_season := p_season;
  END IF;

  -- team1 wins (home or away)
  SELECT COUNT(*) INTO v_team1_wins
  FROM nba_games
  WHERE season = v_season AND is_final = true
    AND (
      (home_team_name = p_team1 AND visitor_team_name = p_team2 AND home_score > away_score)
      OR
      (visitor_team_name = p_team1 AND home_team_name = p_team2 AND away_score > home_score)
    );

  -- team2 wins (home or away)
  SELECT COUNT(*) INTO v_team2_wins
  FROM nba_games
  WHERE season = v_season AND is_final = true
    AND (
      (home_team_name = p_team2 AND visitor_team_name = p_team1 AND home_score > away_score)
      OR
      (visitor_team_name = p_team2 AND home_team_name = p_team1 AND away_score > home_score)
    );

  RETURN json_build_object(
    'team1', p_team1,
    'team2', p_team2,
    'team1_wins', v_team1_wins,
    'team2_wins', v_team2_wins,
    'summary', v_team1_wins || '-' || v_team2_wins || ' this season',
    'total_games', v_team1_wins + v_team2_wins,
    'season', v_season
  );
END;
$$;

-- Function 3: Get last N games for a team
CREATE OR REPLACE FUNCTION get_nba_team_last_n_games(
  p_team_name TEXT,
  p_n INTEGER DEFAULT 5,
  p_before_date TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_games JSON;
BEGIN
  SELECT json_agg(sub)
  INTO v_games
  FROM (
    SELECT
      CASE
        WHEN home_team_name = p_team_name THEN
          CASE WHEN home_score > away_score THEN 'W' ELSE 'L' END
        ELSE
          CASE WHEN away_score > home_score THEN 'W' ELSE 'L' END
      END AS result,
      CASE
        WHEN home_team_name = p_team_name THEN visitor_team_name
        ELSE home_team_name
      END AS opponent,
      CASE
        WHEN home_team_name = p_team_name THEN home_score || '-' || away_score
        ELSE away_score || '-' || home_score
      END AS score,
      date AS game_date
    FROM nba_games
    WHERE (home_team_name = p_team_name OR visitor_team_name = p_team_name)
      AND is_final = true
      AND date < p_before_date
    ORDER BY date DESC
    LIMIT p_n
  ) sub;

  RETURN COALESCE(v_games, '[]'::json);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION get_nba_team_record(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_nba_head_to_head(TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_nba_team_last_n_games(TEXT, INTEGER, TIMESTAMPTZ) TO authenticated, anon;
