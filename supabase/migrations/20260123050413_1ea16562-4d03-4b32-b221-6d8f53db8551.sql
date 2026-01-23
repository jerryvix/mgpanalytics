-- Create table for NBA player props
CREATE TABLE public.player_props (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  game_id UUID, -- Can reference nba_games, etc.
  sport TEXT NOT NULL DEFAULT 'NBA',
  external_game_id TEXT,
  external_player_id TEXT,
  sportsbook TEXT NOT NULL,
  prop_type TEXT NOT NULL, -- points, rebounds, assists, threes, etc.
  line NUMERIC NOT NULL,
  over_odds INTEGER,
  under_odds INTEGER,
  game_date DATE,
  opponent_team TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.player_props ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can read player_props" 
ON public.player_props 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert player_props" 
ON public.player_props 
FOR INSERT 
WITH CHECK (is_admin());

CREATE POLICY "Admins can update player_props" 
ON public.player_props 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Admins can delete player_props" 
ON public.player_props 
FOR DELETE 
USING (is_admin());

-- Create index for common queries
CREATE INDEX idx_player_props_player_date ON public.player_props(player_id, game_date);
CREATE INDEX idx_player_props_game_date ON public.player_props(game_date, sport);

-- Add unique constraint for upserts
ALTER TABLE public.player_props 
ADD CONSTRAINT player_props_unique_key 
UNIQUE (player_id, sportsbook, prop_type, game_date);