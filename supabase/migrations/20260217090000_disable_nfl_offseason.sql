-- Disable NFL data syncs during off-season (Feb 2026).
-- NFL:games and NFL:props rows kept for easy re-enable in September;
-- they are also blocked by isSportInSeason() in dispatch-syncs.
UPDATE sync_schedule SET is_enabled = false
WHERE sport = 'NFL'
  AND data_type IN ('players', 'season_stats', 'advanced_stats', 'game_logs', 'players_slate');
