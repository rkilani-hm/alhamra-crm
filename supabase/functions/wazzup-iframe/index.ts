// Supabase Edge Function: wazzup-iframe
// Generates a Wazzup24 iFrame URL for embedding the chat window
// Called by the frontend WhatsApp page
// Deploy: supabase functions deploy wazzup-iframe
// Secret: supabase secrets set WAZZUP_API_KEY=036cd96a1db3412d89723ed34675ba2b

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    if (!apiKey) throw new Error('WAZZUP_API_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const { chatId, chatType = 'whatsapp', channelId } = body;

    // Build iframe request payload
    const payload: any = { urlType: 'simple' };
    if (chatId && channelId) {
      // Open a specific chat
      payload.chatType  = chatType;
      payload.chatId    = chatId;
      payload.channelId = channelId;
    }

    const res = await fetch('https://api.wazzup24.com/v3/iframe', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wazzup24 API error ${res.status}: ${text}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify({ url: data.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
