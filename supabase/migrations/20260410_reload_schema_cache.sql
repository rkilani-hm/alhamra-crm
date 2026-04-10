-- Force PostgREST to reload its schema cache so it recognises
-- the organization_id FK on contacts that was added in the CRM migration.
-- This fixes: "Could not find the 'organizations' column of 'contacts'"

NOTIFY pgrst, 'reload schema';

-- Also ensure the FK index exists (belt + braces)
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON public.contacts(organization_id);
