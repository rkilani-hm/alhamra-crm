// Edge Function: wazzup-sync
// Fetches connected channels from Wazzup24 and upserts into wa_channels table
// Registers webhook with BOTH subscriptions:
//   - messagesAndStatuses: true  (live messages)
//   - contactsAndDealsCreation: true (auto-create contacts/cases on first message)
//
// Deploy: supabase functions deploy wazzup-sync

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// ── Verify caller is authenticated + has required role ───────
async function verifyCallerRole(req: Request, supabase: any, allowedRoles: string[]): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, error: 'Missing authorization' };
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { ok: false, error: 'Invalid token' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !allowedRoles.includes(profile.role)) return { ok: false, error: 'Insufficient permissions' };
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // C6: Verify caller role
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const auth = await verifyCallerRole(req, supabaseAdmin, ['frontdesk', 'manager']);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }


  const apiKey   = Deno.env.get('WAZZUP_API_KEY');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Fetch channels from Wazzup24
    const channelsRes = await fetch('https://api.wazzup24.com/v3/channels', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const channelsBody = await channelsRes.json().catch(() => ({}));
    const channels: any[] = Array.isArray(channelsBody)
      ? channelsBody
      : (channelsBody.channels ?? channelsBody.data ?? []);

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

    // 3. Register webhook with BOTH subscriptions
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wazzup-webhook`;
    const webhookRes = await fetch('https://api.wazzup24.com/v3/webhooks', {
      method:  'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        webhooksUri:   webhookUrl,
        subscriptions: {
          messagesAndStatuses:     true,  // live messages + delivery status
          contactsAndDealsCreation: true, // auto-create contacts/cases on new client
        },
      }),
    });

    const webhookData = await webhookRes.json().catch(() => ({}));

    return new Response(JSON.stringify({
      ok:       true,
      channels: waChannels.length,
      webhook:  webhookUrl,
      webhookStatus: webhookRes.status,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Sync error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
