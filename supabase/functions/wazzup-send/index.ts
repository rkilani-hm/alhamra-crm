// Edge Function: wazzup-send
// Sends a WhatsApp message via Wazzup24 API and stores it locally
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
    const { channelId, chatId, text, conversationId } = await req.json();

    if (!channelId || !chatId || !text || !conversationId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Send via Wazzup24
    const wazzupRes = await fetch('https://api.wazzup24.com/v3/message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        channelId,
        chatType: 'whatsapp',
        chatId,
        text,
        crmMessageId: crypto.randomUUID(), // dedupe key
      }),
    });

    const wazzupData = await wazzupRes.json().catch(() => ({}));

    if (!wazzupRes.ok) {
      throw new Error(`Wazzup24 error: ${JSON.stringify(wazzupData)}`);
    }

    // 2. Store outbound message in DB immediately
    const { data: msg, error } = await supabase.from('wa_messages').insert({
      wazzup_id:       wazzupData.messageId ?? crypto.randomUUID(),
      conversation_id: conversationId,
      direction:       'outbound',
      msg_type:        'text',
      body:            text,
      status:          'sent',
      sent_at:         new Date().toISOString(),
    }).select().single();

    if (error) throw error;

    // 3. Update conversation last message
    await supabase.from('wa_conversations').update({
      last_message:    text,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);

    return new Response(JSON.stringify({ ok: true, message: msg }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Send error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
