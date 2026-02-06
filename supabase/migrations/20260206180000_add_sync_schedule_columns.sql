-- Add scheduling columns to sync_schedule table
ALTER TABLE sync_schedule
  ADD COLUMN IF NOT EXISTS cron_interval text DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS records_synced integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Seed default schedules for all sync functions
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES
  ('NFL', 'games', '24h', true),
  ('NFL', 'players', '24h', true),
  ('NFL', 'season_stats', '24h', true),
  ('NFL', 'game_logs', '24h', true),
  ('NBA', 'games', '24h', true),
  ('NBA', 'odds', '6h', true),
  ('NBA', 'players', '24h', true),
  ('NBA', 'stats', '24h', true),
  ('NBA', 'game_logs', '24h', true),
  ('NCAAB', 'games', '24h', true),
  ('NCAAF', 'games', '24h', true),
  ('MLB', 'games', '24h', true),
  ('ALL', 'player_props', '6h', true),
  ('ALL', 'odds_snapshot', '6h', true)
ON CONFLICT (sport, data_type) DO UPDATE SET
  cron_interval = EXCLUDED.cron_interval,
  is_enabled = COALESCE(sync_schedule.is_enabled, EXCLUDED.is_enabled);
