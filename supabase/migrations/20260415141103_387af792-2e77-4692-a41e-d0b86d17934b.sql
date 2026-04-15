CREATE TABLE public.sap_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  sap_id text,
  entity_type text,
  action text,
  status text,
  error_msg text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.sap_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sap_sync_log_read" ON public.sap_sync_log
  FOR SELECT TO authenticated
  USING (get_my_role() = 'manager');

CREATE POLICY "sap_sync_log_insert" ON public.sap_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'manager');

-- Allow service_role (edge functions) full access by default since RLS is bypassed for service_role