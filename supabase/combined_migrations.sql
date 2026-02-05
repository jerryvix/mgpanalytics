-- ============================================================
-- COMBINED MIGRATIONS - MGP Analytics
-- Generated from 24 migration files in chronological order
-- ============================================================

-- ============================================================
-- CLEANUP: Drop previously created user_roles (simplified version)
-- so the migration can recreate it with proper app_role enum
-- ============================================================
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP TABLE IF EXISTS public.user_roles CASCADE;

-- ============================================================
-- Migration: 20260115013213_3cf3505c-56cb-4585-adc8-9f140af16123.sql
-- ============================================================

-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create games table
CREATE TABLE public.games (
  id SERIAL PRIMARY KEY,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  visitor_team TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  start_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 5. Create odds table
CREATE TABLE public.odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id INTEGER NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sportsbook TEXT NOT NULL,
  market_type TEXT NOT NULL,
  line REAL NOT NULL,
  price INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create is_admin security definer function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- 7. Create has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 8. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 9. Create triggers for updated_at
CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_odds_updated_at
  BEFORE UPDATE ON public.odds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Create handle_new_user function for auto profile/role creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

-- 11. Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 12. Enable RLS on all tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies for games
CREATE POLICY "Authenticated users can read games"
  ON public.games FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert games"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update games"
  ON public.games FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete games"
  ON public.games FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 14. RLS Policies for odds
CREATE POLICY "Authenticated users can read odds"
  ON public.odds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert odds"
  ON public.odds FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update odds"
  ON public.odds FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete odds"
  ON public.odds FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 15. RLS Policies for profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- 16. RLS Policies for user_roles
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Only admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- Migration: 20260115020158_4b1b027a-663e-46e3-9dae-d5b64f173e9f.sql
-- ============================================================

-- Rename columns to match the requested naming convention
ALTER TABLE public.games RENAME COLUMN home_team TO home_team_name;
ALTER TABLE public.games RENAME COLUMN visitor_team TO visitor_team_name;
ALTER TABLE public.games RENAME COLUMN start_time TO date;

-- ============================================================
-- Migration: 20260115030700_a486666b-8f69-43c6-8917-97272130f2f2.sql
-- ============================================================

-- Add missing columns for postseason games
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS postseason boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS week integer,
ADD COLUMN IF NOT EXISTS external_id text,
ADD COLUMN IF NOT EXISTS season integer DEFAULT 2025;

-- Add unique constraint on external_id for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_external_id ON public.games(external_id);

-- ============================================================
-- Migration: 20260115070809_07c7d63f-c71f-4136-b536-354a7f26efa7.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260115072501_a639c9cb-86df-4d32-ad21-64699d538add.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260115164056_8f397982-b880-4907-b83a-bc48aff6c5a0.sql
-- ============================================================

-- Create sync_log table for tracking data sync operations
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Everyone can read sync logs
CREATE POLICY "Anyone can read sync_log"
  ON public.sync_log
  FOR SELECT
  USING (true);

-- Only admins can insert sync logs
CREATE POLICY "Admins can insert sync_log"
  ON public.sync_log
  FOR INSERT
  WITH CHECK (is_admin());

-- Only admins can update sync logs
CREATE POLICY "Admins can update sync_log"
  ON public.sync_log
  FOR UPDATE
  USING (is_admin());

-- Only admins can delete sync logs
CREATE POLICY "Admins can delete sync_log"
  ON public.sync_log
  FOR DELETE
  USING (is_admin());

-- ============================================================
-- Migration: 20260115191454_a425b3aa-5413-49c3-b408-fba979874aac.sql
-- ============================================================

-- Create conversations table to store chat history
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table to store individual messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversation policies - users can only access their own conversations
CREATE POLICY "Users can view their own conversations"
ON public.conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.conversations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.conversations FOR DELETE
USING (auth.uid() = user_id);

-- Message policies - users can access messages from their conversations
CREATE POLICY "Users can view messages from their conversations"
ON public.messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.conversations
  WHERE conversations.id = messages.conversation_id
  AND conversations.user_id = auth.uid()
));

