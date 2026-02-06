-- Add columns for tracking prop results after game completion
ALTER TABLE player_props
  ADD COLUMN IF NOT EXISTS actual_value NUMERIC,
  ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('over', 'under', 'push', 'void')),
  ADD COLUMN IF NOT EXISTS graded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient grading queries (find ungraded props from past games)
CREATE INDEX IF NOT EXISTS idx_player_props_ungraded
  ON player_props(game_date, sport)
  WHERE graded = false AND is_active = true;

-- Index for querying recent results per player
CREATE INDEX IF NOT EXISTS idx_player_props_results
  ON player_props(player_id, game_date DESC)
  WHERE graded = true;

-- Add grade_props to sync schedule so dispatch-syncs runs it automatically
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled, endpoint_url)
VALUES ('ALL', 'grade_props', '6h', true, '/functions/v1/grade-player-props')
ON CONFLICT (sport, data_type) DO NOTHING;
