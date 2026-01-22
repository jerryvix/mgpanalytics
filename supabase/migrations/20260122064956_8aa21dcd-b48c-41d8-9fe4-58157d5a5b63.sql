-- Create odds_history table for line movement tracking
CREATE TABLE IF NOT EXISTS public.odds_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  odds_type TEXT NOT NULL, -- 'spread', 'moneyline', 'total'
  team TEXT, -- NULL for totals
  current_line DECIMAL,
  previous_line DECIMAL,
  line_movement TEXT, -- 'up', 'down', 'neutral', 'steam'
  opening_line DECIMAL,
  current_price INTEGER,
  previous_price INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ncaab_games table
CREATE TABLE IF NOT EXISTS public.ncaab_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  date TIMESTAMPTZ NOT NULL,
  season INTEGER DEFAULT 2025,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_team_name TEXT NOT NULL,
  visitor_team_name TEXT NOT NULL,
  home_team_id TEXT,
  visitor_team_id TEXT,
  home_team_rank INTEGER, -- AP Top 25 rank
  visitor_team_rank INTEGER, -- AP Top 25 rank
  home_team_conference TEXT,
  visitor_team_conference TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ncaab_odds table
CREATE TABLE IF NOT EXISTS public.ncaab_odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.ncaab_games(id) ON DELETE CASCADE,
  sportsbook TEXT NOT NULL,
  spread_value REAL,
  spread_odds INTEGER,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  total_value REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, sportsbook)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_odds_history_game_id ON public.odds_history(game_id);
CREATE INDEX IF NOT EXISTS idx_odds_history_sport ON public.odds_history(sport);
CREATE INDEX IF NOT EXISTS idx_odds_history_timestamp ON public.odds_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_ncaab_games_date ON public.ncaab_games(date);
CREATE INDEX IF NOT EXISTS idx_ncaab_games_status ON public.ncaab_games(status);
CREATE INDEX IF NOT EXISTS idx_ncaab_games_rank ON public.ncaab_games(home_team_rank, visitor_team_rank);
CREATE INDEX IF NOT EXISTS idx_ncaab_odds_game_id ON public.ncaab_odds(game_id);

-- Enable RLS on new tables
ALTER TABLE public.odds_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncaab_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncaab_odds ENABLE ROW LEVEL SECURITY;

-- RLS policies for odds_history
CREATE POLICY "Authenticated users can read odds_history" ON public.odds_history
  FOR SELECT USING (true);
CREATE POLICY "Admins can insert odds_history" ON public.odds_history
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update odds_history" ON public.odds_history
  FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete odds_history" ON public.odds_history
  FOR DELETE USING (is_admin());

-- RLS policies for ncaab_games
CREATE POLICY "Authenticated users can read ncaab_games" ON public.ncaab_games
  FOR SELECT USING (true);
CREATE POLICY "Admins can insert ncaab_games" ON public.ncaab_games
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update ncaab_games" ON public.ncaab_games
  FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete ncaab_games" ON public.ncaab_games
  FOR DELETE USING (is_admin());

-- RLS policies for ncaab_odds
CREATE POLICY "Authenticated users can read ncaab_odds" ON public.ncaab_odds
  FOR SELECT USING (true);
CREATE POLICY "Admins can insert ncaab_odds" ON public.ncaab_odds
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update ncaab_odds" ON public.ncaab_odds
  FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete ncaab_odds" ON public.ncaab_odds
  FOR DELETE USING (is_admin());