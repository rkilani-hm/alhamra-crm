// sap-sync-leases — Pull RE-FX lease contracts from SAP → update org lease fields.
// Maps: SAP Rental Agreement → Organization (lease_contract_number, dates, status).

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

async function sapGet(path: string, url: string, user: string, pass: string) {
  const res = await fetch(`${url}${path}`, {
    headers: {
      'Authorization': `Basic ${btoa(`${user}:${pass}`)}`,
      'Accept':        'application/json',
      'sap-client':    '100',
    },
  });
  if (!res.ok) throw new Error(`SAP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// SAP RE-FX contract status → CRM lease_status
const statusMap = (sapStatus: string): string => {
  const s = (sapStatus ?? '').toUpperCase();
  if (['3', 'ACTIVE', 'ACT'].includes(s))     return 'active';
  if (['6', 'EXPIRED', 'EXP'].includes(s))    return 'expired';
  if (['1', '2', 'PENDING', 'PND'].includes(s)) return 'pending';
  if (['9', 'TERMINATED', 'TRM'].includes(s)) return 'terminated';
  return 'active';
};

// Parse SAP date: /Date(1700000000000)/ or 2024-01-15
const parseDate = (d: string | null): string | null => {
  if (!d) return null;
  const m = d.match(/\/Date\((\d+)\)\//);
  if (m) return new Date(parseInt(m[1])).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
};

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
    return json({ error: 'SAP credentials not configured (SAP_URL, SAP_USER, SAP_PASS)' }, 400);

  const body  = await req.json().catch(() => ({}));
  const limit = body.limit ?? 500;

  try {
    // ── Pull Rental Agreements from SAP RE-FX ──────────────
    // Standard API: /sap/opu/odata/sap/API_RE_CONTRACT/A_Contract
    // Fields: ContractNumber, TenantBPNumber, RentalObjectNumber,
    //         ValidFrom, ValidTo, ContractStatus, MonthlyRent, Currency
    const params = new URLSearchParams({
      '$top':    String(limit),
      '$select': 'ContractNumber,TenantBPNumber,RentalObjectNumber,ValidFrom,ValidTo,ContractStatus,ContractType',
      '$format': 'json',
    });

    let contracts: any[] = [];
    try {
      const data = await sapGet(
        `/sap/opu/odata/sap/API_RE_CONTRACT/A_Contract?${params}`,
        SAP_URL, SAP_USER, SAP_PASS
      );
      contracts = data?.d?.results ?? data?.value ?? [];
    } catch {
      // Fallback: try older RE-FX endpoint
      try {
        const data2 = await sapGet(
          `/sap/opu/odata/sap/RECONTRACT_SRV/ContractSet?${params}`,
          SAP_URL, SAP_USER, SAP_PASS
        );
        contracts = data2?.d?.results ?? data2?.value ?? [];
      } catch (e2: any) {
        return json({ error: 'Could not reach SAP RE-FX API: ' + e2.message }, 502);
      }
    }

    const results = { synced: 0, matched: 0, unmatched: 0, errors: [] as string[] };

    for (const contract of contracts) {
      try {
        const contractNum  = contract.ContractNumber;
        const bpNumber     = contract.TenantBPNumber;
        const rentalObject = contract.RentalObjectNumber;
        const validFrom    = parseDate(contract.ValidFrom);
        const validTo      = parseDate(contract.ValidTo);
        const leaseStatus  = statusMap(contract.ContractStatus);

        // Find matching org by SAP BP number
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('sap_bp_number', bpNumber)
          .maybeSingle();

        if (!org) {
          results.unmatched++;
          continue;
        }

        // Update lease fields on the organization
        await supabase.from('organizations').update({
          lease_contract_number: contractNum,
          lease_rental_object:   rentalObject,
          lease_start_date:      validFrom,
          lease_end_date:        validTo,
          lease_status:          leaseStatus,
        }).eq('id', org.id);

        results.matched++;
        results.synced++;

        await supabase.from('sap_sync_log').insert({
          sync_type:   'lease_pull',
          sap_id:      contractNum,
          entity_type: 'lease',
          action:      'updated',
          status:      'success',
          notes:       `BP ${bpNumber} → Org ${org.id}`,
        });

      } catch (e: any) {
        results.errors.push(`Contract ${contract.ContractNumber}: ${e.message}`);
      }
    }

    return json({
      ok:       true,
      total:    contracts.length,
      ...results,
      message:  `${contracts.length} contracts fetched: ${results.matched} matched to orgs, ${results.unmatched} no match`,
    });

  } catch (err: any) {
    console.error('sap-sync-leases error:', err);
    return json({ error: err.message }, 500);
  }
});
