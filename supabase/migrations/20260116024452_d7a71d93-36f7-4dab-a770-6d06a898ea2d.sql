-- Add unique constraint for upsert to work on player_season_stats
ALTER TABLE public.player_season_stats 
ADD CONSTRAINT player_season_stats_unique_key 
UNIQUE (player_id, sport, season, season_type);