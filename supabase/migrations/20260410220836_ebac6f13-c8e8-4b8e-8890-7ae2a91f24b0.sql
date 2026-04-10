-- Allow frontdesk/manager to update contacts
CREATE POLICY "contacts_update" ON public.contacts
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['frontdesk'::text, 'manager'::text]));

-- Allow managers to delete contacts
CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE TO authenticated
  USING (get_my_role() = 'manager'::text);