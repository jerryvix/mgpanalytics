-- Add unique constraint for game logs upsert
ALTER TABLE public.player_game_logs 
ADD CONSTRAINT player_game_logs_player_sport_game_unique 
UNIQUE (player_id, sport, game_id);