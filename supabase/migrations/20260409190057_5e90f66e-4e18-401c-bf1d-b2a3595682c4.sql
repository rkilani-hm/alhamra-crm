
-- 1. Channels
CREATE TABLE IF NOT EXISTS public.wa_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  label         TEXT,
  transport     TEXT DEFAULT 'whatsapp',
  state         TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      TEXT NOT NULL REFERENCES public.wa_channels(channel_id),
  chat_id         TEXT NOT NULL,
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
  wazzup_id       TEXT UNIQUE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  msg_type        TEXT DEFAULT 'text',
  body            TEXT,
  media_url       TEXT,
  sender_name     TEXT,
  status          TEXT DEFAULT 'sent',
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
CREATE POLICY "wa_channels_manage"    ON public.wa_channels      FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

CREATE POLICY "wa_conversations_read" ON public.wa_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_conversations_insert" ON public.wa_conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wa_conversations_update" ON public.wa_conversations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wa_conversations_delete" ON public.wa_conversations FOR DELETE TO authenticated USING (true);

CREATE POLICY "wa_messages_read"      ON public.wa_messages      FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_messages_insert"    ON public.wa_messages      FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wa_messages_update"    ON public.wa_messages      FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wa_messages_delete"    ON public.wa_messages      FOR DELETE TO authenticated USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
