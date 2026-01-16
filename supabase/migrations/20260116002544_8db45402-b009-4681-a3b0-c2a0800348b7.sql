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