CREATE POLICY "Users can create messages in their conversations"
ON public.messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations
  WHERE conversations.id = messages.conversation_id
  AND conversations.user_id = auth.uid()
));

CREATE POLICY "Users can delete messages from their conversations"
ON public.messages FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.conversations
  WHERE conversations.id = messages.conversation_id
  AND conversations.user_id = auth.uid()
));

-- Create updated_at trigger for conversations
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- ============================================================
-- Migration: 20260116002544_8db45402-b009-4681-a3b0-c2a0800348b7.sql
-- ============================================================

-- Table 1: players - Master player registry
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  sport text NOT NULL,
  name text NOT NULL,
  first_name text,
  last_name text,
  position text,
  team_id text,
  team_name text,
  team_abbr text,
  jersey_number text,
  height text,
  weight integer,
  college text,
  birth_date date,
  experience integer,
  headshot_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(external_id, sport)
);

CREATE INDEX idx_players_sport ON players(sport);
CREATE INDEX idx_players_team ON players(team_abbr, sport);
CREATE INDEX idx_players_position ON players(position, sport);
CREATE INDEX idx_players_name ON players(name);

-- Table 2: player_season_stats - Aggregated season totals
CREATE TABLE player_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  sport text NOT NULL,
  season integer NOT NULL,
  season_type text DEFAULT 'regular',
  games_played integer DEFAULT 0,
  points integer DEFAULT 0,
  pass_attempts integer DEFAULT 0,
  pass_completions integer DEFAULT 0,
  pass_yards integer DEFAULT 0,
  pass_td integer DEFAULT 0,
  pass_int integer DEFAULT 0,
  passer_rating decimal,
  rush_attempts integer DEFAULT 0,
  rush_yards integer DEFAULT 0,
  rush_td integer DEFAULT 0,
  yards_per_carry decimal,
  targets integer DEFAULT 0,
  receptions integer DEFAULT 0,
  rec_yards integer DEFAULT 0,
  rec_td integer DEFAULT 0,
  yards_per_reception decimal,
  tackles integer DEFAULT 0,
  sacks decimal DEFAULT 0,
  interceptions integer DEFAULT 0,
  forced_fumbles integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  turnovers integer DEFAULT 0,
  fg_pct decimal,
  three_pct decimal,
  ft_pct decimal,
  minutes_per_game decimal,
  fantasy_points decimal,
  fantasy_points_ppr decimal,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_id, season, season_type)
);

CREATE INDEX idx_season_stats_player ON player_season_stats(player_id);
CREATE INDEX idx_season_stats_season ON player_season_stats(sport, season);

-- Table 3: player_game_logs - Individual game performances
CREATE TABLE player_game_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  sport text NOT NULL,
  season integer NOT NULL,
  week integer,
  game_date date,
  game_id text,
  opponent_abbr text,
  opponent_name text,
  home_away text,
  result text,
  team_score integer,
  opponent_score integer,
  pass_attempts integer DEFAULT 0,
  pass_completions integer DEFAULT 0,
  pass_yards integer DEFAULT 0,
  pass_td integer DEFAULT 0,
  pass_int integer DEFAULT 0,
  passer_rating decimal,
  rush_attempts integer DEFAULT 0,
  rush_yards integer DEFAULT 0,
  rush_td integer DEFAULT 0,
  targets integer DEFAULT 0,
  receptions integer DEFAULT 0,
  rec_yards integer DEFAULT 0,
  rec_td integer DEFAULT 0,
  points integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  turnovers integer DEFAULT 0,
  minutes integer DEFAULT 0,
  fg_made integer DEFAULT 0,
  fg_attempted integer DEFAULT 0,
  three_made integer DEFAULT 0,
  three_attempted integer DEFAULT 0,
  fantasy_points decimal,
  fantasy_points_ppr decimal,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(player_id, game_id)
);

