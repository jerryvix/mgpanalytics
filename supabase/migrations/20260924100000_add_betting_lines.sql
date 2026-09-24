-- Market Pulse: ONE freshest DraftKings line per market.
--
-- betting_splits takes DK's % of bets and % of money from the DK Network
-- splits page, but that page's odds column lags DraftKings itself (Sep 24
-- 2026: NYJ @ DET was +245 / -305 at DK at 07:12 while the page printed +240
-- / -298 until about 08:10), and games without a split only refreshed with
-- the daily games syncs. sync-betting-splits now also reads DraftKings'
-- current and opening line from ESPN's core odds API (which relays DK) for
-- EVERY game in its window, splits or not, and stores it here. Market Pulse,
-- the slate cards and the chat all show this line; the splits page supplies
-- bets % and money % only.
--
-- Latest capture per (game, market, side), upserted each run. Sides are
-- relative to OUR game row (a neutral-site game ESPN lists the other way
-- round is flipped at sync time). game_id is the sport's games-table primary
-- key as text, like betting_splits.

CREATE TABLE IF NOT EXISTS public.betting_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  game_id text NOT NULL,
  source text NOT NULL DEFAULT 'draftkings',
  feed text NOT NULL DEFAULT 'espn',
  feed_event_id text,
  market text NOT NULL CHECK (market IN ('spread', 'total', 'moneyline')),
  side text NOT NULL CHECK (side IN ('away', 'home', 'over', 'under')),
  line numeric,
  price integer,
  open_line numeric,
  open_price integer,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT betting_lines_side_fits_market CHECK ((market = 'total') = (side IN ('over', 'under'))),
  CONSTRAINT betting_lines_one_row_per_side UNIQUE (source, sport, game_id, market, side)
);

CREATE INDEX IF NOT EXISTS idx_betting_lines_game ON public.betting_lines (sport, game_id);

DROP TRIGGER IF EXISTS update_betting_lines_updated_at ON public.betting_lines;
CREATE TRIGGER update_betting_lines_updated_at
  BEFORE UPDATE ON public.betting_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: public read like betting_splits and the odds tables; writes are
-- admin-only (the sync runs as the service role, which bypasses RLS).
ALTER TABLE public.betting_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read betting_lines" ON public.betting_lines;
CREATE POLICY "Anyone can read betting_lines"
  ON public.betting_lines FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert betting_lines" ON public.betting_lines;
CREATE POLICY "Admins can insert betting_lines"
  ON public.betting_lines FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update betting_lines" ON public.betting_lines;
CREATE POLICY "Admins can update betting_lines"
  ON public.betting_lines FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete betting_lines" ON public.betting_lines;
CREATE POLICY "Admins can delete betting_lines"
  ON public.betting_lines FOR DELETE TO authenticated USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
