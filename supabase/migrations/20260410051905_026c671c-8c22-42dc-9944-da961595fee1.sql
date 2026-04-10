
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_read_all_staff" ON public.profiles
  FOR SELECT TO authenticated USING (public.get_my_role() IN ('manager','frontdesk'));

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_manager" ON public.profiles
  FOR UPDATE TO authenticated USING (public.get_my_role() = 'manager');
