// sap-test-connection — Validates SAP credentials and returns system info.
// Used by the SAP admin panel to verify config before running syncs.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'manager') return json({ error: 'Manager role required' }, 403);

  const SAP_URL  = Deno.env.get('SAP_URL');
  const SAP_USER = Deno.env.get('SAP_USER');
  const SAP_PASS = Deno.env.get('SAP_PASS');

  const configured = !!(SAP_URL && SAP_USER && SAP_PASS);
  if (!configured) {
    return json({
      connected:   false,
      configured:  false,
      message:     'SAP credentials not set. Configure SAP_URL, SAP_USER, SAP_PASS in Supabase Edge Function secrets.',
    });
  }

  // Test connection by calling a lightweight SAP endpoint
  try {
    const credentials = btoa(`${SAP_USER}:${SAP_PASS}`);
    const start = Date.now();

    // Try the BP metadata endpoint — lightweight, no data transfer
    const res = await fetch(
      `${SAP_URL}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata`,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept':        'application/xml',
          'sap-client':    '100',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return json({
        connected:  true,
        configured: true,
        latency_ms: latencyMs,
        sap_url:    SAP_URL.replace(/\/\/.+@/, '//<hidden>@'), // mask creds in URL
        message:    `Connected to SAP S/4HANA — ${latencyMs}ms response`,
        apis: {
          business_partner: true,
          re_contract:      null,  // tested separately
        },
      });
    } else {
      return json({
        connected:   false,
        configured:  true,
        status_code: res.status,
        message:     `SAP returned HTTP ${res.status}. Check credentials and system availability.`,
      });
    }
  } catch (err: any) {
    return json({
      connected:  false,
      configured: true,
      message:    `Connection failed: ${err.message}. Check SAP_URL and network access.`,
    });
  }
});
