-- Market Pulse (Game Insights): DraftKings public betting splits.
--
-- Source: the DK Network betting-splits page (dknetwork.draftkings.com), which
-- publishes, per game and market, each side's share of tickets (% bets) and
-- share of money (% handle) next to DraftKings' current price. The
-- sync-betting-splits edge function maps every DK matchup onto our own game
-- rows and adds DraftKings' OPENING number (via ESPN's core odds API, which
-- relays DK open + current) so the client can flag reverse line moves.
--
--   betting_splits          latest capture per (game, market, side); upserted
--                           each run, sides DK stopped listing are pruned.
--   betting_splits_history  append-only timeline; a row lands only when a
--                           side's line, price, bets % or handle % changed
--                           since the previous capture.
--
-- Sport-agnostic like odds_history: game_id is the primary key of that sport's
-- games table as text (ncaaf_games.id uuid, games.id integer for NFL). Sides
-- are relative to OUR game row: a neutral-site game DK lists the other way
-- round is flipped at sync time, so 'home' always means our home team.

CREATE TABLE IF NOT EXISTS public.betting_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  game_id text NOT NULL,
  source text NOT NULL DEFAULT 'draftkings',
  source_event_id text NOT NULL,
  source_matchup text NOT NULL,
  away_team text NOT NULL,
  home_team text NOT NULL,
  event_start timestamptz,
  market text NOT NULL CHECK (market IN ('spread', 'total', 'moneyline')),
  side text NOT NULL CHECK (side IN ('away', 'home', 'over', 'under')),
  line numeric,
  price integer,
  bets_pct smallint NOT NULL CHECK (bets_pct BETWEEN 0 AND 100),
  handle_pct smallint NOT NULL CHECK (handle_pct BETWEEN 0 AND 100),
  open_line numeric,
  open_price integer,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT betting_splits_side_fits_market CHECK ((market = 'total') = (side IN ('over', 'under'))),
  CONSTRAINT betting_splits_one_row_per_side UNIQUE (source, sport, game_id, market, side)
);

CREATE INDEX IF NOT EXISTS idx_betting_splits_game ON public.betting_splits (sport, game_id);
CREATE INDEX IF NOT EXISTS idx_betting_splits_captured ON public.betting_splits (captured_at DESC);

CREATE TABLE IF NOT EXISTS public.betting_splits_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  game_id text NOT NULL,
  source text NOT NULL DEFAULT 'draftkings',
  source_event_id text NOT NULL,
  market text NOT NULL CHECK (market IN ('spread', 'total', 'moneyline')),
  side text NOT NULL CHECK (side IN ('away', 'home', 'over', 'under')),
  line numeric,
  price integer,
  bets_pct smallint NOT NULL CHECK (bets_pct BETWEEN 0 AND 100),
  handle_pct smallint NOT NULL CHECK (handle_pct BETWEEN 0 AND 100),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_betting_splits_history_game
  ON public.betting_splits_history (sport, game_id, market, side, captured_at);

DROP TRIGGER IF EXISTS update_betting_splits_updated_at ON public.betting_splits;
CREATE TRIGGER update_betting_splits_updated_at
  BEFORE UPDATE ON public.betting_splits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: public read like the sibling odds tables (ncaaf_odds, odds_history);
-- writes are admin-only. The sync runs as the service role, which bypasses RLS.
ALTER TABLE public.betting_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.betting_splits_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read betting_splits" ON public.betting_splits;
CREATE POLICY "Anyone can read betting_splits"
  ON public.betting_splits FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert betting_splits" ON public.betting_splits;
CREATE POLICY "Admins can insert betting_splits"
  ON public.betting_splits FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update betting_splits" ON public.betting_splits;
CREATE POLICY "Admins can update betting_splits"
  ON public.betting_splits FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete betting_splits" ON public.betting_splits;
CREATE POLICY "Admins can delete betting_splits"
  ON public.betting_splits FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Anyone can read betting_splits_history" ON public.betting_splits_history;
CREATE POLICY "Anyone can read betting_splits_history"
  ON public.betting_splits_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert betting_splits_history" ON public.betting_splits_history;
CREATE POLICY "Admins can insert betting_splits_history"
  ON public.betting_splits_history FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can update betting_splits_history" ON public.betting_splits_history;
CREATE POLICY "Admins can update betting_splits_history"
  ON public.betting_splits_history FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can delete betting_splits_history" ON public.betting_splits_history;
CREATE POLICY "Admins can delete betting_splits_history"
  ON public.betting_splits_history FOR DELETE TO authenticated USING (public.is_admin());

-- ncaaf_odds.updated_at and mlb_odds.updated_at never moved after the first
-- insert (no trigger, and the games syncs upsert without the column), so they
-- recorded creation, not freshness. Market Pulse shows whichever DraftKings
-- capture is fresher (the splits page vs the ESPN-fed odds row) and labels
-- the line "updated X ago", which needs a real last-written time. Same
-- trigger the NFL odds table already has.
DROP TRIGGER IF EXISTS update_ncaaf_odds_updated_at ON public.ncaaf_odds;
CREATE TRIGGER update_ncaaf_odds_updated_at
  BEFORE UPDATE ON public.ncaaf_odds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_mlb_odds_updated_at ON public.mlb_odds;
CREATE TRIGGER update_mlb_odds_updated_at
  BEFORE UPDATE ON public.mlb_odds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One cross-sport job (NCAAF + NFL per run; the function skips sports that
-- are out of season). The dispatcher fires every few hours, so the effective
-- cadence is the dispatcher's, capped below by this interval.
INSERT INTO sync_schedule (sport, data_type, cron_interval, is_enabled)
VALUES ('ALL', 'betting_splits', '2h', true)
ON CONFLICT (sport, data_type) DO NOTHING;

-- Refresh PostgREST's schema cache so the REST API serves the new tables
-- immediately (needed when applying DDL outside the migration runner).
NOTIFY pgrst, 'reload schema';
