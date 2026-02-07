-- P3-01: Create sync_log table for historical sync audit trail
-- Previous system only stored the LAST sync result in sync_schedule.
-- This table retains all sync runs for observability and debugging.

-- Drop old sync_log table (had incompatible schema from earlier manual creation)
DROP TABLE IF EXISTS sync_log CASCADE;

CREATE TABLE sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  data_type text NOT NULL,
  function_name text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'unknown',  -- 'cron', 'admin_manual', 'dispatch'
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed', 'partial'
  records_added integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_failed integer DEFAULT 0,
  api_source text,                          -- 'espn', 'balldontlie', 'the_odds_api'
  api_requests_used integer DEFAULT 0,
  api_requests_remaining integer,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb,        -- sample data, errors array, unmatched players, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient querying by sport/data_type + time (Observatory page filters)
CREATE INDEX idx_sync_log_sport_datatype_started ON sync_log (sport, data_type, started_at DESC);

-- Index for status filtering (find failures quickly)
CREATE INDEX idx_sync_log_status ON sync_log (status, started_at DESC);

-- Index for time-based queries (summary cards, retention cleanup)
CREATE INDEX idx_sync_log_started_at ON sync_log (started_at DESC);

-- Enable RLS
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Readable by authenticated users (admin panel checks role in application code)
CREATE POLICY "Authenticated users can read sync_log" ON sync_log
  FOR SELECT TO authenticated
  USING (true);

-- Service role (edge functions) can insert and update
CREATE POLICY "Service role can insert sync_log" ON sync_log
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update sync_log" ON sync_log
  FOR UPDATE TO service_role
  USING (true);

-- Also allow anon key to read (for admin panel that uses anon key with auth header)
CREATE POLICY "Anon can read sync_log" ON sync_log
  FOR SELECT TO anon
  USING (true);
