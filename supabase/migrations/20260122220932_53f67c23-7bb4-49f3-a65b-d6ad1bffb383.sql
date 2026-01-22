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