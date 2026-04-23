ALTER TABLE public.wa_channels
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'wazzup24'
    CHECK (source IN ('wazzup24', 'local'));

CREATE TABLE IF NOT EXISTS public.local_wa_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name   TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  phone           TEXT,
  state           TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (state IN ('disconnected','connecting','qr','connected','refused','error')),
  qr_code         TEXT,
  qr_updated_at   TIMESTAMPTZ,
  connected_at    TIMESTAMPTZ,
  channel_id      TEXT REFERENCES public.wa_channels(channel_id),
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.local_wa_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "local_wa_instances_read"
  ON public.local_wa_instances FOR SELECT TO authenticated USING (true);

CREATE POLICY "local_wa_instances_manage"
  ON public.local_wa_instances FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('manager', 'frontdesk'))
  WITH CHECK (public.get_my_role() IN ('manager', 'frontdesk'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.local_wa_instances;

CREATE INDEX IF NOT EXISTS idx_local_wa_instances_state ON public.local_wa_instances(state);

NOTIFY pgrst, 'reload schema';