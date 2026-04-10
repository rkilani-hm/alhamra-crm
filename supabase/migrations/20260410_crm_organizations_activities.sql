-- ============================================================
-- CRM: Organizations + Activities + Contact links
-- Pipedrive-inspired data model for Al Hamra Real Estate
-- ============================================================

-- ── 1. ORGANIZATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'tenant'
                CHECK (type IN ('tenant','vendor','partner','prospect','other')),
  industry      text,
  website       text,
  email         text,
  phone         text,
  address       text,
  city          text,
  country       text DEFAULT 'Kuwait',
  -- SAP / lease data
  sap_bp_number text,
  -- Meta
  description   text,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_read" ON public.organizations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "orgs_insert" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "orgs_update" ON public.organizations
  FOR UPDATE TO authenticated USING (public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "orgs_delete" ON public.organizations
  FOR DELETE TO authenticated USING (public.get_my_role() = 'manager');

-- ── 2. Link contacts → organizations ────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

-- ── 3. ACTIVITIES ────────────────────────────────────────────
-- Every interaction type: call, meeting, whatsapp, email, visit, task, note
CREATE TABLE IF NOT EXISTS public.activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL
                  CHECK (type IN ('call','meeting','whatsapp','email','visit','task','note','case')),
  subject         text NOT NULL,
  body            text,
  -- Polymorphic links
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  case_id         uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  -- Scheduling
  scheduled_at    timestamptz,
  duration_min    integer,             -- for calls/meetings
  -- Status
  done            boolean DEFAULT false,
  done_at         timestamptz,
  outcome         text,               -- call result, meeting notes, etc.
  -- Ownership
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  -- Meta
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_read" ON public.activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "activities_insert" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "activities_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "activities_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.get_my_role() = 'manager');

-- ── 4. Indexes for performance ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_org    ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_org  ON public.activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_cont ON public.activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_case ON public.activities(case_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON public.activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_date ON public.activities(scheduled_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON public.organizations(type);

-- ── 5. Updated_at trigger for organizations ──────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS activities_updated_at ON public.activities;
CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Enable realtime ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
