-- DK splits freshness (Market Pulse QC round 2, Sep 24 2026).
--
-- DK Network serves its splits page through a CDN cache that handed back
-- hours-old copies as current: page 1 of both sports kept its 06:43 numbers
-- through the 08:01, 09:31 and 10:25 runs while the live page had moved, and
-- the app labeled them "split 12m ago". sync-betting-splits now fetches past
-- the cache (see supabase/functions/sync-betting-splits/freshness.ts). This
-- migration stores what it learns.

-- When DraftKings' page showed a row's numbers: the response time of an
-- uncached fetch (less any Age), or, for a page flagged as a stale capture,
-- the first run that saw its numbers. "split X ago" reads this, not the
-- fetch time in captured_at.
ALTER TABLE public.betting_splits ADD COLUMN IF NOT EXISTS source_as_of timestamptz;
ALTER TABLE public.betting_splits_history ADD COLUMN IF NOT EXISTS source_as_of timestamptz;

COMMENT ON COLUMN public.betting_splits.source_as_of IS
  'When DraftKings'' splits page showed these numbers: an uncached fetch''s response time, or the first sighting of a page flagged as a stale capture. The app''s "split X ago" reads this; captured_at is our fetch time.';

-- The last content hash sync-betting-splits saw for each DK page, and since
-- when. A page whose numbers have not changed for hours while other pages
-- did is flagged as a stale capture (run status partial, rows labeled with
-- hash_since). Written by the sync as the service role; admins can read it.
CREATE TABLE IF NOT EXISTS public.betting_splits_pages (
  source text NOT NULL DEFAULT 'draftkings',
  sport text NOT NULL,
  window_key text NOT NULL,
  page integer NOT NULL,
  content_hash text NOT NULL,
  hash_since timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL,
  x_cache text,
  age_seconds integer,
  events integer NOT NULL DEFAULT 0,
  PRIMARY KEY (source, sport, window_key, page)
);

ALTER TABLE public.betting_splits_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read betting_splits_pages" ON public.betting_splits_pages;
CREATE POLICY "Admins can read betting_splits_pages"
  ON public.betting_splits_pages FOR SELECT TO authenticated USING (public.is_admin());
