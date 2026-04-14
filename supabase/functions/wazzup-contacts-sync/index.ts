// Edge Function: wazzup-contacts-sync
// M5: Paginated fetch of ALL Wazzup24 contacts (100 per page)
// Imports them into the CRM contacts table.
// Deploy: supabase functions deploy wazzup-contacts-sync

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyCallerRole(req: Request, supabase: any, allowedRoles: string[]) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) return { ok: false, error: 'Unauthorized' };
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return { ok: false, error: 'Unauthorized' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !allowedRoles.includes(profile.role)) return { ok: false, error: 'Forbidden' };
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey      = Deno.env.get('WAZZUP_API_KEY');
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const auth = await verifyCallerRole(req, supabaseAdmin, ['frontdesk', 'manager']);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: CORS });

  try {
    // ── M5: Paginated fetch — 100 per page ─────────────────────
    let allContacts: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 100;

    while (true) {
      const url = `https://api.wazzup24.com/v3/contacts?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        console.error(`Wazzup contacts page ${offset / PAGE_SIZE + 1} failed: ${res.status}`);
        break;
      }

      const data = await res.json();
      // Wazzup returns array directly or { contacts: [] }
      const page: any[] = Array.isArray(data) ? data : (data.contacts ?? data.data ?? []);

      if (page.length === 0) break;
      allContacts = allContacts.concat(page);

      // If returned fewer than PAGE_SIZE, we've reached the end
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;

      // Safety cap: 50 pages = 5000 contacts max per sync
      if (offset >= 5000) break;
    }

    console.log(`Fetched ${allContacts.length} contacts from Wazzup24 (${Math.ceil(allContacts.length / PAGE_SIZE)} pages)`);

    // ── Map and upsert into CRM ──────────────────────────────
    let created = 0, skipped = 0;
    for (const wc of allContacts) {
      const chatData = wc.contactData?.[0];
      if (!chatData?.chatId) { skipped++; continue; }

      const phone   = '+' + chatData.chatId.replace(/\D/g, '');
      const name    = wc.name || phone;

      // Skip if phone already exists
      const { data: existing } = await supabaseAdmin
        .from('contacts').select('id').or(`phone.eq.${phone},phone.eq.${chatData.chatId}`).maybeSingle();

      if (existing) { skipped++; continue; }

      await supabaseAdmin.from('contacts').insert({
        name,
        phone,
        source: 'whatsapp',
      }).throwOnError().catch(() => { skipped++; });
      created++;
    }

    return new Response(JSON.stringify({
      ok: true,
      total:   allContacts.length,
      created,
      skipped,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('contacts-sync error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
