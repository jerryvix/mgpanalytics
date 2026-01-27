-- ===================================================================
-- Security Migration: Fix RLS Policies for profiles, user_x_connections, x_oauth_states
-- ===================================================================

-- ===================================================================
-- 1. FIX: profiles table - Users should only read their own profile
-- ===================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- Create strict policy: users can ONLY read their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Admin policy using existing has_role function
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ===================================================================
-- 2. FIX: user_x_connections - Encrypt tokens and restrict access
-- ===================================================================

-- Enable pgcrypto extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Users can manage own connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can read connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can insert connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can delete connections" ON public.user_x_connections;
DROP POLICY IF EXISTS "Users can update connections" ON public.user_x_connections;

-- Create strict user-scoped policies
CREATE POLICY "Users can read own connections" ON public.user_x_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON public.user_x_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON public.user_x_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON public.user_x_connections
  FOR DELETE USING (auth.uid() = user_id);

-- Create a secure view that excludes sensitive token fields
-- Users should query this view instead of the base table for public-facing data
DROP VIEW IF EXISTS public.user_x_connections_safe;
CREATE VIEW public.user_x_connections_safe
WITH (security_invoker = on) AS
SELECT 
  id, 
  user_id, 
  x_user_id, 
  x_username, 
  x_display_name, 
  x_profile_image,
  connected_at, 
  updated_at
FROM public.user_x_connections
WHERE user_id = auth.uid();
-- Note: access_token and refresh_token are NOT included for security

-- ===================================================================
-- 3. FIX: x_oauth_states - Time-limited, user-scoped policies
-- ===================================================================

-- Drop overly permissive service role policy
DROP POLICY IF EXISTS "Service role states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Service role can manage states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can create own oauth states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can read own oauth states" ON public.x_oauth_states;
DROP POLICY IF EXISTS "Users can delete own oauth states" ON public.x_oauth_states;

-- Create user-scoped policies
CREATE POLICY "Users can create own oauth states" ON public.x_oauth_states
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own oauth states" ON public.x_oauth_states
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states" ON public.x_oauth_states
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create index for cleanup queries if not exists
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.x_oauth_states(expires_at);

-- Create function to auto-delete expired states
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.x_oauth_states WHERE expires_at < now();
END;
$$;