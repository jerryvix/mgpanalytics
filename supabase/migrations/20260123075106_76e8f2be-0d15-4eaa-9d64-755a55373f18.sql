-- Create table for storing user X (Twitter) connections
CREATE TABLE public.user_x_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  x_user_id TEXT NOT NULL,
  x_username TEXT NOT NULL,
  x_display_name TEXT,
  x_profile_image TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(x_user_id)
);

-- Enable RLS
ALTER TABLE public.user_x_connections ENABLE ROW LEVEL SECURITY;

-- Users can only view their own connection
CREATE POLICY "Users can view own X connection"
ON public.user_x_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own connection
CREATE POLICY "Users can insert own X connection"
ON public.user_x_connections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own connection
CREATE POLICY "Users can update own X connection"
ON public.user_x_connections
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own connection
CREATE POLICY "Users can delete own X connection"
ON public.user_x_connections
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_x_connections_updated_at
BEFORE UPDATE ON public.user_x_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for OAuth state tokens (PKCE flow)
CREATE TABLE public.x_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.x_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only the system can manage OAuth states (via service role in edge functions)
CREATE POLICY "Service role manages OAuth states"
ON public.x_oauth_states
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);