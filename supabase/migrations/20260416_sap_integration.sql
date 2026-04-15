-- ============================================================
-- SAP S/4HANA Integration Tables
-- ============================================================

-- Sync log: every SAP operation is recorded here
CREATE TABLE IF NOT EXISTS public.sap_sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type   text NOT NULL,    -- bp_pull | lease_pull | bp_push | contact_pull
  sap_id      text,             -- SAP BP number or contract number
  entity_type text NOT NULL,    -- organization | lease | contact
  action      text NOT NULL,    -- created | updated | error
  status      text NOT NULL DEFAULT 'success',
  error_msg   text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.sap_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sap_log_read"   ON public.sap_sync_log FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('manager', 'frontdesk'));
CREATE POLICY "sap_log_insert" ON public.sap_sync_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sap_log_type      ON public.sap_sync_log(sync_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sap_log_status    ON public.sap_sync_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sap_log_sap_id    ON public.sap_sync_log(sap_id);

-- Ensure org table has all SAP fields (idempotent)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lease_contract_number text,
  ADD COLUMN IF NOT EXISTS lease_rental_object   text,
  ADD COLUMN IF NOT EXISTS lease_start_date      date,
  ADD COLUMN IF NOT EXISTS lease_end_date        date,
  ADD COLUMN IF NOT EXISTS lease_status          text CHECK (
    lease_status IS NULL OR lease_status IN ('active','expired','pending','terminated')
  ),
  ADD COLUMN IF NOT EXISTS sap_last_synced_at    timestamptz;

-- Index for SAP BP lookups
CREATE INDEX IF NOT EXISTS idx_orgs_sap_bp ON public.organizations(sap_bp_number)
  WHERE sap_bp_number IS NOT NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
