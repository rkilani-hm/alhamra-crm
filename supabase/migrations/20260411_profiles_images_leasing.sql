-- ============================================================
-- 1. Organization enhancements
--    - logo_url: profile image / company logo
--    - name_arabic: already added in 20260411_org_arabic_name.sql (IF NOT EXISTS)
--    - SAP Leasing Data group fields
-- ============================================================

-- Profile image / logo
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS name_arabic text;   -- safe duplicate: IF NOT EXISTS

-- SAP Leasing Data (future S/4HANA integration)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lease_contract_number  text,
  ADD COLUMN IF NOT EXISTS lease_rental_object    text,   -- rental object code
  ADD COLUMN IF NOT EXISTS lease_start_date       date,
  ADD COLUMN IF NOT EXISTS lease_end_date         date,
  ADD COLUMN IF NOT EXISTS lease_status           text    -- active | expired | pending
    CHECK (lease_status IN ('active','expired','pending','terminated') OR lease_status IS NULL);

-- Index for SAP lookups
CREATE INDEX IF NOT EXISTS idx_org_lease_contract  ON public.organizations(lease_contract_number);
CREATE INDEX IF NOT EXISTS idx_org_sap_bp          ON public.organizations(sap_bp_number);

-- ============================================================
-- 2. Contact enhancements
--    - avatar_url: profile photo
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ============================================================
-- 3. Supabase Storage bucket policies (run after creating buckets in dashboard)
-- Note: Create these buckets manually in Supabase Dashboard → Storage:
--   - "org-logos"      (public)
--   - "contact-avatars" (public)
-- ============================================================

-- Storage RLS is managed via dashboard — no SQL needed here.
-- These comments document the expected bucket setup.
