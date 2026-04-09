-- Fix function search path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'frontdesk');
  RETURN new;
END;
$$;

-- Fix overly permissive contacts insert
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('frontdesk','manager'))
  );

-- Fix overly permissive case_notes insert
DROP POLICY IF EXISTS "case_notes_insert" ON public.case_notes;
CREATE POLICY "case_notes_insert" ON public.case_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);