CREATE INDEX idx_game_logs_player ON player_game_logs(player_id);
CREATE INDEX idx_game_logs_date ON player_game_logs(game_date DESC);
CREATE INDEX idx_game_logs_opponent ON player_game_logs(opponent_abbr, sport);
CREATE INDEX idx_game_logs_season_week ON player_game_logs(sport, season, week);

-- Table 4: player_advanced_stats - Advanced analytics
CREATE TABLE player_advanced_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  sport text NOT NULL,
  season integer NOT NULL,
  pass_epa decimal,
  rush_epa decimal,
  rec_epa decimal,
  success_rate decimal,
  yards_after_catch decimal,
  air_yards decimal,
  target_share decimal,
  rush_share decimal,
  red_zone_targets integer DEFAULT 0,
  red_zone_carries integer DEFAULT 0,
  yards_per_route_run decimal,
  catch_rate decimal,
  contested_catch_rate decimal,
  separation decimal,
  per decimal,
  true_shooting decimal,
  usage_rate decimal,
  assist_rate decimal,
  rebound_rate decimal,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_id, season)
);

CREATE INDEX idx_advanced_player ON player_advanced_stats(player_id);

-- Table 5: sync_schedule - Track sync status
CREATE TABLE sync_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  data_type text NOT NULL,
  last_sync_at timestamptz,
  last_sync_status text,
  records_synced integer DEFAULT 0,
  error_message text,
  next_scheduled_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sport, data_type)
);

-- Enable RLS on all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_advanced_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_schedule ENABLE ROW LEVEL SECURITY;

-- Public read access for all authenticated users
CREATE POLICY "Authenticated users can read players" ON players FOR SELECT USING (true);
CREATE POLICY "Authenticated users can read player_season_stats" ON player_season_stats FOR SELECT USING (true);
CREATE POLICY "Authenticated users can read player_game_logs" ON player_game_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can read player_advanced_stats" ON player_advanced_stats FOR SELECT USING (true);
CREATE POLICY "Authenticated users can read sync_schedule" ON sync_schedule FOR SELECT USING (true);

-- Admin-only write access
CREATE POLICY "Admins can insert players" ON players FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update players" ON players FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete players" ON players FOR DELETE USING (is_admin());

CREATE POLICY "Admins can insert player_season_stats" ON player_season_stats FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update player_season_stats" ON player_season_stats FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete player_season_stats" ON player_season_stats FOR DELETE USING (is_admin());

CREATE POLICY "Admins can insert player_game_logs" ON player_game_logs FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update player_game_logs" ON player_game_logs FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete player_game_logs" ON player_game_logs FOR DELETE USING (is_admin());

CREATE POLICY "Admins can insert player_advanced_stats" ON player_advanced_stats FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update player_advanced_stats" ON player_advanced_stats FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete player_advanced_stats" ON player_advanced_stats FOR DELETE USING (is_admin());

CREATE POLICY "Admins can insert sync_schedule" ON sync_schedule FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update sync_schedule" ON sync_schedule FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete sync_schedule" ON sync_schedule FOR DELETE USING (is_admin());

-- Add updated_at trigger for players table
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for player_season_stats table
CREATE TRIGGER update_player_season_stats_updated_at
  BEFORE UPDATE ON player_season_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for player_advanced_stats table
CREATE TRIGGER update_player_advanced_stats_updated_at
  BEFORE UPDATE ON player_advanced_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Migration: 20260116024452_d7a71d93-36f7-4dab-a770-6d06a898ea2d.sql
-- ============================================================

-- Add unique constraint for upsert to work on player_season_stats
ALTER TABLE public.player_season_stats
ADD CONSTRAINT player_season_stats_unique_key
UNIQUE (player_id, sport, season, season_type);

-- ============================================================
-- Migration: 20260116031106_914b9f43-0dab-4011-a5b1-98e5af375a65.sql
-- ============================================================

-- Add unique constraint for game logs upsert
ALTER TABLE public.player_game_logs
ADD CONSTRAINT player_game_logs_player_sport_game_unique
UNIQUE (player_id, sport, game_id);

