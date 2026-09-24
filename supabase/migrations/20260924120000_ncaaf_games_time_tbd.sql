-- NCAAF kickoffs the networks have not set yet.
--
-- ESPN flags them with competitions[0].timeValid = false ("TBD" on its
-- scoreboard) and fills the date with a placeholder of midnight Eastern on the
-- game's day (2026-10-03T04:00Z during EDT, T05:00Z during EST). Stored with no
-- flag, the slate printed the placeholder as a real kickoff, e.g. "Fri Oct 2,
-- 9:00 PM" for a Pacific viewer, a day early. sync-ncaaf-games writes this
-- flag on every run; readers show the Eastern calendar date plus "TBD".
ALTER TABLE public.ncaaf_games
  ADD COLUMN IF NOT EXISTS time_tbd boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ncaaf_games.time_tbd IS
  'ESPN has not set a kickoff time (timeValid = false). date is then a midnight-ET placeholder: use its America/New_York calendar day only.';

-- Make the new column visible to PostgREST right away.
NOTIFY pgrst, 'reload schema';
