-- ============================================================
-- Security Hardening — Phase 1
-- Fixes: C2, C3, C4, H1, H5, M7
-- ============================================================

-- ── C2: Tighten WhatsApp write policies ─────────────────────
-- Previously: FOR ALL ... USING (true) — any authenticated user
-- Now: scoped to frontdesk + manager only

DROP POLICY IF EXISTS "wa_conversations_write" ON public.wa_conversations;
DROP POLICY IF EXISTS "wa_messages_write"      ON public.wa_messages;

-- Conversations: frontdesk/manager can write; department can only mark read
CREATE POLICY "wa_conversations_insert" ON public.wa_conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_conversations_update" ON public.wa_conversations
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_conversations_delete" ON public.wa_conversations
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');

-- Messages: frontdesk/manager only
CREATE POLICY "wa_messages_insert" ON public.wa_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_messages_update" ON public.wa_messages
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_messages_delete" ON public.wa_messages
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');

-- ── C3: Contacts insert must require role ────────────────────
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;

CREATE POLICY "contacts_insert" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('frontdesk','manager'));

-- Also add explicit delete policy (H5)
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');

-- ── C4: Case notes insert must require role ──────────────────
DROP POLICY IF EXISTS "case_notes_insert" ON public.case_notes;

CREATE POLICY "case_notes_insert" ON public.case_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('frontdesk','manager')
    OR (
      public.get_my_role() = 'department'
      AND EXISTS (
        SELECT 1 FROM public.cases c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = case_notes.case_id
          AND c.department_id = p.department_id
      )
    )
  );

-- Also add delete for case notes
CREATE POLICY "case_notes_delete" ON public.case_notes
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.get_my_role() = 'manager');

-- ── H1: Fix SECURITY DEFINER functions missing search_path ───

-- handle_new_user trigger (was missing SET search_path)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    'frontdesk'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- set_updated_at trigger (was missing SET search_path)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── H5: Explicit delete policies for orgs + activities ───────
-- (previously missing — implicit deny, but explicit is safer)

DROP POLICY IF EXISTS "orgs_delete_explicit" ON public.organizations;
-- Already exists as "orgs_delete" from earlier migration — ensure correct
DROP POLICY IF EXISTS "orgs_delete" ON public.organizations;
CREATE POLICY "orgs_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'manager');

-- Activities delete was already correct — just ensure it exists
-- (already: created_by = auth.uid() OR manager)

-- ── M7: Indexes for KPI actuals queries ──────────────────────
CREATE INDEX IF NOT EXISTS idx_cases_created_by   ON public.cases(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_dept_status  ON public.cases(department_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON public.activities(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_dir_at ON public.wa_messages(direction, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_source ON public.contacts(organization_id, source);

-- ── Audit log table (M6) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,   -- 'create' | 'update' | 'delete' | 'login' | 'permission_change'
  entity_type text NOT NULL,   -- 'contact' | 'case' | 'organization' | 'user' | 'permission'
  entity_id   uuid,
  details     jsonb,           -- before/after snapshot for updates
  ip_address  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only managers can read audit log
CREATE POLICY "audit_log_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'manager');

-- Anyone authenticated can insert (system writes)
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Nobody can update or delete audit records
-- (no UPDATE/DELETE policy = implicit deny)

CREATE INDEX IF NOT EXISTS idx_audit_log_user     ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity   ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action   ON public.audit_log(action, created_at DESC);

COMMENT ON TABLE public.audit_log IS 'Immutable audit trail — no UPDATE/DELETE allowed by RLS';
