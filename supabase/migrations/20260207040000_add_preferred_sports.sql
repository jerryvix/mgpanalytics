ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_sports TEXT[] DEFAULT ARRAY['NFL', 'NBA', 'NCAAB'];
