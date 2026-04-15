// sap-push-bp — Create or update a Business Partner in SAP S/4HANA from CRM organization.
// Called when manager clicks "Push to SAP" on org detail page.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function getCallerProfile(req: Request, sb: any) {
  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return null;
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  const { data } = await sb.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
  return data;
}

async function sapRequest(method: string, path: string, body: unknown, url: string, user: string, pass: string) {
  // SAP OData requires a CSRF token for POST/PATCH
  // Step 1: Fetch CSRF token
  const tokenRes = await fetch(`${url}/sap/opu/odata/sap/API_BUSINESS_PARTNER/`, {
    headers: {
      'Authorization': `Basic ${btoa(`${user}:${pass}`)}`,
      'X-CSRF-Token':  'Fetch',
      'Accept':        'application/json',
    },
  });
  const csrfToken = tokenRes.headers.get('x-csrf-token') ?? '';
  const cookies   = tokenRes.headers.get('set-cookie') ?? '';

  // Step 2: Make actual request
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${btoa(`${user}:${pass}`)}`,
      'X-CSRF-Token':  csrfToken,
      'Cookie':        cookies,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SAP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const profile = await getCallerProfile(req, supabase);
  if (!profile || profile.role !== 'manager') return json({ error: 'Manager role required' }, 403);

  const SAP_URL  = Deno.env.get('SAP_URL');
  const SAP_USER = Deno.env.get('SAP_USER');
  const SAP_PASS = Deno.env.get('SAP_PASS');
  if (!SAP_URL || !SAP_USER || !SAP_PASS)
    return json({ error: 'SAP credentials not configured' }, 400);

  const body = await req.json().catch(() => ({}));
  const { org_id } = body;
  if (!org_id) return json({ error: 'org_id required' }, 400);

  try {
    // Fetch org from CRM
    const { data: org, error: orgErr } = await supabase
      .from('organizations').select('*').eq('id', org_id).single();
    if (orgErr || !org) return json({ error: 'Organization not found' }, 404);

    let bpNumber = org.sap_bp_number;
    let action   = 'created';

    if (bpNumber) {
      // ── UPDATE existing BP ──────────────────────────────
      action = 'updated';
      await sapRequest(
        'PATCH',
        `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('${bpNumber}')`,
        {
          BusinessPartnerFullName: org.name,
          SearchTerm1:             org.name.slice(0, 20),
        },
        SAP_URL, SAP_USER, SAP_PASS
      );

      // Update address if we have one
      if (org.phone || org.email) {
        try {
          await sapRequest('PATCH',
            `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('${bpNumber}')/to_BusinessPartnerAddress`,
            {
              PhoneNumber1:  org.phone ?? undefined,
              EmailAddress:  org.email ?? undefined,
            },
            SAP_URL, SAP_USER, SAP_PASS
          );
        } catch { /* address update optional */ }
      }

    } else {
      // ── CREATE new BP ──────────────────────────────────
      const createPayload = {
        BusinessPartnerCategory: '2',          // Organization
        BusinessPartnerGrouping: '0001',        // Standard grouping
        BusinessPartnerFullName: org.name,
        OrganizationBPName1:     org.name,
        SearchTerm1:             org.name.slice(0, 20).toUpperCase(),
        to_BusinessPartnerRole: {
          results: [{ BusinessPartnerRole: 'FLCU01' }],  // Customer role
        },
        to_BusinessPartnerAddress: {
          results: [{
            Country:      'KW',
            Language:     'EN',
            PhoneNumber1:  org.phone ?? undefined,
            EmailAddress:  org.email ?? undefined,
            CityName:      org.city  ?? 'Kuwait City',
          }],
        },
      };

      const created = await sapRequest(
        'POST',
        `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner`,
        createPayload,
        SAP_URL, SAP_USER, SAP_PASS
      );

      bpNumber = created?.d?.BusinessPartner ?? created?.BusinessPartner;

      if (bpNumber) {
        // Store BP number back in CRM
        await supabase.from('organizations').update({ sap_bp_number: bpNumber }).eq('id', org_id);
      }
    }

    // Log
    await supabase.from('sap_sync_log').insert({
      sync_type:   'bp_push',
      sap_id:      bpNumber,
      entity_type: 'organization',
      action,
      status:      'success',
      notes:       `CRM org ${org_id} → SAP BP ${bpNumber}`,
    });

    return json({ ok: true, action, bp_number: bpNumber, org_id });

  } catch (err: any) {
    console.error('sap-push-bp error:', err);
    await supabase.from('sap_sync_log').insert({
      sync_type:   'bp_push',
      entity_type: 'organization',
      action:      'error',
      status:      'error',
      error_msg:   err.message,
      notes:       `org_id: ${org_id}`,
    });
    return json({ error: err.message }, 500);
  }
});