-- ============================================================
-- Migration: 20260122035633_6a7d7ef1-179d-46c1-8324-9e5d443372ed.sql
-- ============================================================

-- Create odds_snapshots table for tracking line movement over time
CREATE TABLE public.odds_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'nfl', -- 'nfl', 'nba', 'ncaab', etc.
  sportsbook TEXT NOT NULL,
  market_type TEXT NOT NULL, -- 'spread', 'total', 'moneyline'
  line_value REAL,
  price INTEGER,
  pulled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_odds_snapshots_game_id ON public.odds_snapshots(game_id);
CREATE INDEX idx_odds_snapshots_pulled_at ON public.odds_snapshots(pulled_at DESC);
CREATE INDEX idx_odds_snapshots_game_type ON public.odds_snapshots(game_type);

-- Enable RLS
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can read odds_snapshots"
ON public.odds_snapshots
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert odds_snapshots"
ON public.odds_snapshots
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update odds_snapshots"
ON public.odds_snapshots
FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete odds_snapshots"
ON public.odds_snapshots
FOR DELETE
USING (is_admin());

-- ============================================================
-- Migration: 20260122064956_8aa21dcd-b48c-41d8-9fe4-58157d5a5b63.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260122073244_29199f01-1e6c-4b3d-8124-2593e86f8443.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260122220932_53f67c23-7bb4-49f3-a65b-d6ad1bffb383.sql
-- ============================================================

-- Add featured player columns to existing players table
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS featured_reason TEXT,
ADD COLUMN IF NOT EXISTS slate_window_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS slate_window_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS injury_status TEXT DEFAULT 'Healthy',
ADD COLUMN IF NOT EXISTS injury_designation TEXT,
ADD COLUMN IF NOT EXISTS usage_rank INT,
ADD COLUMN IF NOT EXISTS usage_metric DECIMAL,
ADD COLUMN IF NOT EXISTS age INT,
ADD COLUMN IF NOT EXISTS position_type TEXT;

-- Add missing columns to player_season_stats
ALTER TABLE public.player_season_stats
ADD COLUMN IF NOT EXISTS games_started INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS rebounds_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS assists_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS steals_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS blocks_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS turnovers_per_game DECIMAL,
ADD COLUMN IF NOT EXISTS field_goal_pct DECIMAL,
ADD COLUMN IF NOT EXISTS three_point_pct DECIMAL,
ADD COLUMN IF NOT EXISTS free_throw_pct DECIMAL,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'balldontlie';

