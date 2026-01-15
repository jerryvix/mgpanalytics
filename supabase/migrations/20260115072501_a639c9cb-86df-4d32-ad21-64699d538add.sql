-- Create nba_games table
CREATE TABLE public.nba_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season INTEGER DEFAULT 2025,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_team_name TEXT NOT NULL,
  visitor_team_name TEXT NOT NULL,
  home_team_id INTEGER,
  visitor_team_id INTEGER,
  external_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create nba_odds table
CREATE TABLE public.nba_odds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.nba_games(id) ON DELETE CASCADE,
  sportsbook TEXT NOT NULL,
  spread_value REAL,
  spread_odds INTEGER,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  total_value REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(game_id, sportsbook)
);

-- Enable RLS on nba_games
ALTER TABLE public.nba_games ENABLE ROW LEVEL SECURITY;

-- RLS policies for nba_games
CREATE POLICY "Authenticated users can read nba_games" 
ON public.nba_games 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert nba_games" 
ON public.nba_games 
FOR INSERT 
WITH CHECK (is_admin());

CREATE POLICY "Admins can update nba_games" 
ON public.nba_games 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Admins can delete nba_games" 
ON public.nba_games 
FOR DELETE 
USING (is_admin());

-- Enable RLS on nba_odds
ALTER TABLE public.nba_odds ENABLE ROW LEVEL SECURITY;

-- RLS policies for nba_odds
CREATE POLICY "Authenticated users can read nba_odds" 
ON public.nba_odds 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert nba_odds" 
ON public.nba_odds 
FOR INSERT 
WITH CHECK (is_admin());

CREATE POLICY "Admins can update nba_odds" 
ON public.nba_odds 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Admins can delete nba_odds" 
ON public.nba_odds 
FOR DELETE 
USING (is_admin());

-- Create indexes for performance
CREATE INDEX idx_nba_games_season ON public.nba_games(season);
CREATE INDEX idx_nba_games_status ON public.nba_games(status);
CREATE INDEX idx_nba_games_date ON public.nba_games(date);
CREATE INDEX idx_nba_odds_game_id ON public.nba_odds(game_id);
CREATE INDEX idx_nba_odds_sportsbook ON public.nba_odds(sportsbook);

-- Create trigger for updated_at on nba_games
CREATE TRIGGER update_nba_games_updated_at
BEFORE UPDATE ON public.nba_games
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on nba_odds
CREATE TRIGGER update_nba_odds_updated_at
BEFORE UPDATE ON public.nba_odds
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();