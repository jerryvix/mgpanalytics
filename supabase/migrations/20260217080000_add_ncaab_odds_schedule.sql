-- Add NCAAB:odds entry to sync_schedule so dispatch-syncs can trigger it
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('NCAAB', 'odds', '6h', true)
ON CONFLICT (sport, data_type) DO NOTHING;
