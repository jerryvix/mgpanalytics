-- Add trial and onboarding columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_path TEXT DEFAULT NULL;

-- Update handle_new_user trigger to set trial dates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, trial_started_at, trial_ends_at)
  VALUES (NEW.id, NEW.email, now(), now() + interval '14 days');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

-- Backfill existing users who don't have trial dates
UPDATE public.profiles
SET trial_started_at = created_at,
    trial_ends_at = created_at + interval '14 days'
WHERE trial_started_at IS NULL;
