// local-wa-api — Proxy to Evolution API on Railway.
// The CRM frontend calls this instead of Railway directly (avoids CORS + hides API key).
// Supports: create instance, get QR, get status, send message, delete instance.
//
// Deploy: supabase functions deploy local-wa-api

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helpers ──────────────────────────────────────────────────
const newReqId = () =>
  `lwa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const log = (reqId: string, level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown) => {
  const line = `[${reqId}] ${level} ${msg}`;
  if (level === 'ERROR') console.error(line, extra ?? '');
  else if (level === 'WARN') console.warn(line, extra ?? '');
  else console.log(line, extra ?? '');
};

const json = (reqId: string, d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify({ requestId: reqId, ...d }), {
    status: s,
    headers: { ...CORS, 'Content-Type': 'application/json', 'X-Request-Id': reqId },
  });

const errorJson = (
  reqId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) => {
  log(reqId, 'ERROR', `${code}: ${message}`, details);
  return json(reqId, { ok: false, error: { code, message, details } }, status);
};

serve(async (req) => {
  const reqId = newReqId();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  log(reqId, 'INFO', `${req.method} ${new URL(req.url).pathname}`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // ── Auth — frontdesk or manager ────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return errorJson(reqId, 401, 'NO_AUTH_TOKEN', 'Missing Authorization bearer token.');

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return errorJson(reqId, 401, 'INVALID_TOKEN', 'Authentication token is invalid or expired.', userErr?.message);
  }

  const { data: profile, error: profErr } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profErr) {
    return errorJson(reqId, 500, 'PROFILE_LOOKUP_FAILED', 'Could not load user profile.', profErr.message);
  }
  if (!profile || !['manager', 'frontdesk'].includes(profile.role)) {
    return errorJson(reqId, 403, 'INSUFFICIENT_ROLE',
      `Role "${profile?.role ?? 'none'}" is not permitted. Requires manager or frontdesk.`);
  }
  log(reqId, 'INFO', `auth ok user=${user.id} role=${profile.role}`);

  // ── Railway config ─────────────────────────────────────────
  const RAILWAY_URL = Deno.env.get('RAILWAY_WA_URL');
  const RAILWAY_KEY = Deno.env.get('RAILWAY_WA_API_KEY');

  if (!RAILWAY_URL || !RAILWAY_KEY) {
    return errorJson(reqId, 500, 'RAILWAY_NOT_CONFIGURED',
      'Railway WhatsApp service is not configured. Set RAILWAY_WA_URL and RAILWAY_WA_API_KEY in edge function secrets.');
  }

  // ── Parse body ─────────────────────────────────────────────
  let body: { action?: string; instanceName?: string; data?: any } = {};
  try { body = await req.json(); }
  catch (e) {
    return errorJson(reqId, 400, 'INVALID_JSON', 'Request body must be valid JSON.', String(e));
  }
  const { action, instanceName, data: actionData } = body;
  if (!action) return errorJson(reqId, 400, 'MISSING_ACTION', '`action` field is required.');
  log(reqId, 'INFO', `action=${action} instance=${instanceName ?? '-'}`);

  // ── Evolution API call wrapper ─────────────────────────────
  const evo = async (method: string, path: string, payload?: any) => {
    const url = `${RAILWAY_URL}${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: { 'apikey': RAILWAY_KEY, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const text = await res.text();
      const elapsed = Date.now() - t0;
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

      if (!res.ok) {
        log(reqId, 'WARN', `evo ${method} ${path} -> ${res.status} (${elapsed}ms)`, parsed);
      } else {
        log(reqId, 'INFO', `evo ${method} ${path} -> ${res.status} (${elapsed}ms)`);
      }
      return { ok: res.ok, status: res.status, data: parsed, elapsed };
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      log(reqId, 'ERROR', `evo ${method} ${path} fetch failed (${elapsed}ms)`, e?.message);
      return { ok: false, status: 0, data: null, elapsed, networkError: e?.message ?? String(e) };
    }
  };

  // Translate an Evolution API failure into a structured error response
  const upstreamFail = (action: string, r: Awaited<ReturnType<typeof evo>>) => {
    if (r.networkError) {
      return errorJson(reqId, 502, 'RAILWAY_UNREACHABLE',
        `Could not reach Railway Evolution API (${action}).`,
        { networkError: r.networkError, elapsedMs: r.elapsed });
    }
    const upstreamMsg =
      r.data?.response?.message ??
      r.data?.message ??
      r.data?.error ??
      `Evolution API returned HTTP ${r.status}`;
    return errorJson(reqId, 502, 'RAILWAY_UPSTREAM_ERROR',
      `Evolution API error during "${action}": ${upstreamMsg}`,
      { status: r.status, body: r.data, elapsedMs: r.elapsed });
  };

  try {
    // ── Create instance ──────────────────────────────────────
    if (action === 'create_instance') {
      const { label } = actionData ?? {};
      if (!instanceName || !label) {
        return errorJson(reqId, 400, 'MISSING_FIELDS', '`instanceName` and `data.label` are required.');
      }

      const r = await evo('POST', '/instance/create', {
        instanceName,
        qrcode:      true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url:      `${Deno.env.get('SUPABASE_URL')}/functions/v1/local-wa-webhook`,
          byEvents: true,
          base64:   true,
          events:   ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          headers:  { 'x-webhook-secret': Deno.env.get('LOCAL_WA_WEBHOOK_SECRET') ?? '' },
        },
      });
      if (!r.ok) return upstreamFail('create_instance', r);

      const { error: upsertErr } = await supabase.from('local_wa_instances').upsert({
        instance_name: instanceName,
        label,
        state:      'connecting',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'instance_name' });
      if (upsertErr) log(reqId, 'WARN', 'instance upsert failed', upsertErr.message);

      return json(reqId, { ok: true, data: r.data });
    }

    // ── Connect / get QR ─────────────────────────────────────
    if (action === 'connect') {
      if (!instanceName) return errorJson(reqId, 400, 'MISSING_FIELDS', '`instanceName` is required.');
      const r = await evo('GET', `/instance/connect/${instanceName}`);
      if (!r.ok) return upstreamFail('connect', r);

      if (r.data?.base64) {
        await supabase.from('local_wa_instances').update({
          state: 'qr', qr_code: r.data.base64, qr_updated_at: new Date().toISOString(),
        }).eq('instance_name', instanceName);
      }
      return json(reqId, { ok: true, data: r.data });
    }

    // ── Instance status ──────────────────────────────────────
    if (action === 'status') {
      if (!instanceName) return errorJson(reqId, 400, 'MISSING_FIELDS', '`instanceName` is required.');
      const r = await evo('GET', `/instance/connectionState/${instanceName}`);
      if (!r.ok) return upstreamFail('status', r);
      return json(reqId, { ok: true, data: r.data });
    }

    // ── Send text message ────────────────────────────────────
    if (action === 'send_message') {
      const { to, text } = actionData ?? {};
      if (!instanceName || !to || !text) {
        return errorJson(reqId, 400, 'MISSING_FIELDS',
          '`instanceName`, `data.to`, and `data.text` are required.');
      }
      const r = await evo('POST', `/message/sendText/${instanceName}`, { number: to, text });
      if (!r.ok) return upstreamFail('send_message', r);
      return json(reqId, { ok: true, data: r.data });
    }

    // ── List all instances ───────────────────────────────────
    if (action === 'list') {
      const r = await evo('GET', '/instance/fetchInstances');
      if (!r.ok) return upstreamFail('list', r);
      return json(reqId, { ok: true, instances: r.data });
    }

    // ── Logout instance ──────────────────────────────────────
    if (action === 'logout') {
      if (!instanceName) return errorJson(reqId, 400, 'MISSING_FIELDS', '`instanceName` is required.');
      const r = await evo('DELETE', `/instance/logout/${instanceName}`);
      if (!r.ok) return upstreamFail('logout', r);
      await supabase.from('local_wa_instances').update({
        state: 'disconnected', qr_code: null, channel_id: null, updated_at: new Date().toISOString(),
      }).eq('instance_name', instanceName);
      return json(reqId, { ok: true });
    }

    // ── Delete instance ──────────────────────────────────────
    if (action === 'delete') {
      if (!instanceName) return errorJson(reqId, 400, 'MISSING_FIELDS', '`instanceName` is required.');
      const r = await evo('DELETE', `/instance/delete/${instanceName}`);
      if (!r.ok) return upstreamFail('delete', r);
      await supabase.from('local_wa_instances').delete().eq('instance_name', instanceName);
      return json(reqId, { ok: true });
    }

    return errorJson(reqId, 400, 'UNKNOWN_ACTION', `Unknown action: "${action}"`);

  } catch (e: any) {
    return errorJson(reqId, 500, 'UNHANDLED_EXCEPTION',
      e?.message ?? 'Unexpected error in local-wa-api.', e?.stack);
  }
});
