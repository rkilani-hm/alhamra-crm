// Edge Function: wazzup-webhook
// Security hardened:
//   - Verifies WAZZUP_WEBHOOK_SECRET header (C5)
//   - Handles createContact, createDeal, messages, statuses
// Deploy: supabase functions deploy wazzup-webhook --no-verify-jwt

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wazzup-secret',
};

const CRM_BASE = 'https://alhamra-crm.lovable.app';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── C5: Verify webhook secret ─────────────────────────────
    // Set WAZZUP_WEBHOOK_SECRET in Supabase Edge Function secrets.
    // In Wazzup24: Settings → Integration → add a custom header
    // x-wazzup-secret: <your_secret_value>
    const webhookSecret = Deno.env.get('WAZZUP_WEBHOOK_SECRET');
    if (webhookSecret) {
      const incomingSecret = req.headers.get('x-wazzup-secret') ??
                             req.headers.get('x-webhook-secret') ?? '';
      if (incomingSecret !== webhookSecret) {
        console.error('Webhook secret mismatch — rejected');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json();

    // Test ping
    if (body.test) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── createContact ─────────────────────────────────────────
    if (body.createContact) {
      const { createContact } = body;
      const { name, contactData, responsibleUserId } = createContact;
      const waContact = contactData?.[0];
      const chatId    = waContact?.chatId ?? '';
      const cleanPhone = chatId.replace(/\D/g, '');

      const { data: existing } = await supabase
        .from('contacts').select('id,name,phone')
        .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({
          id: existing.id, name: existing.name,
          contactData: [{ chatType: 'whatsapp', chatId: cleanPhone }],
          uri: `${CRM_BASE}/contacts/${existing.id}`,
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: name || `+${cleanPhone}`, phone: `+${cleanPhone}`, source: 'whatsapp' })
        .select('id,name').single();

      if (error) throw error;

      // Audit log
      await supabase.from('audit_log').insert({
        action: 'create', entity_type: 'contact', entity_id: newContact.id,
        details: { source: 'wazzup_webhook', phone: cleanPhone },
      });

      return new Response(JSON.stringify({
        id: newContact.id, name: newContact.name,
        contactData: [{ chatType: 'whatsapp', chatId: cleanPhone }],
        uri: `${CRM_BASE}/contacts/${newContact.id}`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── createDeal ────────────────────────────────────────────
    if (body.createDeal) {
      const { createDeal } = body;
      const { responsibleUserId, contacts: dealContacts } = createDeal;
      const contactId = dealContacts?.[0] ?? null;

      let contactName = 'WhatsApp Client';
      if (contactId) {
        const { data: c } = await supabase.from('contacts').select('name,phone').eq('id', contactId).maybeSingle();
        if (c) contactName = c.name;
      }

      const { data: newCase, error } = await supabase
        .from('cases').insert({
          contact_id: contactId, channel: 'whatsapp', inquiry_type: 'general',
          subject: `WhatsApp enquiry — ${contactName}`, priority: 'normal',
          status: 'new', created_by: responsibleUserId ?? null,
        }).select('id,subject').single();

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'create', entity_type: 'case', entity_id: newCase.id,
        details: { source: 'wazzup_webhook', contact_id: contactId },
      });

      return new Response(JSON.stringify({
        id: newCase.id, contacts: contactId ? [contactId] : [],
        uri: `${CRM_BASE}/follow-up`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── messages ──────────────────────────────────────────────
    const messages: any[] = body.messages ?? [];
    for (const msg of messages) {
      const { messageId, channelId, chatId, chatType, type, text, contentUri, isEcho, dateTime, contact, status } = msg;
      if (chatType !== 'whatsapp') continue;

      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert({ channel_id: channelId, chat_id: chatId }, { onConflict: 'channel_id,chat_id', ignoreDuplicates: false })
        .select('id,contact_id,unread_count').single();

      if (convErr || !conv) { console.error('Conversation upsert failed:', convErr?.message); continue; }

      let contactId: string | null = conv.contact_id ?? null;
      if (!contactId) {
        const cleanPhone = chatId.replace(/\D/g, '');
        const { data: existingContact } = await supabase
          .from('contacts').select('id,organization_id')
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`).maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          await supabase.from('wa_conversations').update({ contact_id: contactId }).eq('id', conv.id);
        } else if (contact?.name) {
          const { data: nc } = await supabase.from('contacts')
            .insert({ name: contact.name, phone: `+${chatId.replace(/\D/g,'')}`, source: 'whatsapp' })
            .select('id').maybeSingle();
          if (nc) { contactId = nc.id; await supabase.from('wa_conversations').update({ contact_id: contactId }).eq('id', conv.id); }
        }
      }

      const direction   = isEcho ? 'outbound' : 'inbound';
      const messageBody = text ?? null;
      const sentAt      = dateTime ?? new Date().toISOString();

      await supabase.from('wa_messages').upsert({
        wazzup_id: messageId, conversation_id: conv.id, direction,
        msg_type: type ?? 'text', body: messageBody, media_url: contentUri ?? null,
        sender_name: contact?.name ?? chatId, status: status ?? 'sent', sent_at: sentAt,
      }, { onConflict: 'wazzup_id', ignoreDuplicates: true });

      if (!isEcho) {
        await supabase.from('wa_conversations').update({
          last_message: messageBody ?? `[${type ?? 'media'}]`,
          last_message_at: sentAt,
          unread_count: (conv.unread_count ?? 0) + 1,
        }).eq('id', conv.id);
      }

      if (contactId) {
        const { data: contactRow } = await supabase.from('contacts')
          .select('organization_id,name').eq('id', contactId).maybeSingle();
        const organizationId = contactRow?.organization_id ?? null;
        const contactName    = contactRow?.name ?? contact?.name ?? `+${chatId}`;
        const preview        = messageBody ? messageBody.slice(0, 80) : `[${type ?? 'media'}]`;

        const { data: existingActivity } = await supabase.from('activities').select('id')
          .eq('type','whatsapp').eq('contact_id', contactId)
          .eq('outcome', `wa:${conv.id}`).maybeSingle();

        if (existingActivity) {
          await supabase.from('activities').update({ body: preview, updated_at: sentAt }).eq('id', existingActivity.id);
        } else {
          await supabase.from('activities').insert({
            type: 'whatsapp', subject: `WhatsApp · ${contactName}`, body: preview,
            outcome: `wa:${conv.id}`, contact_id: contactId, organization_id: organizationId,
            scheduled_at: sentAt, done: false, created_by: null,
          });
        }
      }
    }

    // ── statuses ──────────────────────────────────────────────
    const statuses: any[] = body.statuses ?? [];
    for (const s of statuses) {
      await supabase.from('wa_messages').update({ status: s.status }).eq('wazzup_id', s.messageId);
    }

    return new Response(JSON.stringify({ ok: true, processed: messages.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {  // don't leak err.message
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
