
-- 1. Organization enhancements
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS name_arabic text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lease_contract_number  text,
  ADD COLUMN IF NOT EXISTS lease_rental_object    text,
  ADD COLUMN IF NOT EXISTS lease_start_date       date,
  ADD COLUMN IF NOT EXISTS lease_end_date         date,
  ADD COLUMN IF NOT EXISTS lease_status           text;

-- Validation trigger for lease_status instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_lease_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.lease_status IS NOT NULL AND NEW.lease_status NOT IN ('active','expired','pending','terminated') THEN
    RAISE EXCEPTION 'Invalid lease_status: %', NEW.lease_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_lease_status ON public.organizations;
CREATE TRIGGER trg_validate_lease_status
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.validate_lease_status();

CREATE INDEX IF NOT EXISTS idx_org_lease_contract ON public.organizations(lease_contract_number);
CREATE INDEX IF NOT EXISTS idx_org_sap_bp ON public.organizations(sap_bp_number);

-- 2. Contact avatar
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 3. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('org-logos', 'org-logos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('contact-avatars', 'contact-avatars', true) ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "org_logos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'org-logos');
CREATE POLICY "org_logos_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
CREATE POLICY "org_logos_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
CREATE POLICY "org_logos_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'org-logos' AND auth.role() = 'authenticated');

CREATE POLICY "contact_avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'contact-avatars');
CREATE POLICY "contact_avatars_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'contact-avatars' AND auth.role() = 'authenticated');
CREATE POLICY "contact_avatars_auth_update" ON storage.objects FOR UPDATE USING (bucket_id = 'contact-avatars' AND auth.role() = 'authenticated');
CREATE POLICY "contact_avatars_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'contact-avatars' AND auth.role() = 'authenticated');

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
