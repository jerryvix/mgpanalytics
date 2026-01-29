-- ============================================================
-- API Cache Table - Cache Sportradar and other API responses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_cache (
  cache_key TEXT PRIMARY KEY,
  response_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup of expired cache entries
CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON public.api_cache (expires_at);

-- Enable RLS (only service role should access this)
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- No public access - only backend/service role
CREATE POLICY "Service role only for api_cache" ON public.api_cache
  FOR ALL
  USING (false);

-- ============================================================
-- API Request Log Table - Track all API requests for audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying user requests
CREATE INDEX IF NOT EXISTS idx_api_request_log_user_id ON public.api_request_log (user_id);
CREATE INDEX IF NOT EXISTS idx_api_request_log_created_at ON public.api_request_log (created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_log_provider ON public.api_request_log (provider);

-- Enable RLS
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own request logs
CREATE POLICY "Users can view own request logs" ON public.api_request_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- No public insert/update/delete - only service role
CREATE POLICY "Service role for api_request_log inserts" ON public.api_request_log
  FOR INSERT
  WITH CHECK (false);

-- ============================================================
-- Function to clean up expired cache entries
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.api_cache WHERE expires_at < now();
END;
$$;