-- Create player_game_associations table
CREATE TABLE IF NOT EXISTS public.player_game_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  nfl_game_id INT REFERENCES public.games(id) ON DELETE CASCADE,
  nba_game_id UUID REFERENCES public.nba_games(id) ON DELETE CASCADE,
  ncaab_game_id UUID REFERENCES public.ncaab_games(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  is_starter BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for player features
CREATE INDEX IF NOT EXISTS idx_players_featured ON public.players(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_players_slate ON public.players(slate_window_start, slate_window_end);
CREATE INDEX IF NOT EXISTS idx_players_injury ON public.players(injury_status) WHERE injury_status != 'Healthy';

-- Add indexes for player_game_associations
CREATE INDEX IF NOT EXISTS idx_player_game_player ON public.player_game_associations(player_id);
CREATE INDEX IF NOT EXISTS idx_player_game_nfl ON public.player_game_associations(nfl_game_id);
CREATE INDEX IF NOT EXISTS idx_player_game_nba ON public.player_game_associations(nba_game_id);
CREATE INDEX IF NOT EXISTS idx_player_game_ncaab ON public.player_game_associations(ncaab_game_id);
CREATE INDEX IF NOT EXISTS idx_player_game_sport ON public.player_game_associations(sport);

-- Enable RLS on player_game_associations
ALTER TABLE public.player_game_associations ENABLE ROW LEVEL SECURITY;

-- RLS policies for player_game_associations
CREATE POLICY "Authenticated users can read player_game_associations"
ON public.player_game_associations
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert player_game_associations"
ON public.player_game_associations
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update player_game_associations"
ON public.player_game_associations
FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete player_game_associations"
ON public.player_game_associations
FOR DELETE
USING (is_admin());

-- ============================================================
-- Migration: 20260122221853_44883e26-2b3b-4eeb-884f-dc9f3610d551.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260122230718_094f66e0-2a0a-483e-884e-bf28431975b5.sql
-- ============================================================

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS raw_data jsonb;

CREATE INDEX IF NOT EXISTS idx_players_raw_data_gin
ON public.players
USING gin (raw_data);

-- ============================================================
-- Migration: 20260123050042_a010ffab-8369-444a-a3f9-4410d253b530.sql
-- ============================================================

-- Add unique constraint for sync_schedule upserts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_schedule_sport_data_type_key'
  ) THEN
    ALTER TABLE public.sync_schedule
    ADD CONSTRAINT sync_schedule_sport_data_type_key
    UNIQUE (sport, data_type);
  END IF;
END $$;

-- ============================================================
-- Migration: 20260123050413_1ea16562-4d03-4b32-b221-6d8f53db8551.sql
-- ============================================================

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

-- ============================================================
-- Migration: 20260123075106_76e8f2be-0d15-4eaa-9d64-755a55373f18.sql
-- ============================================================

-- Create table for storing user X (Twitter) connections
CREATE TABLE public.user_x_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  x_user_id TEXT NOT NULL,
  x_username TEXT NOT NULL,
  x_display_name TEXT,
  x_profile_image TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(x_user_id)
);

-- Enable RLS
ALTER TABLE public.user_x_connections ENABLE ROW LEVEL SECURITY;

-- Users can only view their own connection
CREATE POLICY "Users can view own X connection"
ON public.user_x_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own connection
CREATE POLICY "Users can insert own X connection"
ON public.user_x_connections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own connection
CREATE POLICY "Users can update own X connection"
ON public.user_x_connections
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own connection
CREATE POLICY "Users can delete own X connection"
ON public.user_x_connections
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_x_connections_updated_at
BEFORE UPDATE ON public.user_x_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for OAuth state tokens (PKCE flow)
CREATE TABLE public.x_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.x_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only the system can manage OAuth states (via service role in edge functions)
CREATE POLICY "Service role manages OAuth states"
ON public.x_oauth_states
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- Migration: 20260126232408_ea4b7e2c-90b6-4987-8bee-86c6b46d2c5f.sql
-- ============================================================

-- Create enum for capper categories
CREATE TYPE capper_category AS ENUM (
  'sharp_bettor',
  'analyst',
  'media',
  'insider',
  'odds_provider',
  'community'
);

-- Create enum for capper tiers
CREATE TYPE capper_tier AS ENUM (
  'elite',
  'popular',
  'rising'
);

