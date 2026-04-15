// sap-ingest — Receives SAP data from on-premise agent and writes to database.
// The agent cannot use service_role directly, so this function acts as a
// secure proxy: it holds the service_role key server-side and validates
// a shared secret (SAP_INGEST_SECRET) from the agent.
//
// Deploy: supabase functions deploy sap-ingest --no-verify-jwt
// Secret: set SAP_INGEST_SECRET in Supabase → Edge Function secrets

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',  // agent calls from LAN — allow any origin
  'Access-Control-Allow-Headers': 'content-type, x-sap-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Helpers ─────────────────────────────────────────────────
function parseDate(d: string | null): string | null {
  if (!d) return null;
  const m = String(d).match(/\/Date\((\d+)\)\//);
  if (m)  return new Date(parseInt(m[1])).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
  return null;
}
function mapLeaseStatus(s: string): string {
  const v = String(s ?? '').toUpperCase();
  if (['3','ACTIVE','ACT'].includes(v))      return 'active';
  if (['6','EXPIRED','EXP'].includes(v))     return 'expired';
  if (['1','2','PENDING','PND'].includes(v)) return 'pending';
  if (['9','TERMINATED','TRM'].includes(v))  return 'terminated';
  return 'active';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  // ── Authenticate the on-premise agent ────────────────────
  const secret         = Deno.env.get('SAP_INGEST_SECRET');
  const incomingSecret = req.headers.get('x-sap-secret');

  if (!secret) {
    return json({ error: 'SAP_INGEST_SECRET not configured in Edge Function secrets' }, 500);
  }
  if (!incomingSecret || incomingSecret !== secret) {
    return json({ error: 'Invalid or missing x-sap-secret header' }, 401);
  }

  // ── Service role client ──────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { action } = body;
  if (!action) return json({ error: 'action is required' }, 400);

  // ════════════════════════════════════════════════════════
  // ACTION: upsert_organization
  // Payload: { action: 'upsert_organization', data: { sap_bp_number, name, ... } }
  // ════════════════════════════════════════════════════════
  if (action === 'upsert_organization') {
    const d = body.data;
    if (!d?.sap_bp_number || !d?.name)
      return json({ error: 'data.sap_bp_number and data.name required' }, 400);

    const { data: existing } = await supabase
      .from('organizations').select('id').eq('sap_bp_number', d.sap_bp_number).maybeSingle();

    const payload = {
      name:               d.name,
      name_arabic:        d.name_arabic        ?? null,
      sap_bp_number:      d.sap_bp_number,
      phone:              d.phone              ?? null,
      email:              d.email              ?? null,
      city:               d.city               ?? null,
      address:            d.address            ?? null,
      type:               d.type               ?? 'tenant',
      sap_last_synced_at: new Date().toISOString(),
    };

    let orgId: string;
    if (existing) {
      const { error } = await supabase.from('organizations').update(payload).eq('id', existing.id);
      if (error) return json({ error: error.message }, 500);
      orgId = existing.id;
    } else {
      const { data: created, error } = await supabase.from('organizations').insert(payload).select('id').single();
      if (error) return json({ error: error.message }, 500);
      orgId = created.id;
    }

    await supabase.from('sap_sync_log').insert({
      sync_type: 'bp_pull', sap_id: d.sap_bp_number, entity_type: 'organization',
      action: existing ? 'updated' : 'created', status: 'success', notes: `type=${d.type}`,
    });

    return json({ ok: true, action: existing ? 'updated' : 'created', id: orgId });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: upsert_contact
  // Payload: { action: 'upsert_contact', data: { name, phone, email, ... } }
  // ════════════════════════════════════════════════════════
  if (action === 'upsert_contact') {
    const d = body.data;
    if (!d?.name) return json({ error: 'data.name required' }, 400);

    // Look up org by SAP BP number if provided
    let orgId: string | null = null;
    if (d.sap_bp_number) {
      const { data: org } = await supabase
        .from('organizations').select('id').eq('sap_bp_number', d.sap_bp_number).maybeSingle();
      orgId = org?.id ?? null;
    }

    // Find existing contact by phone
    let existing: any = null;
    if (d.phone) {
      const { data } = await supabase
        .from('contacts').select('id').eq('phone', d.phone).maybeSingle();
      existing = data;
    }

    const payload = {
      name:            d.name,
      phone:           d.phone          ?? null,
      email:           d.email          ?? null,
      organization_id: orgId,
      source:          'sap',
      client_type:     d.client_type    ?? 'existing_tenant',
    };

    if (existing) {
      await supabase.from('contacts').update(payload).eq('id', existing.id);
      await supabase.from('sap_sync_log').insert({
        sync_type: 'contact_pull', entity_type: 'contact', action: 'updated', status: 'success',
      });
      return json({ ok: true, action: 'updated', id: existing.id });
    } else if (d.phone || d.email) {
      const { data: created, error } = await supabase.from('contacts').insert(payload).select('id').single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from('sap_sync_log').insert({
        sync_type: 'contact_pull', entity_type: 'contact', action: 'created', status: 'success',
      });
      return json({ ok: true, action: 'created', id: created.id });
    }
    return json({ ok: true, action: 'skipped', reason: 'no phone or email' });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: upsert_lease
  // Payload: { action: 'upsert_lease', data: { sap_bp_number, contract_number, ... } }
  // ════════════════════════════════════════════════════════
  if (action === 'upsert_lease') {
    const d = body.data;
    if (!d?.sap_bp_number || !d?.contract_number)
      return json({ error: 'data.sap_bp_number and data.contract_number required' }, 400);

    const { data: org } = await supabase
      .from('organizations').select('id').eq('sap_bp_number', d.sap_bp_number).maybeSingle();

    if (!org) {
      await supabase.from('sap_sync_log').insert({
        sync_type: 'lease_pull', sap_id: d.contract_number, entity_type: 'lease',
        action: 'error', status: 'error', error_msg: `No org for BP ${d.sap_bp_number}`,
      });
      return json({ ok: false, reason: `No organization found for BP ${d.sap_bp_number}` });
    }

    const { error } = await supabase.from('organizations').update({
      lease_contract_number: d.contract_number,
      lease_rental_object:   d.rental_object   ?? null,
      lease_start_date:      parseDate(d.start_date),
      lease_end_date:        parseDate(d.end_date),
      lease_status:          d.status ? mapLeaseStatus(d.status) : 'active',
      sap_last_synced_at:    new Date().toISOString(),
    }).eq('id', org.id);

    if (error) return json({ error: error.message }, 500);

    await supabase.from('sap_sync_log').insert({
      sync_type: 'lease_pull', sap_id: d.contract_number, entity_type: 'lease',
      action: 'updated', status: 'success', notes: `BP ${d.sap_bp_number}`,
    });

    return json({ ok: true, action: 'updated', org_id: org.id });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: batch
  // Payload: { action: 'batch', records: [{ action, data }, ...] }
  // Allows sending multiple records in one HTTP call (more efficient)
  // ════════════════════════════════════════════════════════
  if (action === 'batch') {
    const records: any[] = body.records ?? [];
    if (!records.length) return json({ error: 'records array required' }, 400);

    const results = { total: records.length, ok: 0, errors: 0, details: [] as any[] };
    for (const rec of records) {
      try {
        const subReq = new Request(req.url, {
          method:  'POST',
          headers: { 'content-type': 'application/json', 'x-sap-secret': secret },
          body:    JSON.stringify(rec),
        });
        const subRes  = await serve.fetch ? serve.fetch(subReq) : new Response('{}');
        const subData = await (subRes as any).json?.() ?? {};
        if (subData.ok) results.ok++;
        else { results.errors++; results.details.push({ ...rec.data, error: subData.error }); }
      } catch (e: any) {
        results.errors++;
        results.details.push({ error: e.message });
      }
    }
    return json(results);
  }

  // ════════════════════════════════════════════════════════
  // ACTION: find_by — look up a row by column value
  // ════════════════════════════════════════════════════════
  if (action === 'find_by') {
    const { table, col, val } = body.data ?? {};
    if (!table || !col || val === undefined) return json({ error: 'table, col, val required' }, 400);
    const { data: row } = await supabase.from(table).select('id').eq(col, val).maybeSingle();
    return json({ ok: true, row });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: read_orgs_with_bp — list orgs that have a SAP BP number
  // ════════════════════════════════════════════════════════
  if (action === 'read_orgs_with_bp') {
    const { data: rows } = await supabase
      .from('organizations')
      .select('id,sap_bp_number,name')
      .not('sap_bp_number', 'is', null)
      .limit(1000);
    return json({ ok: true, rows: rows ?? [] });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: update_by_id — update any table row by id
  // ════════════════════════════════════════════════════════
  if (action === 'update_by_id') {
    const { table, id, data: updateData } = body;
    if (!table || !id || !updateData) return json({ error: 'table, id, data required' }, 400);
    const { error } = await supabase.from(table).update(updateData).eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ════════════════════════════════════════════════════════
  // ACTION: log_event — write to sap_sync_log
  // ════════════════════════════════════════════════════════
  if (action === 'log_event') {
    const d = body.data ?? {};
    await supabase.from('sap_sync_log').insert({
      sync_type:   d.sync_type,
      sap_id:      d.sap_id      ?? null,
      entity_type: d.entity_type,
      action:      d.action,
      status:      d.status,
      error_msg:   d.error_msg   ?? null,
      notes:       d.notes       ?? null,
    });
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
