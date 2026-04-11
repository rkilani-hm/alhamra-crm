-- ============================================================
-- Wazzup24 bidirectional integration support
-- ============================================================

-- 1. Track which contacts have been pushed to Wazzup24
--    (Wazzup stores our contact UUID as their internal ID)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wazzup_synced_at timestamptz;

-- 2. Track cases pushed to Wazzup24 as "deals"
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS wazzup_deal_id text;  -- Wazzup uses our case UUID

-- 3. Index for fast webhook lookup by phone
CREATE INDEX IF NOT EXISTS idx_contacts_phone_clean
  ON public.contacts (replace(replace(phone, '+', ''), ' ', ''));

-- 4. Add CRM_BASE_URL to edge function env (hardcoded in functions for now)
-- No SQL needed — set in Supabase dashboard Edge Functions secrets

-- 5. Update wa_conversations to track Wazzup deal ID (case link)
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS wazzup_deal_id text;
