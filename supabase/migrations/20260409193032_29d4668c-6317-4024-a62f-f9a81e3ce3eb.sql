
-- Create a security definer function to get user role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS profiles_read_all_for_managers_frontdesk ON public.profiles;

-- Recreate it using the security definer function
CREATE POLICY profiles_read_all_for_managers_frontdesk ON public.profiles
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('manager', 'frontdesk'));

-- Also add INSERT policy so profile auto-creation works
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
