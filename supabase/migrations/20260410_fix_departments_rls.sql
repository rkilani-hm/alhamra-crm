-- Fix: departments table was missing INSERT/UPDATE/DELETE policies
-- Only had SELECT policy — any write by managers was blocked by RLS

-- Managers can create departments
CREATE POLICY "departments_insert"
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'manager');

-- Managers can rename/update departments
CREATE POLICY "departments_update"
  ON public.departments FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'manager');

-- Managers can delete departments
CREATE POLICY "departments_delete"
  ON public.departments FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');
