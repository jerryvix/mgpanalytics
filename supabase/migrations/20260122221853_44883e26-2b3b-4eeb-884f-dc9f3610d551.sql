-- Add unique constraint for player_game_associations to support upserts
-- We need composite constraints for each game type since only one should be non-null at a time

-- Add unique constraint for NFL player-game associations
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_game_nfl_unique 
ON public.player_game_associations(player_id, nfl_game_id) 
WHERE nfl_game_id IS NOT NULL;

-- Add unique constraint for NBA player-game associations
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_game_nba_unique 
ON public.player_game_associations(player_id, nba_game_id) 
WHERE nba_game_id IS NOT NULL;

-- Add unique constraint for NCAAB player-game associations  
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_game_ncaab_unique 
ON public.player_game_associations(player_id, ncaab_game_id) 
WHERE ncaab_game_id IS NOT NULL;