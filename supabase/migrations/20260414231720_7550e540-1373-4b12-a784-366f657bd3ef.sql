-- Add 'photo_shoot' and 'prospect' inquiry types
ALTER TABLE public.case_categories
  DROP CONSTRAINT IF EXISTS case_categories_inquiry_type_check;

ALTER TABLE public.case_categories
  ADD CONSTRAINT case_categories_inquiry_type_check
  CHECK (inquiry_type IN ('leasing','vendor','visitor','general','prospect','event'));

ALTER TABLE public.cases
  DROP CONSTRAINT IF EXISTS cases_inquiry_type_check;

ALTER TABLE public.cases
  ADD CONSTRAINT cases_inquiry_type_check
  CHECK (inquiry_type IN ('leasing','vendor','visitor','general','prospect','event'));

-- New categories for prospect tenants
INSERT INTO public.case_categories (name, inquiry_type, sort_order) VALUES
  ('Leasing Enquiry',        'prospect', 1),
  ('Unit Viewing Request',   'prospect', 2),
  ('Pricing Information',    'prospect', 3),
  ('Floor Plan Request',     'prospect', 4),
  ('Photo / Film Shoot',     'event',    1),
  ('Corporate Event',        'event',    2),
  ('Press / Media Visit',    'event',    3),
  ('Product Launch',         'event',    4),
  ('Other Event',            'event',    5)
ON CONFLICT DO NOTHING;

-- Department routing table
CREATE TABLE IF NOT EXISTS public.intake_routing (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type  text NOT NULL UNIQUE,
  department_name text NOT NULL,
  default_priority text NOT NULL DEFAULT 'normal',
  auto_assign   boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.intake_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routing_read" ON public.intake_routing FOR SELECT USING (true);
CREATE POLICY "routing_write" ON public.intake_routing FOR ALL
  TO authenticated USING (public.get_my_role() = 'manager');

INSERT INTO public.intake_routing (inquiry_type, department_name, default_priority) VALUES
  ('leasing',   'Facilities Management', 'normal'),
  ('prospect',  'Leasing',               'normal'),
  ('vendor',    'Procurement',           'normal'),
  ('visitor',   'Front Desk',            'normal'),
  ('event',     'Operations',            'normal'),
  ('general',   'Front Desk',            'normal')
ON CONFLICT (inquiry_type) DO NOTHING;

-- Web form submissions table
CREATE TABLE IF NOT EXISTS public.web_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type  text NOT NULL,
  form_data     jsonb NOT NULL,
  case_id       uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ip_address    text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.web_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_read"   ON public.web_submissions FOR SELECT TO authenticated USING (public.get_my_role() = 'manager');
CREATE POLICY "submissions_insert" ON public.web_submissions FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_web_submissions_created ON public.web_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_submissions_type    ON public.web_submissions(inquiry_type);

NOTIFY pgrst, 'reload schema';