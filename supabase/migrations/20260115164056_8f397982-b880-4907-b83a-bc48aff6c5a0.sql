-- Create sync_log table for tracking data sync operations
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Everyone can read sync logs
CREATE POLICY "Anyone can read sync_log"
  ON public.sync_log
  FOR SELECT
  USING (true);

-- Only admins can insert sync logs
CREATE POLICY "Admins can insert sync_log"
  ON public.sync_log
  FOR INSERT
  WITH CHECK (is_admin());

-- Only admins can update sync logs
CREATE POLICY "Admins can update sync_log"
  ON public.sync_log
  FOR UPDATE
  USING (is_admin());

-- Only admins can delete sync logs
CREATE POLICY "Admins can delete sync_log"
  ON public.sync_log
  FOR DELETE
  USING (is_admin());