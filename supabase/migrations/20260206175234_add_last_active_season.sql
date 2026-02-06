-- Add last_active_season column to players table
-- Used for filtering stale player records across seasons
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_active_season integer;

-- Backfill from player_season_stats: use the most recent season for each player
UPDATE players p
SET last_active_season = sub.max_season
FROM (
  SELECT player_id, MAX(season) AS max_season
  FROM player_season_stats
  GROUP BY player_id
) sub
WHERE p.id = sub.player_id
  AND p.last_active_season IS NULL;

-- Index for filtering by season
CREATE INDEX IF NOT EXISTS idx_players_last_active_season ON players (last_active_season);
