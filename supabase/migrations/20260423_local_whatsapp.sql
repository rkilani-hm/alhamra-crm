-- ============================================================
-- Local WhatsApp Channels (Railway / Evolution API integration)
-- Extends the existing WA schema — does NOT break Wazzup24.
-- ============================================================

-- Add source column to wa_channels to distinguish Wazzup24 vs Local
ALTER TABLE public.wa_channels
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'wazzup24'
    CHECK (source IN ('wazzup24', 'local'));

-- Instance registry: tracks Evolution API instances + QR state
CREATE TABLE IF NOT EXISTS public.local_wa_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name   TEXT NOT NULL UNIQUE,   -- Evolution API instance name
  label           TEXT NOT NULL,          -- friendly label e.g. "Sales Line"
  phone           TEXT,                   -- phone once connected
  state           TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (state IN ('disconnected','connecting','qr','connected','refused','error')),
  qr_code         TEXT,                   -- base64 QR image (expires in ~60s)
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

-- Realtime so QR code updates push to CRM page immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.local_wa_instances;

-- Index for fast state lookups
CREATE INDEX IF NOT EXISTS idx_local_wa_instances_state ON public.local_wa_instances(state);

NOTIFY pgrst, 'reload schema';
