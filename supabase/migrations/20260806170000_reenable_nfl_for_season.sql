-- Re-enable NFL data syncs for the 2026 season (BDL key verified live for
-- NFL endpoints on Aug 6 2026 via test-bdl). advanced_stats stays disabled —
-- it has no edge function implementation.
UPDATE sync_schedule SET is_enabled = true
WHERE sport = 'NFL'
  AND data_type IN ('players', 'season_stats', 'game_logs', 'players_slate');
