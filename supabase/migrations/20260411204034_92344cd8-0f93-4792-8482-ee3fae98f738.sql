
-- wa_conversations: tighten INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "wa_conversations_insert" ON public.wa_conversations;
DROP POLICY IF EXISTS "wa_conversations_update" ON public.wa_conversations;
DROP POLICY IF EXISTS "wa_conversations_delete" ON public.wa_conversations;

CREATE POLICY "wa_conversations_insert" ON public.wa_conversations
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_conversations_update" ON public.wa_conversations
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_conversations_delete" ON public.wa_conversations
  FOR DELETE TO authenticated
  USING (get_my_role() = 'manager');

-- wa_messages: tighten INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "wa_messages_insert" ON public.wa_messages;
DROP POLICY IF EXISTS "wa_messages_update" ON public.wa_messages;
DROP POLICY IF EXISTS "wa_messages_delete" ON public.wa_messages;

CREATE POLICY "wa_messages_insert" ON public.wa_messages
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_messages_update" ON public.wa_messages
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('frontdesk','manager'));

CREATE POLICY "wa_messages_delete" ON public.wa_messages
  FOR DELETE TO authenticated
  USING (get_my_role() = 'manager');
