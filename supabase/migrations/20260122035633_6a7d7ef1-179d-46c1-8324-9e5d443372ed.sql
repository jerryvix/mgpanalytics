-- Create odds_snapshots table for tracking line movement over time
CREATE TABLE public.odds_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'nfl', -- 'nfl', 'nba', 'ncaab', etc.
  sportsbook TEXT NOT NULL,
  market_type TEXT NOT NULL, -- 'spread', 'total', 'moneyline'
  line_value REAL,
  price INTEGER,
  pulled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_odds_snapshots_game_id ON public.odds_snapshots(game_id);
CREATE INDEX idx_odds_snapshots_pulled_at ON public.odds_snapshots(pulled_at DESC);
CREATE INDEX idx_odds_snapshots_game_type ON public.odds_snapshots(game_type);

-- Enable RLS
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can read odds_snapshots"
ON public.odds_snapshots
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert odds_snapshots"
ON public.odds_snapshots
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update odds_snapshots"
ON public.odds_snapshots
FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete odds_snapshots"
ON public.odds_snapshots
FOR DELETE
USING (is_admin());