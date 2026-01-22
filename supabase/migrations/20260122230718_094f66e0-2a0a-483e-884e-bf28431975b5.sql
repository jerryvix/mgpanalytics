ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS raw_data jsonb;

CREATE INDEX IF NOT EXISTS idx_players_raw_data_gin
ON public.players
USING gin (raw_data);
