// local-wa-api — Proxy to Evolution API on Railway.
// The CRM frontend calls this instead of Railway directly (avoids CORS + hides API key).
// Supports: create instance, get QR, get status, send message, delete instance.
//
// Deploy: supabase functions deploy local-wa-api

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Auth — frontdesk or manager
  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['manager', 'frontdesk'].includes(profile.role))
    return json({ error: 'Insufficient permissions' }, 403);

  const RAILWAY_URL = Deno.env.get('RAILWAY_WA_URL');
  const RAILWAY_KEY = Deno.env.get('RAILWAY_WA_API_KEY');

  if (!RAILWAY_URL || !RAILWAY_KEY) {
    return json({
      error: 'Railway WhatsApp service not configured.',
      setup: 'Set RAILWAY_WA_URL and RAILWAY_WA_API_KEY in Supabase Edge Function secrets.',
    }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const { action, instanceName, data: actionData } = body;

  const evo = async (method: string, path: string, payload?: any) => {
    const res = await fetch(`${RAILWAY_URL}${path}`, {
      method,
      headers: {
        'apikey':       RAILWAY_KEY,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch { return { ok: res.ok, status: res.status, data: { raw: text } }; }
  };

  try {
    // ── Create instance ──────────────────────────────────────
    if (action === 'create_instance') {
      const { label } = actionData ?? {};
      if (!instanceName || !label) return json({ error: 'instanceName and label required' }, 400);

      // Create in Evolution API
      const r = await evo('POST', '/instance/create', {
        instanceName,
        qrcode:     true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url:    `${Deno.env.get('SUPABASE_URL')}/functions/v1/local-wa-webhook`,
          byEvents: true,
          base64:   true,
          events:   ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          headers:  { 'x-webhook-secret': Deno.env.get('LOCAL_WA_WEBHOOK_SECRET') ?? '' },
        },
      });

      // Register in CRM
      if (r.ok) {
        await supabase.from('local_wa_instances').upsert({
          instance_name: instanceName,
          label,
          state:      'connecting',
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'instance_name' });
      }

      return json({ ok: r.ok, ...r.data });
    }

    // ── Connect / get QR ─────────────────────────────────────
    if (action === 'connect') {
      const r = await evo('GET', `/instance/connect/${instanceName}`);
      if (r.ok && r.data?.base64) {
        await supabase.from('local_wa_instances').update({
          state: 'qr', qr_code: r.data.base64, qr_updated_at: new Date().toISOString(),
        }).eq('instance_name', instanceName);
      }
      return json({ ok: r.ok, ...r.data });
    }

    // ── Instance status ──────────────────────────────────────
    if (action === 'status') {
      const r = await evo('GET', `/instance/connectionState/${instanceName}`);
      return json({ ok: r.ok, ...r.data });
    }

    // ── Send text message ────────────────────────────────────
    if (action === 'send_message') {
      const { to, text } = actionData ?? {};
      if (!to || !text) return json({ error: 'to and text required' }, 400);
      const r = await evo('POST', `/message/sendText/${instanceName}`, {
        number: to,
        text,
      });
      return json({ ok: r.ok, ...r.data });
    }

    // ── List all instances ───────────────────────────────────
    if (action === 'list') {
      const r = await evo('GET', '/instance/fetchInstances');
      return json({ ok: r.ok, instances: r.data });
    }

    // ── Delete / logout instance ─────────────────────────────
    if (action === 'logout') {
      await evo('DELETE', `/instance/logout/${instanceName}`);
      await supabase.from('local_wa_instances').update({
        state: 'disconnected', qr_code: null, channel_id: null, updated_at: new Date().toISOString(),
      }).eq('instance_name', instanceName);
      return json({ ok: true });
    }

    if (action === 'delete') {
      await evo('DELETE', `/instance/delete/${instanceName}`);
      await supabase.from('local_wa_instances').delete().eq('instance_name', instanceName);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e: any) {
    console.error('local-wa-api error:', e);
    return json({ error: e.message }, 500);
  }
});
