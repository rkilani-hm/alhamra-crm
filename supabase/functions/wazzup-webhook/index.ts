// Supabase Edge Function: wazzup-webhook
// Receives inbound messages from Wazzup24 and stores them in Supabase
// Register URL in Wazzup24: PATCH https://api.wazzup24.com/v3/webhooks
//   { "webhooksUri": "https://hvhggfieaykcrlqxumeh.supabase.co/functions/v1/wazzup-webhook",
//     "subscriptions": { "messagesAndStatuses": true } }
//
// Deploy: supabase functions deploy wazzup-webhook --no-verify-jwt
// Secret:  supabase secrets set WAZZUP_API_KEY=036cd96a1db3412d89723ed34675ba2b

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();

    // Wazzup sends { test: true } when first registering — respond 200
    if (body.test) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Process incoming messages ──────────────────────────────
    const messages: any[] = body.messages ?? [];

    for (const msg of messages) {
      const {
        messageId, channelId, chatId, chatType,
        type, text, contentUri, isEcho,
        dateTime, contact, status,
      } = msg;

      if (chatType !== 'whatsapp') continue; // WhatsApp only for now

      // 1. Upsert conversation
      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert(
          { channel_id: channelId, chat_id: chatId },
          { onConflict: 'channel_id,chat_id', ignoreDuplicates: false }
        )
        .select('id, contact_id, unread_count')
        .single();

      if (convErr || !conv) {
        console.error('Conversation upsert failed:', convErr);
        continue;
      }

      // 2. Auto-match contact by phone number
      if (!conv.contact_id) {
        const cleanPhone = chatId.replace(/\D/g, '');
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
          .maybeSingle();

        if (existingContact) {
          await supabase
            .from('wa_conversations')
            .update({ contact_id: existingContact.id })
            .eq('id', conv.id);
        }
      }

      // 3. Store message
      const direction = isEcho ? 'outbound' : 'inbound';
      await supabase.from('wa_messages').upsert(
        {
          wazzup_id:       messageId,
          conversation_id: conv.id,
          direction,
          msg_type:        type ?? 'text',
          body:            text ?? null,
          media_url:       contentUri ?? null,
          sender_name:     contact?.name ?? chatId,
          status:          status ?? 'sent',
          sent_at:         dateTime ?? new Date().toISOString(),
        },
        { onConflict: 'wazzup_id', ignoreDuplicates: true }
      );

      // 4. Update conversation last_message + unread count
      if (!isEcho) {
        await supabase.from('wa_conversations').update({
          last_message:    text ?? `[${type}]`,
          last_message_at: dateTime ?? new Date().toISOString(),
          unread_count:    (conv.unread_count ?? 0) + 1,
        }).eq('id', conv.id);
      }
    }

    // ── Process message status updates ────────────────────────
    const statuses: any[] = body.statuses ?? [];
    for (const s of statuses) {
      await supabase
        .from('wa_messages')
        .update({ status: s.status })
        .eq('wazzup_id', s.messageId);
    }

    return new Response(JSON.stringify({ ok: true, processed: messages.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
