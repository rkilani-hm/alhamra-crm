-- ============================================================
-- Alhamra CRM — WhatsApp / Wazzup24 Integration
-- ============================================================

-- 1. Channels (the 4 WhatsApp numbers from Wazzup24)
CREATE TABLE IF NOT EXISTS public.wa_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    TEXT NOT NULL UNIQUE,   -- Wazzup24 channelId (UUID)
  phone         TEXT NOT NULL,           -- plainId e.g. "96522270222"
  label         TEXT,                    -- friendly name e.g. "Leasing Line"
  transport     TEXT DEFAULT 'whatsapp',
  state         TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Conversations (one per contact per channel)
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      TEXT NOT NULL REFERENCES public.wa_channels(channel_id),
  chat_id         TEXT NOT NULL,          -- customer's phone number
  contact_id      UUID REFERENCES public.contacts(id),
  case_id         UUID REFERENCES public.cases(id),
  assigned_to     UUID REFERENCES public.profiles(id),
  unread_count    INT DEFAULT 0,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, chat_id)
);

-- 3. Messages
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wazzup_id       TEXT UNIQUE,            -- Wazzup24 messageId
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  msg_type        TEXT DEFAULT 'text',    -- text, image, document, audio, video
  body            TEXT,
  media_url       TEXT,
  sender_name     TEXT,
  status          TEXT DEFAULT 'sent',    -- sent, delivered, read, failed
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS wa_conversations_contact_idx  ON public.wa_conversations(contact_id);
CREATE INDEX IF NOT EXISTS wa_conversations_channel_idx  ON public.wa_conversations(channel_id);
CREATE INDEX IF NOT EXISTS wa_messages_conversation_idx  ON public.wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS wa_messages_sent_at_idx       ON public.wa_messages(sent_at DESC);

-- RLS
ALTER TABLE public.wa_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_channels_read"      ON public.wa_channels      FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_channels_write"     ON public.wa_channels      FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

CREATE POLICY "wa_conversations_read" ON public.wa_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_conversations_write"ON public.wa_conversations FOR ALL    TO authenticated USING (true);

CREATE POLICY "wa_messages_read"      ON public.wa_messages      FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_messages_write"     ON public.wa_messages      FOR ALL    TO authenticated USING (true);

-- Enable Realtime for live inbox updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;

-- Seed channels (update channel_id and phone after running GET /v3/channels)
-- These will be auto-populated by the wazzup-sync edge function on first run
-- INSERT INTO public.wa_channels (channel_id, phone, label) VALUES
--   ('your-channel-uuid-1', '96522270222', 'Leasing Line'),
--   ('your-channel-uuid-2', '96522270200', 'Main Reception'),
--   ('your-channel-uuid-3', '96522270201', 'Corporate'),
--   ('your-channel-uuid-4', '96522233043', 'Helpdesk 24/7');
