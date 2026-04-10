NOTIFY pgrst, 'reload schema';

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON public.contacts(organization_id);