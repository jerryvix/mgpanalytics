-- Create NCAAF games table
CREATE TABLE public.ncaaf_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE,
  date TIMESTAMPTZ NOT NULL,
  season INTEGER DEFAULT 2025,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_team_name TEXT NOT NULL,
  visitor_team_name TEXT NOT NULL,
  home_team_id TEXT,
  visitor_team_id TEXT,
  home_team_rank INTEGER,
  visitor_team_rank INTEGER,
  home_team_conference TEXT,
  visitor_team_conference TEXT,
  venue TEXT,
  weather TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create NCAAF odds table
CREATE TABLE public.ncaaf_odds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES ncaaf_games(id) ON DELETE CASCADE,
  sportsbook TEXT NOT NULL,
  spread_value REAL,
  spread_odds INTEGER,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  total_value REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, sportsbook)
);

-- Create MLB games table
CREATE TABLE public.mlb_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT UNIQUE,
  date TIMESTAMPTZ NOT NULL,
  season INTEGER DEFAULT 2025,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_team_name TEXT NOT NULL,
  visitor_team_name TEXT NOT NULL,
  home_team_id TEXT,
  visitor_team_id TEXT,
  venue TEXT,
  weather TEXT,
  starting_pitcher_home TEXT,
  starting_pitcher_away TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create MLB odds table
CREATE TABLE public.mlb_odds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES mlb_games(id) ON DELETE CASCADE,
  sportsbook TEXT NOT NULL,
  spread_value REAL,
  spread_odds INTEGER,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  total_value REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, sportsbook)
);

-- Enable RLS on all new tables
ALTER TABLE public.ncaaf_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncaaf_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mlb_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mlb_odds ENABLE ROW LEVEL SECURITY;

-- RLS policies for ncaaf_games
CREATE POLICY "Authenticated users can read ncaaf_games" ON public.ncaaf_games FOR SELECT USING (true);
CREATE POLICY "Admins can insert ncaaf_games" ON public.ncaaf_games FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update ncaaf_games" ON public.ncaaf_games FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete ncaaf_games" ON public.ncaaf_games FOR DELETE USING (is_admin());

-- RLS policies for ncaaf_odds
CREATE POLICY "Authenticated users can read ncaaf_odds" ON public.ncaaf_odds FOR SELECT USING (true);
CREATE POLICY "Admins can insert ncaaf_odds" ON public.ncaaf_odds FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update ncaaf_odds" ON public.ncaaf_odds FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete ncaaf_odds" ON public.ncaaf_odds FOR DELETE USING (is_admin());

-- RLS policies for mlb_games
CREATE POLICY "Authenticated users can read mlb_games" ON public.mlb_games FOR SELECT USING (true);
CREATE POLICY "Admins can insert mlb_games" ON public.mlb_games FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update mlb_games" ON public.mlb_games FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete mlb_games" ON public.mlb_games FOR DELETE USING (is_admin());

-- RLS policies for mlb_odds
CREATE POLICY "Authenticated users can read mlb_odds" ON public.mlb_odds FOR SELECT USING (true);
CREATE POLICY "Admins can insert mlb_odds" ON public.mlb_odds FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update mlb_odds" ON public.mlb_odds FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete mlb_odds" ON public.mlb_odds FOR DELETE USING (is_admin());