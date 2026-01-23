-- Add unique constraint for sync_schedule upserts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_schedule_sport_data_type_key'
  ) THEN
    ALTER TABLE public.sync_schedule 
    ADD CONSTRAINT sync_schedule_sport_data_type_key 
    UNIQUE (sport, data_type);
  END IF;
END $$;