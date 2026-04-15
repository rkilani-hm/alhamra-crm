// sap-sync-bp — Pull Business Partners from SAP S/4HANA → sync to organizations table.
// Called manually from Admin > SAP or on schedule.
// Auth: manager role required (JWT).
// SAP secrets: SAP_URL, SAP_USER, SAP_PASS stored in Supabase Edge Function secrets.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Auth helper ──────────────────────────────────────────────
async function getCallerProfile(req: Request, supabase: any) {
  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
  return data;
}

// ── SAP OData fetch helper ───────────────────────────────────
async function sapGet(path: string, sapUrl: string, sapUser: string, sapPass: string) {
  const credentials = btoa(`${sapUser}:${sapPass}`);
  const url = `${sapUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Accept':        'application/json',
      'sap-client':    '100',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SAP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ── BP type → org type mapping ───────────────────────────────
const BP_CATEGORY_MAP: Record<string, string> = {
  '1': 'other',     // Person
  '2': 'tenant',    // Organization
  '3': 'other',     // Group
};

const BP_ROLE_TYPE_MAP: Record<string, string> = {
  'FLCU01': 'tenant',    // Customer
  'FLVN01': 'vendor',    // Vendor
  'RETP':   'tenant',    // Tenant (RE-FX)
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Auth check — manager only
  const profile = await getCallerProfile(req, supabase);
  if (!profile || profile.role !== 'manager') {
    return json({ error: 'Manager role required' }, 403);
  }

  // SAP connection config
  const SAP_URL  = Deno.env.get('SAP_URL');
  const SAP_USER = Deno.env.get('SAP_USER');
  const SAP_PASS = Deno.env.get('SAP_PASS');

  if (!SAP_URL || !SAP_USER || !SAP_PASS) {
    return json({ error: 'SAP credentials not configured. Set SAP_URL, SAP_USER, SAP_PASS in Edge Function secrets.' }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const { mode = 'pull', filter = '', limit = 200 } = body;

  try {
    // ── Fetch Business Partners from SAP ──────────────────────
    // GET /A_BusinessPartner?$top=200&$select=BusinessPartner,BusinessPartnerFullName...
    const params = new URLSearchParams({
      '$top':     String(limit),
      '$select':  [
        'BusinessPartner',
        'BusinessPartnerFullName',
        'BusinessPartnerCategory',
        'OrganizationBPName1',
        'OrganizationBPName2',
        'BusinessPartnerIsBlocked',
      ].join(','),
      '$format':  'json',
    });
    if (filter) params.set('$filter', filter);

    const bpData = await sapGet(
      `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?${params}`,
      SAP_URL, SAP_USER, SAP_PASS
    );

    const bps = bpData?.d?.results ?? bpData?.value ?? [];

    // ── For each BP, also pull addresses ────────────────────
    // We batch this to avoid rate limiting — fetch addresses for first 50 BPs
    const results = { synced: 0, created: 0, updated: 0, errors: [] as string[] };

    for (const bp of bps.slice(0, limit)) {
      try {
        const bpNumber = bp.BusinessPartner;
        const name     = bp.BusinessPartnerFullName || bp.OrganizationBPName1 || `BP-${bpNumber}`;

        // Fetch address separately
        let phone = null, email = null, city = null, address = null;
        try {
          const addrData = await sapGet(
            `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('${bpNumber}')/to_BusinessPartnerAddress?$select=PhoneNumber1,EmailAddress,CityName,StreetName,HouseNumber&$format=json`,
            SAP_URL, SAP_USER, SAP_PASS
          );
          const addr = (addrData?.d?.results ?? addrData?.value ?? [])[0];
          if (addr) {
            phone   = addr.PhoneNumber1 || null;
            email   = addr.EmailAddress || null;
            city    = addr.CityName     || null;
            address = [addr.StreetName, addr.HouseNumber].filter(Boolean).join(' ') || null;
          }
        } catch { /* address fetch optional */ }

        // Determine org type
        const orgType = BP_CATEGORY_MAP[bp.BusinessPartnerCategory] ?? 'other';

        // Upsert into organizations
        const orgPayload = {
          name:          name,
          sap_bp_number: bpNumber,
          phone:         phone,
          email:         email,
          city:          city,
          address:       address,
          type:          orgType,
        };

        const { data: existing } = await supabase
          .from('organizations')
          .select('id')
          .eq('sap_bp_number', bpNumber)
          .maybeSingle();

        if (existing) {
          await supabase.from('organizations').update(orgPayload).eq('id', existing.id);
          results.updated++;
        } else {
          await supabase.from('organizations').insert(orgPayload);
          results.created++;
        }
        results.synced++;

        // Log sync event
        await supabase.from('sap_sync_log').insert({
          sync_type:   'bp_pull',
          sap_id:      bpNumber,
          entity_type: 'organization',
          action:      existing ? 'updated' : 'created',
          status:      'success',
        });

      } catch (bpErr: any) {
        results.errors.push(`BP ${bp.BusinessPartner}: ${bpErr.message}`);
        await supabase.from('sap_sync_log').insert({
          sync_type:   'bp_pull',
          sap_id:      bp.BusinessPartner,
          entity_type: 'organization',
          action:      'error',
          status:      'error',
          error_msg:   bpErr.message,
        });
      }
    }

    return json({
      ok:       true,
      total:    bps.length,
      ...results,
      message:  `Synced ${results.synced} BPs: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
    });

  } catch (err: any) {
    console.error('sap-sync-bp error:', err);
    return json({ error: err.message }, 500);
  }
});
