-- Update odds table to store all market types in one row per game+sportsbook
ALTER TABLE public.odds 
  RENAME COLUMN line TO spread_value;

ALTER TABLE public.odds 
  RENAME COLUMN price TO spread_odds;

ALTER TABLE public.odds 
  DROP COLUMN IF EXISTS market_type;

ALTER TABLE public.odds 
  ADD COLUMN IF NOT EXISTS moneyline_home integer,
  ADD COLUMN IF NOT EXISTS moneyline_away integer,
  ADD COLUMN IF NOT EXISTS total_value real,
  ADD COLUMN IF NOT EXISTS total_over_odds integer,
  ADD COLUMN IF NOT EXISTS total_under_odds integer;

-- Create unique index on game_id + sportsbook for upserts
CREATE UNIQUE INDEX IF NOT EXISTS odds_game_sportsbook_unique ON public.odds(game_id, sportsbook);