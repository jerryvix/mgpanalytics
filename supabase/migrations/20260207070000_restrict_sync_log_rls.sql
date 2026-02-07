-- Restrict sync_log read access to admin users only.
-- Previously, any authenticated or anon user could read sync_log,
-- which leaks internal sync infrastructure details to consumers.

-- Drop the permissive policies
DROP POLICY IF EXISTS "Authenticated users can read sync_log" ON sync_log;
DROP POLICY IF EXISTS "Anon can read sync_log" ON sync_log;
DROP POLICY IF EXISTS "Anyone can read sync_log" ON sync_log;

-- Admins can read sync_log
CREATE POLICY "Admins can read sync_log" ON sync_log
  FOR SELECT TO authenticated
  USING (is_admin());

-- Service role retains full access (insert/update policies already exist)
