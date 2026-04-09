-- 1. Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_read" ON public.departments FOR SELECT TO authenticated USING (true);

-- 2. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'frontdesk' CHECK (role IN ('frontdesk','department','manager')),
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'frontdesk');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT CHECK (source IN ('call','visit','web','whatsapp')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_read" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Cases
CREATE TABLE IF NOT EXISTS public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id),
  channel TEXT CHECK (channel IN ('call','visit','web','whatsapp')),
  subject TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new','inprogress','done')),
  department_id UUID REFERENCES public.departments(id),
  created_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  due_at TIMESTAMPTZ,
  inquiry_type TEXT CHECK (inquiry_type IN ('leasing','vendor','visitor','general')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases_read_all" ON public.cases FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('frontdesk','manager'))
  OR
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'department' AND p.department_id = cases.department_id)
);
CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('frontdesk','manager'))
);
CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('frontdesk','manager'))
  OR
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'department' AND p.department_id = cases.department_id)
);

-- 5. Case notes
CREATE TABLE IF NOT EXISTS public.case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_notes_read" ON public.case_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_notes_insert" ON public.case_notes FOR INSERT TO authenticated WITH CHECK (true);

-- 6. Case categories
CREATE TABLE IF NOT EXISTS public.case_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general' CHECK (inquiry_type IN ('leasing','vendor','visitor','general')),
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.case_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_categories_read" ON public.case_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_categories_insert" ON public.case_categories FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager'));
CREATE POLICY "case_categories_update" ON public.case_categories FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager'));
CREATE POLICY "case_categories_delete" ON public.case_categories FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager'));

-- Seed departments
INSERT INTO public.departments (name) VALUES ('Sales'), ('Operations'), ('Finance'), ('Technical Support')
ON CONFLICT DO NOTHING;

-- Seed categories
INSERT INTO public.case_categories (name, inquiry_type, sort_order) VALUES
  ('Lease Inquiry', 'leasing', 1),
  ('Contract Renewal', 'leasing', 2),
  ('Lease Termination', 'leasing', 3),
  ('Maintenance Request', 'leasing', 4),
  ('Payment Issue', 'leasing', 5),
  ('Unit Inspection', 'leasing', 6),
  ('New Vendor Registration', 'vendor', 1),
  ('Service Proposal', 'vendor', 2),
  ('Contract Discussion', 'vendor', 3),
  ('Invoice/Payment', 'vendor', 4),
  ('Walk-in Visit', 'visitor', 1),
  ('Scheduled Meeting', 'visitor', 2),
  ('Delivery/Courier', 'visitor', 3),
  ('General Inquiry', 'general', 1),
  ('Complaint', 'general', 2),
  ('Other', 'general', 3)
ON CONFLICT DO NOTHING;