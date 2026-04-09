-- Allow managers and frontdesk to read all profiles
CREATE POLICY "profiles_read_all_for_managers_frontdesk"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('manager', 'frontdesk')
  )
);