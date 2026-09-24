-- Turn the draft board refresh back on, now daily (Sep 2026).
--
-- The NCAAF draft_board schedule row was disabled by hand on Sep 24 2026 so
-- the new DraftTek sync could not run under the old frontend. Apply this
-- once the frontend that reads the 200-deep board is live: it re-enables
-- the row and moves it from weekly to daily (a run is two DraftTek page
-- fetches, and DraftTek revises in-season without a fixed day). The
-- dispatcher parses '24h' like every other daily row; since the row last
-- ran Sep 19, it is due at the next dispatcher tick after this applies.

UPDATE public.sync_schedule
SET cron_interval = '24h',
    is_enabled = true
WHERE sport = 'NCAAF' AND data_type = 'draft_board';
