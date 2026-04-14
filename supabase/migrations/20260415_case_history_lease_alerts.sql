-- ============================================================
-- Case status history / audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  field      text NOT NULL,   -- 'status' | 'priority' | 'department_id' | 'created'
  old_value  text,
  new_value  text NOT NULL,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE public.case_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_history_read" ON public.case_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_history_insert" ON public.case_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_case_history_case ON public.case_history(case_id, changed_at DESC);

-- Trigger: log status/priority changes automatically
CREATE OR REPLACE FUNCTION public.log_case_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.case_history(case_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.case_history(case_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority);
  END IF;
  IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
    INSERT INTO public.case_history(case_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'department_id',
            OLD.department_id::text, NEW.department_id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_case_updated ON public.cases;
CREATE TRIGGER on_case_updated
  AFTER UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.log_case_changes();

-- ============================================================
-- Lease expiry alerts view
-- Returns orgs whose lease expires in next 90 days
-- ============================================================
CREATE OR REPLACE VIEW public.lease_expiry_alerts AS
SELECT
  o.id,
  o.name,
  o.name_arabic,
  o.sap_bp_number,
  o.lease_contract_number,
  o.lease_rental_object,
  o.lease_start_date,
  o.lease_end_date,
  o.lease_status,
  o.phone,
  o.email,
  (o.lease_end_date - CURRENT_DATE) AS days_remaining,
  CASE
    WHEN (o.lease_end_date - CURRENT_DATE) <= 30  THEN 'critical'
    WHEN (o.lease_end_date - CURRENT_DATE) <= 60  THEN 'warning'
    WHEN (o.lease_end_date - CURRENT_DATE) <= 90  THEN 'upcoming'
    ELSE 'ok'
  END AS alert_level
FROM public.organizations o
WHERE
  o.lease_end_date IS NOT NULL
  AND o.lease_status = 'active'
  AND o.lease_end_date >= CURRENT_DATE
  AND o.lease_end_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY o.lease_end_date ASC;
