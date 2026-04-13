-- ============================================================
-- User Authorities: granular permission system
-- ============================================================

-- 1. Permissions lookup table (all available permissions)
CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'general'
);

INSERT INTO public.permissions (key, label, description, category) VALUES
  -- Workspace
  ('can_create_cases',       'Create Cases',          'Log new inquiries from any channel',               'workspace'),
  ('can_edit_cases',         'Edit Cases',            'Update case subject, priority, status',            'workspace'),
  ('can_delete_cases',       'Delete Cases',          'Permanently remove cases',                         'workspace'),
  ('can_view_all_cases',     'View All Cases',        'See cases from other departments',                 'workspace'),
  ('can_reassign_cases',     'Reassign Cases',        'Move cases between departments/users',             'workspace'),
  -- CRM
  ('can_create_contacts',    'Create Contacts',       'Add new contacts and organizations',               'crm'),
  ('can_edit_contacts',      'Edit Contacts',         'Modify contact and organization profiles',         'crm'),
  ('can_delete_contacts',    'Delete Contacts',       'Remove contacts and organizations',                'crm'),
  ('can_import_data',        'Import Data',           'Upload Excel files to import records',             'crm'),
  ('can_export_data',        'Export Data',           'Download reports and data exports',                'crm'),
  -- Channels
  ('can_use_whatsapp',       'WhatsApp Access',       'View and send WhatsApp messages',                  'channels'),
  ('can_start_conversations','Start Conversations',   'Initiate new WhatsApp conversations',              'channels'),
  -- Reports & KPI
  ('can_view_reports',       'View Reports',          'Access the reports and KPI dashboard',             'insights'),
  ('can_view_team_kpi',      'View Team KPI',         'See KPI data for other users/departments',         'insights'),
  -- Admin
  ('can_manage_users',       'Manage Users',          'Create, edit and deactivate user accounts',        'admin'),
  ('can_manage_departments', 'Manage Departments',    'Create and edit departments',                      'admin'),
  ('can_manage_categories',  'Manage Categories',     'Edit case categories and inquiry types',           'admin'),
  ('can_manage_permissions', 'Manage Permissions',    'Grant or revoke permissions for users and depts',  'admin')
ON CONFLICT (key) DO NOTHING;

-- 2. Department-level permissions
CREATE TABLE IF NOT EXISTS public.department_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  permission    text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted       boolean NOT NULL DEFAULT true,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (department_id, permission)
);

-- 3. User-level permissions (overrides department)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted    boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, permission)
);

-- RLS
ALTER TABLE public.permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perms_read"    ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_perms_read"  ON public.department_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_perms_write" ON public.department_permissions FOR ALL    TO authenticated USING (public.get_my_role() = 'manager');
CREATE POLICY "user_perms_read"  ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_perms_write" ON public.user_permissions FOR ALL    TO authenticated USING (public.get_my_role() = 'manager');

-- ============================================================
-- KPI System
-- ============================================================

-- 4. KPI targets (set by manager per user or dept, per period)
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- scope: either user OR department (not both)
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  -- period
  period_type     text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('daily','weekly','monthly','quarterly')),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  -- KPI targets
  target_cases_created     integer,  -- cases to create in period
  target_cases_resolved    integer,  -- cases to resolve in period
  target_response_hours    numeric,  -- avg first-response within X hours
  target_resolution_hours  numeric,  -- avg resolution within X hours
  target_activities        integer,  -- activities to log in period
  target_whatsapp_replies  integer,  -- whatsapp messages to send
  -- Meta
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT kpi_scope CHECK (
    (user_id IS NOT NULL AND department_id IS NULL) OR
    (user_id IS NULL AND department_id IS NOT NULL)
  )
);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_targets_read"  ON public.kpi_targets FOR SELECT TO authenticated USING (
  public.get_my_role() = 'manager' OR user_id = auth.uid()
);
CREATE POLICY "kpi_targets_write" ON public.kpi_targets FOR ALL TO authenticated
  USING (public.get_my_role() = 'manager');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dept_perms_dept ON public.department_permissions(department_id);
CREATE INDEX IF NOT EXISTS idx_user_perms_user ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_user ON public.kpi_targets(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_dept ON public.kpi_targets(department_id, period_start);

-- ============================================================
-- Helper: get all effective permissions for current user
-- Merges dept-level + user-level (user overrides dept)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(permission text, granted boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  -- Start with department permissions
  WITH dept AS (
    SELECT dp.permission, dp.granted
    FROM department_permissions dp
    JOIN profiles p ON p.department_id = dp.department_id
    WHERE p.id = auth.uid()
  ),
  -- User-level overrides
  usr AS (
    SELECT up.permission, up.granted
    FROM user_permissions up
    WHERE up.user_id = auth.uid()
  ),
  -- Merge: user wins over dept
  merged AS (
    SELECT permission, granted FROM usr
    UNION ALL
    SELECT d.permission, d.granted FROM dept d
    WHERE d.permission NOT IN (SELECT permission FROM usr)
  )
  SELECT permission, granted FROM merged;
$$;
