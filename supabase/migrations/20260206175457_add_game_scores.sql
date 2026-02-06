-- Add score columns to all game tables for historical data capture
-- Nullable: games in-progress or not-yet-started won't have scores

-- NFL games
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false;

-- NBA games
ALTER TABLE nba_games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false;

-- NCAAB games
ALTER TABLE ncaab_games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false;

-- NCAAF games
ALTER TABLE ncaaf_games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false;

-- MLB games
ALTER TABLE mlb_games
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer,
  ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false;

-- Index for querying completed games
CREATE INDEX IF NOT EXISTS idx_games_is_final ON games (is_final) WHERE is_final = true;
CREATE INDEX IF NOT EXISTS idx_nba_games_is_final ON nba_games (is_final) WHERE is_final = true;
CREATE INDEX IF NOT EXISTS idx_ncaab_games_is_final ON ncaab_games (is_final) WHERE is_final = true;
CREATE INDEX IF NOT EXISTS idx_ncaaf_games_is_final ON ncaaf_games (is_final) WHERE is_final = true;
CREATE INDEX IF NOT EXISTS idx_mlb_games_is_final ON mlb_games (is_final) WHERE is_final = true;
