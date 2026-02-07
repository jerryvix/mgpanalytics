-- Add sync_schedule rows for NBA backfill and NFL game logs
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled, last_sync_status)
VALUES
  ('NBA', 'backfill', '24h', true, 'pending'),
  ('NFL', 'game_logs', '24h', true, 'pending')
ON CONFLICT (sport, data_type) DO NOTHING;
