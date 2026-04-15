-- Ensure all contact columns are present (idempotent)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS client_type   text CHECK (client_type IN ('existing_tenant','potential','vendor','visitor')),
  ADD COLUMN IF NOT EXISTS sap_bp_number text,
  ADD COLUMN IF NOT EXISTS unit          text,
  ADD COLUMN IF NOT EXISTS floor         text,
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS company_name  text,
  ADD COLUMN IF NOT EXISTS vendor_type   text,
  ADD COLUMN IF NOT EXISTS id_number     text,
  ADD COLUMN IF NOT EXISTS host_name     text,
  ADD COLUMN IF NOT EXISTS visit_purpose text;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';