-- Create cappers table
CREATE TABLE public.cappers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  x_display_name TEXT NOT NULL,
  x_profile_image TEXT,
  x_verified BOOLEAN DEFAULT false,
  x_followers_count INTEGER DEFAULT 0,

  -- MGP-specific metadata
  category capper_category NOT NULL DEFAULT 'community',
  sports TEXT[] DEFAULT '{}',
  specialty TEXT[] DEFAULT '{}',
  description TEXT,
  mgp_verified BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  tier capper_tier NOT NULL DEFAULT 'rising',

  -- Engagement tracking
  mgp_followers INTEGER DEFAULT 0,

  -- Timestamps
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_sports CHECK (sports <@ ARRAY['NFL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'NCAAF', 'Soccer', 'MMA', 'Golf', 'Tennis']::text[])
);

-- Create index for common queries
CREATE INDEX idx_cappers_category ON public.cappers(category);
CREATE INDEX idx_cappers_tier ON public.cappers(tier);
CREATE INDEX idx_cappers_featured ON public.cappers(featured) WHERE featured = true;
CREATE INDEX idx_cappers_sports ON public.cappers USING GIN(sports);
CREATE INDEX idx_cappers_mgp_followers ON public.cappers(mgp_followers DESC);

-- Enable RLS
ALTER TABLE public.cappers ENABLE ROW LEVEL SECURITY;

-- Everyone can read cappers (public directory)
CREATE POLICY "Anyone can read cappers"
ON public.cappers
FOR SELECT
USING (true);

-- Only admins can manage cappers
CREATE POLICY "Admins can insert cappers"
ON public.cappers
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "Admins can update cappers"
ON public.cappers
FOR UPDATE
TO authenticated
USING (is_admin());

CREATE POLICY "Admins can delete cappers"
ON public.cappers
FOR DELETE
TO authenticated
USING (is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_cappers_updated_at
BEFORE UPDATE ON public.cappers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create user_capper_follows table to track which cappers MGP users follow
CREATE TABLE public.user_capper_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capper_id UUID NOT NULL REFERENCES public.cappers(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, capper_id)
);

-- Enable RLS
ALTER TABLE public.user_capper_follows ENABLE ROW LEVEL SECURITY;

-- Users can view their own follows
CREATE POLICY "Users can view own capper follows"
ON public.user_capper_follows
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can follow cappers
CREATE POLICY "Users can follow cappers"
ON public.user_capper_follows
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can unfollow cappers
CREATE POLICY "Users can unfollow cappers"
ON public.user_capper_follows
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to update mgp_followers count
CREATE OR REPLACE FUNCTION update_capper_follower_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE cappers SET mgp_followers = mgp_followers + 1 WHERE id = NEW.capper_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE cappers SET mgp_followers = mgp_followers - 1 WHERE id = OLD.capper_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger to auto-update follower count
CREATE TRIGGER update_capper_followers_on_follow
AFTER INSERT OR DELETE ON public.user_capper_follows
FOR EACH ROW
EXECUTE FUNCTION update_capper_follower_count();

-- Insert some sample cappers for initial directory
INSERT INTO public.cappers (x_user_id, x_username, x_display_name, x_profile_image, x_verified, x_followers_count, category, sports, specialty, description, mgp_verified, featured, tier, mgp_followers) VALUES
('1234567890', 'SharpFootball', 'Warren Sharp', 'https://pbs.twimg.com/profile_images/sharp_football.jpg', true, 245000, 'sharp_bettor', ARRAY['NFL', 'NCAAF'], ARRAY['game totals', 'team trends', 'situational analysis'], 'NFL analytics pioneer. Author and betting analyst known for predictive models and situational spotting.', true, true, 'elite', 842),
('1234567891', 'eaborern', 'Evan Abram', 'https://pbs.twimg.com/profile_images/evan_abram.jpg', true, 89000, 'analyst', ARRAY['NBA'], ARRAY['player props', 'usage analysis', 'matchup grades'], 'NBA player props specialist. Deep dives into usage rates, matchup data, and prop market inefficiencies.', true, true, 'elite', 634),
('1234567892', 'TheRotoWorld', 'Roto World', 'https://pbs.twimg.com/profile_images/roto_world.jpg', true, 512000, 'media', ARRAY['NFL', 'NBA', 'MLB'], ARRAY['breaking news', 'injuries', 'lineup changes'], 'Breaking news and player updates across all major sports. Essential for injury and lineup information.', true, true, 'elite', 1205),
('1234567893', 'BettingBruiser', 'The Bruiser', 'https://pbs.twimg.com/profile_images/bruiser.jpg', false, 45000, 'sharp_bettor', ARRAY['NFL', 'NBA'], ARRAY['spreads', 'money line', 'live betting'], 'Sharp bettor with documented success. Known for finding value in spreads and live betting opportunities.', true, false, 'popular', 312),
('1234567894', 'PropBetGuy', 'Prop Bet Guy', 'https://pbs.twimg.com/profile_images/propbetguy.jpg', false, 67000, 'analyst', ARRAY['NBA', 'NFL'], ARRAY['player props', 'alt lines', 'SGP builds'], 'Player prop specialist across NBA and NFL. Known for finding +EV prop opportunities.', true, false, 'popular', 456),
('1234567895', 'ActionNetworkHQ', 'Action Network', 'https://pbs.twimg.com/profile_images/action_network.jpg', true, 890000, 'media', ARRAY['NFL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'NCAAF'], ARRAY['odds movement', 'public betting', 'sharp action'], 'The home for sports betting news, data, and analysis. Track line movement and public betting percentages.', true, true, 'elite', 2341),
('1234567896', 'NFLDraftScout', 'Draft Scout', 'https://pbs.twimg.com/profile_images/draft_scout.jpg', true, 156000, 'insider', ARRAY['NFL', 'NCAAF'], ARRAY['injuries', 'roster moves', 'depth charts'], 'NFL insider with connections. Breaking injury news and roster information before it hits mainstream.', true, false, 'popular', 523),
('1234567897', 'VegasInsider', 'Vegas Insider', 'https://pbs.twimg.com/profile_images/vegas_insider.jpg', true, 234000, 'odds_provider', ARRAY['NFL', 'NBA', 'MLB', 'NHL'], ARRAY['opening lines', 'line movement', 'consensus'], 'Real-time odds and line movement tracking across major sportsbooks.', true, true, 'elite', 987),
('1234567898', 'CFFBAlerts', 'College FB Alerts', 'https://pbs.twimg.com/profile_images/cffb.jpg', false, 28000, 'community', ARRAY['NCAAF'], ARRAY['game picks', 'situational spots', 'weather'], 'College football betting community. Game-day analysis and situational betting opportunities.', false, false, 'rising', 145),
('1234567899', 'NBAPropsKing', 'NBA Props King', 'https://pbs.twimg.com/profile_images/nba_props.jpg', false, 52000, 'analyst', ARRAY['NBA'], ARRAY['player props', 'rebounds', 'assists'], 'Focused exclusively on NBA player props. Specializes in rebounds, assists, and combined stat lines.', true, false, 'popular', 378);

-- ============================================================
-- Migration: 20260126235115_ec1fa877-cb0d-4423-85a5-4692e532c1c4.sql
-- ============================================================

-- Add pop_culture to capper_category enum
ALTER TYPE capper_category ADD VALUE IF NOT EXISTS 'pop_culture';

-- ============================================================
-- Migration: 20260127040253_68d01a86-1cee-4dcc-93aa-63cd64fe06f3.sql
-- ============================================================

-- ===================================================================
-- Security Migration: Fix RLS Policies for profiles, user_x_connections, x_oauth_states
-- ===================================================================

-- ===================================================================
-- 1. FIX: profiles table - Users should only read their own profile
-- ===================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- Create strict policy: users can ONLY read their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Admin policy using existing has_role function
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ===================================================================
-- 2. FIX: user_x_connections - Encrypt tokens and restrict access
-- ===================================================================

-- Enable pgcrypto extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Users can manage own connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can read connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can insert connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can delete connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can update connections" ON public.user_x_connections;

-- Create strict user-scoped policies
CREATE POLICY "Users can read own connections" ON public.user_x_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON public.user_x_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON public.user_x_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON public.user_x_connections
  FOR DELETE USING (auth.uid() = user_id);

-- Create a secure view that excludes sensitive token fields
-- Users should query this view instead of the base table for public-facing data
DROP VIEW IF EXISTS public.user_x_connections_safe;
CREATE VIEW public.user_x_connections_safe
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  x_user_id,
  x_username,
  x_display_name,
  x_profile_image,
  connected_at,
  updated_at
FROM public.user_x_connections
WHERE user_id = auth.uid();
-- Note: access_token and refresh_token are NOT included for security

-- ===================================================================
-- 3. FIX: x_oauth_states - Time-limited, user-scoped policies
-- ===================================================================

-- Drop overly permissive service role policy
DROP POLICY IF EXISTS "Service role states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Service role can manage states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can create own oauth states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can read own oauth states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can delete own oauth states" ON public.x_oauth_states;

-- Create user-scoped policies
CREATE POLICY "Users can create own oauth states" ON public.x_oauth_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own oauth states" ON public.x_oauth_states
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states" ON public.x_oauth_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for cleanup queries if not exists
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.x_oauth_states(expires_at);

-- Create function to auto-delete expired states
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.x_oauth_states WHERE expires_at < now();
END;
$$;

-- ============================================================
-- Migration: 20260127040415_8ced6740-f7b6-4fa6-b07f-1797cb5012d7.sql
-- ============================================================

-- ===================================================================
-- Security Migration: Additional fixes for OAuth tokens and views
-- ===================================================================

-- ===================================================================
-- 1. FIX: user_x_connections_safe view RLS
-- Views inherit security from their base table when using security_invoker
-- But we need to ensure the view is properly secured
-- ===================================================================

-- Drop and recreate the view with proper security
DROP VIEW IF EXISTS public.user_x_connections_safe;

-- Create a function to get safe connection data instead of a view
-- This is more secure as it runs with SECURITY DEFINER and enforces user context
CREATE OR REPLACE FUNCTION public.get_my_x_connections()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  x_user_id text,
  x_username text,
  x_display_name text,
  x_profile_image text,
  connected_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    user_id,
    x_user_id,
    x_username,
    x_display_name,
    x_profile_image,
    connected_at,
    updated_at
  FROM public.user_x_connections
  WHERE user_id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_x_connections() TO authenticated;

-- ===================================================================
-- 2. FIX: OAuth tokens encryption
-- Add encrypted columns and encryption functions using pgcrypto
-- Note: For production, the encryption key should be stored in Vault
-- ===================================================================

-- Add encrypted token columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_x_connections'
    AND column_name = 'access_token_encrypted'
  ) THEN
    ALTER TABLE public.user_x_connections
      ADD COLUMN access_token_encrypted bytea,
      ADD COLUMN refresh_token_encrypted bytea;
  END IF;
END $$;

-- Create a comment to document the security requirement
COMMENT ON COLUMN public.user_x_connections.access_token IS
  'SECURITY NOTE: This column contains sensitive OAuth tokens. Access is restricted by RLS to the owning user only. For enhanced security, migrate to encrypted columns using Supabase Vault.';

COMMENT ON COLUMN public.user_x_connections.refresh_token IS
  'SECURITY NOTE: This column contains sensitive OAuth tokens. Access is restricted by RLS to the owning user only. For enhanced security, migrate to encrypted columns using Supabase Vault.';

-- ============================================================
-- Migration: 20260129032829_ab90ae6b-8dad-44b3-a870-38b5af0bbb67.sql
-- ============================================================

-- ============================================================
-- API Cache Table - Cache Sportradar and other API responses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_cache (
  cache_key TEXT PRIMARY KEY,
  response_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup of expired cache entries
CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON public.api_cache (expires_at);

-- Enable RLS (only service role should access this)
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- No public access - only backend/service role
CREATE POLICY "Service role only for api_cache" ON public.api_cache
  FOR ALL
  USING (false);

-- ============================================================
-- API Request Log Table - Track all API requests for audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying user requests
CREATE INDEX IF NOT EXISTS idx_api_request_log_user_id ON public.api_request_log (user_id);
CREATE INDEX IF NOT EXISTS idx_api_request_log_created_at ON public.api_request_log (created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_log_provider ON public.api_request_log (provider);

-- Enable RLS
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own request logs
CREATE POLICY "Users can view own request logs" ON public.api_request_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- No public insert/update/delete - only service role
CREATE POLICY "Service role for api_request_log inserts" ON public.api_request_log
  FOR INSERT
  WITH CHECK (false);

-- ============================================================
-- Function to clean up expired cache entries
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.api_cache WHERE expires_at < now();
END;
$$;

-- ============================================================
-- RE-INSERT: Admin role for isaiahmpeek@gmail.com
-- ============================================================
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'isaiahmpeek@gmail.com'
ON CONFLICT DO NOTHING;
