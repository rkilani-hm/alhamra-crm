// local-wa-webhook — Receives webhook events from Evolution API on Railway.
// Maps Evolution API event schema → CRM wa_channels / wa_conversations / wa_messages.
// Coexists with Wazzup24 — source='local' distinguishes records.
//
// Deploy: supabase functions deploy local-wa-webhook --no-verify-jwt
// Secret: LOCAL_WA_WEBHOOK_SECRET (shared with Railway Evolution API)

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // ── Validate webhook secret ───────────────────────────────
  const secret = Deno.env.get('LOCAL_WA_WEBHOOK_SECRET');
  if (secret) {
    const incoming = req.headers.get('x-webhook-secret') ?? req.headers.get('apikey') ?? '';
    if (incoming !== secret) return json({ error: 'Unauthorized' }, 401);
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const event        = payload.event ?? payload.type ?? '';
  const instanceName = payload.instance ?? payload.instanceName ?? '';
  const data         = payload.data ?? payload;

  console.log(`local-wa-webhook: ${event} from ${instanceName}`);

  try {
    // ── QRCODE_UPDATED ───────────────────────────────────────
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const qrBase64 = data.qrcode?.base64 ?? data.base64 ?? data.qr ?? null;
      await supabase.from('local_wa_instances').update({
        state:        'qr',
        qr_code:      qrBase64,
        qr_updated_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }).eq('instance_name', instanceName);
      return json({ ok: true, event });
    }

    // ── CONNECTION_UPDATE ────────────────────────────────────
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const status    = data.state ?? data.status ?? '';
      const phone     = data.wuid?.split('@')[0] ?? data.phone ?? null;
      const crmState  = status === 'open'  ? 'connected'
                      : status === 'close' ? 'disconnected'
                      : status === 'connecting' ? 'connecting'
                      : 'disconnected';

      const update: any = { state: crmState, updated_at: new Date().toISOString() };
      if (crmState === 'connected') {
        update.qr_code     = null;
        update.connected_at = new Date().toISOString();
        if (phone) update.phone = phone;
      }

      await supabase.from('local_wa_instances').update(update).eq('instance_name', instanceName);

      // Upsert into wa_channels when connected
      if (crmState === 'connected' && phone) {
        const channelId = `local_${instanceName}`;
        const { data: ch } = await supabase
          .from('wa_channels').upsert({
            channel_id: channelId,
            phone,
            label:      instanceName,
            transport:  'whatsapp',
            state:      'active',
            source:     'local',
          }, { onConflict: 'channel_id' }).select('channel_id').single();

        if (ch) {
          await supabase.from('local_wa_instances')
            .update({ channel_id: channelId }).eq('instance_name', instanceName);
        }
      }
      return json({ ok: true, event, state: crmState });
    }

    // ── MESSAGES_UPSERT (inbound message received) ────────────
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const messages: any[] = Array.isArray(data) ? data : [data];

      for (const msg of messages) {
        const key       = msg.key ?? {};
        const fromMe    = key.fromMe === true;
        const remoteJid = key.remoteJid ?? '';
        const chatPhone = remoteJid.split('@')[0].split(':')[0];
        const channelId = `local_${instanceName}`;

        // Find or create contact
        let contactId: string | null = null;
        if (!fromMe) {
          const { data: contact } = await supabase
            .from('contacts').select('id').eq('phone', chatPhone).maybeSingle();
          if (contact) {
            contactId = contact.id;
          } else {
            const pushName = msg.pushName ?? null;
            const { data: newContact } = await supabase
              .from('contacts').insert({
                name:   pushName ?? `+${chatPhone}`,
                phone:  chatPhone,
                source: 'whatsapp',
                client_type: 'potential',
              }).select('id').single();
            if (newContact) contactId = newContact.id;
          }
        }

        // Upsert conversation
        const { data: convo } = await supabase
          .from('wa_conversations').upsert({
            channel_id:      channelId,
            chat_id:         chatPhone,
            contact_id:      contactId,
            last_message:    msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '(media)',
            last_message_at: new Date(msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now()).toISOString(),
            unread_count:    fromMe ? 0 : 1,
          }, { onConflict: 'channel_id,chat_id' }).select('id').single();

        if (!convo) continue;

        // Insert message
        const msgId   = key.id ?? `local_${Date.now()}`;
        const body    = msg.message?.conversation
                     ?? msg.message?.extendedTextMessage?.text
                     ?? msg.message?.imageMessage?.caption
                     ?? null;
        const msgType = msg.message?.imageMessage    ? 'image'
                      : msg.message?.videoMessage    ? 'video'
                      : msg.message?.documentMessage ? 'document'
                      : msg.message?.audioMessage    ? 'audio'
                      : 'text';
        const mediaUrl = msg.message?.imageMessage?.url
                      ?? msg.message?.documentMessage?.url ?? null;

        await supabase.from('wa_messages').upsert({
          wazzup_id:       `local_${msgId}`,
          conversation_id: convo.id,
          direction:       fromMe ? 'outbound' : 'inbound',
          msg_type:        msgType,
          body,
          media_url:       mediaUrl,
          sender_name:     fromMe ? 'Agent' : (msg.pushName ?? null),
          status:          'delivered',
          sent_at:         new Date(msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now()).toISOString(),
        }, { onConflict: 'wazzup_id' });
      }

      return json({ ok: true, event, count: messages.length });
    }

    // Unhandled event — log and return ok
    return json({ ok: true, event, note: 'unhandled event type' });

  } catch (e: any) {
    console.error('local-wa-webhook error:', e);
    return json({ error: e.message }, 500);
  }
});
