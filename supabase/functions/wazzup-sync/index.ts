// Supabase Edge Function: wazzup-sync
// Fetches connected channels from Wazzup24 and upserts into wa_channels table
// Also registers the webhook URL with Wazzup24
// Run once after deploying: call via Supabase dashboard or curl
// Deploy: supabase functions deploy wazzup-sync

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey   = Deno.env.get('WAZZUP_API_KEY');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Fetch channels
    const channelsRes = await fetch('https://api.wazzup24.com/v3/channels', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const channelsBody = await channelsRes.json();
    const channels: any[] = Array.isArray(channelsBody) ? channelsBody : (channelsBody.channels ?? channelsBody.data ?? []);
    console.log('Wazzup channels response:', JSON.stringify(channelsBody).slice(0, 500));

    // 2. Upsert into wa_channels
    const waChannels = channels
      .filter(c => c.transport === 'whatsapp')
      .map(c => ({
        channel_id: c.channelId,
        phone:      c.plainId,
        transport:  c.transport,
        state:      c.state,
        label:      c.name ?? c.plainId,
      }));

    if (waChannels.length) {
      await supabase.from('wa_channels').upsert(waChannels, { onConflict: 'channel_id' });
    }

    // 3. Register webhook URL
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wazzup-webhook`;
    await fetch('https://api.wazzup24.com/v3/webhooks', {
      method:  'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        webhooksUri:   webhookUrl,
        subscriptions: { messagesAndStatuses: true },
      }),
    });

    return new Response(JSON.stringify({
      ok:       true,
      channels: waChannels.length,
      webhook:  webhookUrl,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
