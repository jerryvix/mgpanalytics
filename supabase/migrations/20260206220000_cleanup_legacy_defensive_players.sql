-- Remove legacy defensive/special-teams NFL players from before the position filter
-- was added to sync-nfl-players. Only skill positions (QB, RB, WR, TE, FB) are
-- bet-relevant and supported by MGP.
-- This is a hard prerequisite for Sportradar integration.

DELETE FROM players
WHERE sport = 'NFL'
  AND position NOT IN (
    'QB', 'RB', 'WR', 'TE', 'FB',
    'Quarterback', 'Running Back', 'Wide Receiver', 'Tight End', 'Fullback'
  );
