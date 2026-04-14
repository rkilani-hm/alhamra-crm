// Edge Function: wazzup-contacts-sync
// Fetches ALL contacts from Wazzup24 (GET /v3/contacts) and creates
// wa_conversations rows for each one so historical chats appear in the inbox.
// The iFrame then shows full history when a conversation is opened.
//
// Deploy: supabase functions deploy wazzup-contacts-sync
// Secret: WAZZUP_API_KEY already set from wazzup-sync

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


  const apiKey = Deno.env.get('WAZZUP_API_KEY');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── 1. Fetch all contacts from Wazzup24 ───────────────────
    const contactsRes = await fetch('https://api.wazzup24.com/v3/contacts', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!contactsRes.ok) {
      throw new Error(`Wazzup24 contacts API error: ${contactsRes.status} ${await contactsRes.text()}`);
    }

    const contactsBody = await contactsRes.json();
    // Response can be array or { contacts: [] }
    const contacts: any[] = Array.isArray(contactsBody)
      ? contactsBody
      : (contactsBody.contacts ?? contactsBody.data ?? []);

    console.log(`Fetched ${contacts.length} contacts from Wazzup24`);

    // ── 2. Load our existing channels so we can map channelId ─
    const { data: waChannels } = await supabase
      .from('wa_channels')
      .select('channel_id, phone');

    const channelIds = new Set((waChannels ?? []).map((c: any) => c.channel_id));

    // ── 3. Load existing conversations to avoid duplicate work ─
    const { data: existingConvos } = await supabase
      .from('wa_conversations')
      .select('channel_id, chat_id');

    const existingSet = new Set(
      (existingConvos ?? []).map((c: any) => `${c.channel_id}::${c.chat_id}`)
    );

    // ── 4. Process each contact ───────────────────────────────
    let created = 0;
    let matched = 0;
    let skipped = 0;

    for (const contact of contacts) {
      // Wazzup24 contact fields: chatId, chatType, channelId, name
      const chatId    = contact.chatId    ?? contact.phone ?? contact.id;
      const chatType  = contact.chatType  ?? 'whatsapp';
      const channelId = contact.channelId ?? contact.channel_id;
      const name      = contact.name      ?? contact.displayName ?? null;

      // Only handle WhatsApp contacts
      if (chatType !== 'whatsapp') { skipped++; continue; }

      // Skip if channel not in our system
      if (channelId && !channelIds.has(channelId)) { skipped++; continue; }

      // Use first channel if no channelId on contact
      const resolvedChannelId = channelId ?? [...channelIds][0];
      if (!resolvedChannelId) { skipped++; continue; }

      const key = `${resolvedChannelId}::${chatId}`;
      if (existingSet.has(key)) { matched++; continue; } // already exists

      // ── Try to match to existing contact by phone ────────────
      const cleanPhone = String(chatId).replace(/\D/g, '');
      let contactId: string | null = null;

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else if (name) {
        // Create a new contact record so the name shows up
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            name:   name,
            phone:  `+${cleanPhone}`,
            source: 'whatsapp',
          })
          .select('id')
          .maybeSingle();
        if (newContact) contactId = newContact.id;
      }

      // ── Create the conversation row ──────────────────────────
      const { error } = await supabase
        .from('wa_conversations')
        .insert({
          channel_id:  resolvedChannelId,
          chat_id:     chatId,
          contact_id:  contactId,
          last_message: null,      // no history available via API
          last_message_at: null,   // will update when iFrame is opened
          unread_count: 0,
        });

      if (!error) {
        created++;
        existingSet.add(key); // prevent duplicates within same run
      }
    }

    return new Response(JSON.stringify({
      ok:      true,
      total:   contacts.length,
      created,
      matched,
      skipped,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('contacts-sync error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
