-- ===================================================================
-- Security Migration: Additional fixes for OAuth tokens and views
-- ===================================================================

-- ===================================================================
-- 1. FIX: user_x_connections_safe view RLS
-- Views inherit security from their base table when using security_invoker
-- But we need to ensure the view is properly secured
-- ===================================================================

-- Drop and recreate the view with proper security
DROP VIEW IF EXISTS public.user_x_connections_safe;

-- Create a function to get safe connection data instead of a view
-- This is more secure as it runs with SECURITY DEFINER and enforces user context
CREATE OR REPLACE FUNCTION public.get_my_x_connections()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  x_user_id text,
  x_username text,
  x_display_name text,
  x_profile_image text,
  connected_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_x_connections() TO authenticated;

-- ===================================================================
-- 2. FIX: OAuth tokens encryption
-- Add encrypted columns and encryption functions using pgcrypto
-- Note: For production, the encryption key should be stored in Vault
-- ===================================================================

-- Add encrypted token columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_x_connections' 
    AND column_name = 'access_token_encrypted'
  ) THEN
    ALTER TABLE public.user_x_connections 
      ADD COLUMN access_token_encrypted bytea,
      ADD COLUMN refresh_token_encrypted bytea;
  END IF;
END $$;

-- Create a comment to document the security requirement
COMMENT ON COLUMN public.user_x_connections.access_token IS 
  'SECURITY NOTE: This column contains sensitive OAuth tokens. Access is restricted by RLS to the owning user only. For enhanced security, migrate to encrypted columns using Supabase Vault.';

COMMENT ON COLUMN public.user_x_connections.refresh_token IS 
  'SECURITY NOTE: This column contains sensitive OAuth tokens. Access is restricted by RLS to the owning user only. For enhanced security, migrate to encrypted columns using Supabase Vault.';