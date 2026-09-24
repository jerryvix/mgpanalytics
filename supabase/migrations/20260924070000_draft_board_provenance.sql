-- Draft board provenance (Sep 2026). The board moved from Tankathon to
-- DraftTek's top 200; record which board each row came from and that board's
-- own revision date. captured_at stays the scrape time (it identifies one
-- capture, which is what pruning and the client guard key on); source_as_of
-- drives the client's 21-day staleness check, so a source that stops
-- revising reads "insufficient" instead of looking fresh because we keep
-- re-scraping it.

ALTER TABLE public.ncaaf_draft_prospects
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_as_of date;

-- Rows already on the board came from the Tankathon scrape (its revision
-- date was never recorded); the next sync replaces them wholesale.
UPDATE public.ncaaf_draft_prospects SET source = 'Tankathon' WHERE source IS NULL;

-- Refresh PostgREST's schema cache so the REST API serves the new columns
NOTIFY pgrst, 'reload schema';
