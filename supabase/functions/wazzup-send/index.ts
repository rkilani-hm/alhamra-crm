// Edge Function: wazzup-send
// Sends a WhatsApp message via Wazzup24 API.
// Works for BOTH existing conversations and NEW conversations (first message).
// When conversationId is omitted, creates a new wa_conversation automatically.
//
// Deploy: supabase functions deploy wazzup-send

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
    const { channelId, chatId, text, conversationId } = body;

    if (!channelId || !chatId || !text) {
      return new Response(JSON.stringify({ error: 'channelId, chatId and text are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Resolve or create conversation ────────────────────
    let convId: string = conversationId;

    if (!convId) {
      // Upsert conversation by channelId + chatId
      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert(
          { channel_id: channelId, chat_id: chatId },
          { onConflict: 'channel_id,chat_id', ignoreDuplicates: false }
        )
        .select('id, contact_id')
        .single();

      if (convErr || !conv) throw new Error('Could not create conversation: ' + convErr?.message);
      convId = conv.id;
    }

    // ── 2. Send via Wazzup24 ──────────────────────────────────
    const wazzupRes = await fetch('https://api.wazzup24.com/v3/message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        channelId,
        chatType:     'whatsapp',
        chatId,
        text,
        crmMessageId: crypto.randomUUID(),
      }),
    });

    const wazzupData = await wazzupRes.json().catch(() => ({}));

    if (!wazzupRes.ok) {
      throw new Error(`Wazzup24 error ${wazzupRes.status}: ${JSON.stringify(wazzupData)}`);
    }

    // ── 3. Store outbound message locally ─────────────────────
    const sentAt = new Date().toISOString();
    const { data: msg, error: msgErr } = await supabase.from('wa_messages').insert({
      wazzup_id:       wazzupData.messageId ?? crypto.randomUUID(),
      conversation_id: convId,
      direction:       'outbound',
      msg_type:        'text',
      body:            text,
      status:          'sent',
      sent_at:         sentAt,
    }).select().single();

    if (msgErr) throw msgErr;

    // ── 4. Update conversation last_message ───────────────────
    await supabase.from('wa_conversations').update({
      last_message:    text,
      last_message_at: sentAt,
    }).eq('id', convId);

    return new Response(JSON.stringify({ ok: true, message: msg, conversationId: convId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Send error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
