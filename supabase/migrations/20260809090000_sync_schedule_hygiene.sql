-- Sync schedule hygiene (Aug 2026 ops audit)
--
-- 1) Seed MLB players/hitting schedule rows. These existed only as hand-inserted
--    rows in prod; without them a fresh environment never refreshes hit streaks.
-- 2) Disable rows that dispatch nothing useful:
--    - NBA:backfill is a one-time historical backfill that was left on a 24h
--      recurring schedule (failing since June, burns BDL quota when it runs).
--    - NFL:advanced_stats has no function mapped in dispatch-syncs; the row has
--      been dead since February.

INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES
  ('MLB', 'players', '24h', true),
  ('MLB', 'hitting', '4h', true)
ON CONFLICT (sport, data_type) DO NOTHING;

UPDATE sync_schedule SET is_enabled = false
WHERE (sport = 'NBA' AND data_type = 'backfill')
   OR (sport = 'NFL' AND data_type = 'advanced_stats');
