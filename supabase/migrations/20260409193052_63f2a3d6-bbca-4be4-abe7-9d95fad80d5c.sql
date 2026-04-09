
-- Update admin profile role
UPDATE public.profiles SET role = 'manager', full_name = 'Super Admin' WHERE id = 'd607ef7c-0f3d-41bc-9f02-1abccddb8245';

-- Fix cases policies
DROP POLICY IF EXISTS cases_insert ON public.cases;
CREATE POLICY cases_insert ON public.cases FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk', 'manager'));

DROP POLICY IF EXISTS cases_read_all ON public.cases;
CREATE POLICY cases_read_all ON public.cases FOR SELECT TO authenticated
  USING (
    public.get_my_role() IN ('frontdesk', 'manager')
    OR (public.get_my_role() = 'department' AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS cases_update ON public.cases;
CREATE POLICY cases_update ON public.cases FOR UPDATE TO authenticated
  USING (
    public.get_my_role() IN ('frontdesk', 'manager')
    OR (public.get_my_role() = 'department' AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()))
  );

-- Fix case_categories policies
DROP POLICY IF EXISTS case_categories_delete ON public.case_categories;
CREATE POLICY case_categories_delete ON public.case_categories FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');

DROP POLICY IF EXISTS case_categories_insert ON public.case_categories;
CREATE POLICY case_categories_insert ON public.case_categories FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'manager');

DROP POLICY IF EXISTS case_categories_update ON public.case_categories;
CREATE POLICY case_categories_update ON public.case_categories FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'manager');

-- Fix contacts policies
DROP POLICY IF EXISTS contacts_insert ON public.contacts;
CREATE POLICY contacts_insert ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk', 'manager'));

-- Fix case_notes policies
DROP POLICY IF EXISTS case_notes_insert ON public.case_notes;
CREATE POLICY case_notes_insert ON public.case_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
