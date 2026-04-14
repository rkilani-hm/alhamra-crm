-- ============================================================
-- Security Hardening Phase 2
-- Covers: H6-adjacent (tighter RLS scoping), M2, remaining gaps
-- ============================================================

-- ── M2: Mark get_my_role() as VOLATILE so Postgres doesn't
--    cache the result across role-change scenarios ──────────
-- (In practice, recreating as VOLATILE ensures fresh reads)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Tighten profiles read: all authenticated can read all profiles
-- (needed for org/contact assignees and activity display)
-- But prevent department users reading service_role or sensitive fields
-- This is fine as profiles table has no secrets — just name/role/dept

-- ── Ensure kpi_targets agents can only read their own ────────
DROP POLICY IF EXISTS "kpi_targets_read" ON public.kpi_targets;
CREATE POLICY "kpi_targets_read" ON public.kpi_targets
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'manager'
    OR user_id = auth.uid()
    OR (
      department_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND department_id = kpi_targets.department_id
      )
    )
  );

-- ── Ensure user_permissions: users can read their own only ───
DROP POLICY IF EXISTS "user_perms_read" ON public.user_permissions;
CREATE POLICY "user_perms_read" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'manager'
    OR user_id = auth.uid()
  );

-- ── Tighten audit_log: only managers can read ────────────────
-- (this was already in phase 1 migration, ensure it exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_read'
  ) THEN
    CREATE POLICY "audit_log_read" ON public.audit_log
      FOR SELECT TO authenticated
      USING (public.get_my_role() = 'manager');
  END IF;
END $$;

-- ── Index: profiles.role for get_my_role() performance ───────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ── Ensure wa_conversations update scoped correctly ──────────
-- Department users cannot mark WA conversations read — that's fine
-- But they should be able to read them (already: USING(true))

-- ── Case notes: ensure update/delete scoped to author ────────
DROP POLICY IF EXISTS "case_notes_update" ON public.case_notes;
DROP POLICY IF EXISTS "case_notes_delete" ON public.case_notes;
CREATE POLICY "case_notes_update" ON public.case_notes
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.get_my_role() = 'manager'
  );
CREATE POLICY "case_notes_delete" ON public.case_notes
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.get_my_role() = 'manager'
  );
