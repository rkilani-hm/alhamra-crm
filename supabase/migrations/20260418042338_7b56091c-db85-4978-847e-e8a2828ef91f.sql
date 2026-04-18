CREATE TABLE IF NOT EXISTS public.sla_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type    text NOT NULL UNIQUE,
  target_hours    integer NOT NULL DEFAULT 24,
  warning_hours   integer NOT NULL DEFAULT 20,
  is_active       boolean NOT NULL DEFAULT true,
  updated_by      uuid REFERENCES public.profiles(id),
  updated_at      timestamptz DEFAULT now()
);

INSERT INTO public.sla_config (inquiry_type, target_hours, warning_hours) VALUES
  ('leasing',  24, 20),
  ('vendor',   48, 40),
  ('visitor',  4,  3),
  ('general',  24, 20),
  ('prospect', 48, 40),
  ('event',    72, 60)
ON CONFLICT (inquiry_type) DO NOTHING;

ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_read"   ON public.sla_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla_manage" ON public.sla_config FOR ALL    TO authenticated
  USING (public.get_my_role() = 'manager')
  WITH CHECK (public.get_my_role() = 'manager');

NOTIFY pgrst, 'reload schema';