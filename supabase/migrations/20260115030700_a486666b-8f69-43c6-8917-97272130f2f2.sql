-- Add missing columns for postseason games
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS postseason boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS week integer,
ADD COLUMN IF NOT EXISTS external_id text,
ADD COLUMN IF NOT EXISTS season integer DEFAULT 2025;

-- Add unique constraint on external_id for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_external_id ON public.games(external_id);