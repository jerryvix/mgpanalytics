-- Create enum for capper categories
CREATE TYPE capper_category AS ENUM (
  'sharp_bettor',
  'analyst', 
  'media',
  'insider',
  'odds_provider',
  'community'
);

-- Create enum for capper tiers
CREATE TYPE capper_tier AS ENUM (
  'elite',
  'popular',
  'rising'
);

-- Create cappers table
CREATE TABLE public.cappers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  x_display_name TEXT NOT NULL,
  x_profile_image TEXT,
  x_verified BOOLEAN DEFAULT false,
  x_followers_count INTEGER DEFAULT 0,
  
  -- MGP-specific metadata
  category capper_category NOT NULL DEFAULT 'community',
  sports TEXT[] DEFAULT '{}',
  specialty TEXT[] DEFAULT '{}',
  description TEXT,
  mgp_verified BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  tier capper_tier NOT NULL DEFAULT 'rising',
  
  -- Engagement tracking
  mgp_followers INTEGER DEFAULT 0,
  
  -- Timestamps
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_sports CHECK (sports <@ ARRAY['NFL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'NCAAF', 'Soccer', 'MMA', 'Golf', 'Tennis']::text[])
);

-- Create index for common queries
CREATE INDEX idx_cappers_category ON public.cappers(category);
CREATE INDEX idx_cappers_tier ON public.cappers(tier);
CREATE INDEX idx_cappers_featured ON public.cappers(featured) WHERE featured = true;
CREATE INDEX idx_cappers_sports ON public.cappers USING GIN(sports);
CREATE INDEX idx_cappers_mgp_followers ON public.cappers(mgp_followers DESC);

-- Enable RLS
ALTER TABLE public.cappers ENABLE ROW LEVEL SECURITY;

-- Everyone can read cappers (public directory)
CREATE POLICY "Anyone can read cappers"
ON public.cappers
FOR SELECT
USING (true);

-- Only admins can manage cappers
CREATE POLICY "Admins can insert cappers"
ON public.cappers
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "Admins can update cappers"
ON public.cappers
FOR UPDATE
TO authenticated
USING (is_admin());

CREATE POLICY "Admins can delete cappers"
ON public.cappers
FOR DELETE
TO authenticated
USING (is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_cappers_updated_at
BEFORE UPDATE ON public.cappers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create user_capper_follows table to track which cappers MGP users follow
CREATE TABLE public.user_capper_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capper_id UUID NOT NULL REFERENCES public.cappers(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, capper_id)
);

-- Enable RLS
ALTER TABLE public.user_capper_follows ENABLE ROW LEVEL SECURITY;

-- Users can view their own follows
CREATE POLICY "Users can view own capper follows"
ON public.user_capper_follows
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can follow cappers
CREATE POLICY "Users can follow cappers"
ON public.user_capper_follows
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can unfollow cappers
CREATE POLICY "Users can unfollow cappers"
ON public.user_capper_follows
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to update mgp_followers count
CREATE OR REPLACE FUNCTION update_capper_follower_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE cappers SET mgp_followers = mgp_followers + 1 WHERE id = NEW.capper_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE cappers SET mgp_followers = mgp_followers - 1 WHERE id = OLD.capper_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger to auto-update follower count
CREATE TRIGGER update_capper_followers_on_follow
AFTER INSERT OR DELETE ON public.user_capper_follows
FOR EACH ROW
EXECUTE FUNCTION update_capper_follower_count();

-- Insert some sample cappers for initial directory
INSERT INTO public.cappers (x_user_id, x_username, x_display_name, x_profile_image, x_verified, x_followers_count, category, sports, specialty, description, mgp_verified, featured, tier, mgp_followers) VALUES
('1234567890', 'SharpFootball', 'Warren Sharp', 'https://pbs.twimg.com/profile_images/sharp_football.jpg', true, 245000, 'sharp_bettor', ARRAY['NFL', 'NCAAF'], ARRAY['game totals', 'team trends', 'situational analysis'], 'NFL analytics pioneer. Author and betting analyst known for predictive models and situational spotting.', true, true, 'elite', 842),
('1234567891', 'eaborern', 'Evan Abram', 'https://pbs.twimg.com/profile_images/evan_abram.jpg', true, 89000, 'analyst', ARRAY['NBA'], ARRAY['player props', 'usage analysis', 'matchup grades'], 'NBA player props specialist. Deep dives into usage rates, matchup data, and prop market inefficiencies.', true, true, 'elite', 634),
('1234567892', 'TheRotoWorld', 'Roto World', 'https://pbs.twimg.com/profile_images/roto_world.jpg', true, 512000, 'media', ARRAY['NFL', 'NBA', 'MLB'], ARRAY['breaking news', 'injuries', 'lineup changes'], 'Breaking news and player updates across all major sports. Essential for injury and lineup information.', true, true, 'elite', 1205),
('1234567893', 'BettingBruiser', 'The Bruiser', 'https://pbs.twimg.com/profile_images/bruiser.jpg', false, 45000, 'sharp_bettor', ARRAY['NFL', 'NBA'], ARRAY['spreads', 'money line', 'live betting'], 'Sharp bettor with documented success. Known for finding value in spreads and live betting opportunities.', true, false, 'popular', 312),
('1234567894', 'PropBetGuy', 'Prop Bet Guy', 'https://pbs.twimg.com/profile_images/propbetguy.jpg', false, 67000, 'analyst', ARRAY['NBA', 'NFL'], ARRAY['player props', 'alt lines', 'SGP builds'], 'Player prop specialist across NBA and NFL. Known for finding +EV prop opportunities.', true, false, 'popular', 456),
('1234567895', 'ActionNetworkHQ', 'Action Network', 'https://pbs.twimg.com/profile_images/action_network.jpg', true, 890000, 'media', ARRAY['NFL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'NCAAF'], ARRAY['odds movement', 'public betting', 'sharp action'], 'The home for sports betting news, data, and analysis. Track line movement and public betting percentages.', true, true, 'elite', 2341),
('1234567896', 'NFLDraftScout', 'Draft Scout', 'https://pbs.twimg.com/profile_images/draft_scout.jpg', true, 156000, 'insider', ARRAY['NFL', 'NCAAF'], ARRAY['injuries', 'roster moves', 'depth charts'], 'NFL insider with connections. Breaking injury news and roster information before it hits mainstream.', true, false, 'popular', 523),
('1234567897', 'VegasInsider', 'Vegas Insider', 'https://pbs.twimg.com/profile_images/vegas_insider.jpg', true, 234000, 'odds_provider', ARRAY['NFL', 'NBA', 'MLB', 'NHL'], ARRAY['opening lines', 'line movement', 'consensus'], 'Real-time odds and line movement tracking across major sportsbooks.', true, true, 'elite', 987),
('1234567898', 'CFFBAlerts', 'College FB Alerts', 'https://pbs.twimg.com/profile_images/cffb.jpg', false, 28000, 'community', ARRAY['NCAAF'], ARRAY['game picks', 'situational spots', 'weather'], 'College football betting community. Game-day analysis and situational betting opportunities.', false, false, 'rising', 145),
('1234567899', 'NBAPropsKing', 'NBA Props King', 'https://pbs.twimg.com/profile_images/nba_props.jpg', false, 52000, 'analyst', ARRAY['NBA'], ARRAY['player props', 'rebounds', 'assists'], 'Focused exclusively on NBA player props. Specializes in rebounds, assists, and combined stat lines.', true, false, 'popular', 378);