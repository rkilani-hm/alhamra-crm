// Edge Function: wazzup-webhook
// Handles ALL Wazzup24 webhook types:
//   - messages / statuses  → store in wa_messages, update activities
//   - createContact        → auto-create CRM contact, respond with JSON
//   - createDeal           → auto-create CRM case, respond with JSON
//
// Deploy: supabase functions deploy wazzup-webhook --no-verify-jwt

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CRM_BASE = 'https://alhamra-crm.lovable.app';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();

    // Test ping from Wazzup when registering webhook
    if (body.test) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ══════════════════════════════════════════════════════════
    // WEBHOOK TYPE 1: createContact
    // Wazzup fires this when a new unknown number messages first.
    // We must create the contact in CRM and respond with the entity.
    // ══════════════════════════════════════════════════════════
    if (body.createContact) {
      const { createContact } = body;
      const { name, contactData, responsibleUserId, source } = createContact;

      // contactData = [{ chatType: 'whatsapp', chatId: '96599...' }]
      const waContact = contactData?.[0];
      const chatId = waContact?.chatId ?? '';
      const cleanPhone = chatId.replace(/\D/g, '');

      console.log('createContact webhook:', JSON.stringify(createContact));

      // Check if contact already exists (may have been created manually)
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
        .maybeSingle();

      if (existing) {
        // Return existing contact in Wazzup's expected format
        return new Response(JSON.stringify({
          id:          existing.id,
          name:        existing.name,
          contactData: [{ chatType: 'whatsapp', chatId: cleanPhone }],
          uri:         `${CRM_BASE}/contacts/${existing.id}`,
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // Create new contact
      const contactName = name || `+${cleanPhone}`;
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          name:   contactName,
          phone:  `+${cleanPhone}`,
          source: 'whatsapp',
        })
        .select('id, name')
        .single();

      if (error) {
        console.error('createContact insert error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      console.log('Created contact:', newContact.id, newContact.name);

      // Respond with the new contact entity — Wazzup stores our ID and links future webhooks
      return new Response(JSON.stringify({
        id:          newContact.id,
        name:        newContact.name,
        contactData: [{ chatType: 'whatsapp', chatId: cleanPhone }],
        uri:         `${CRM_BASE}/contacts/${newContact.id}`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ══════════════════════════════════════════════════════════
    // WEBHOOK TYPE 2: createDeal
    // Wazzup fires this after createContact succeeds.
    // We create a case and link it to the contact.
    // ══════════════════════════════════════════════════════════
    if (body.createDeal) {
      const { createDeal } = body;
      const { responsibleUserId, contacts: dealContacts, source } = createDeal;

      console.log('createDeal webhook:', JSON.stringify(createDeal));

      // dealContacts = array of contact IDs we returned in createContact
      const contactId = dealContacts?.[0] ?? null;

      // Find contact to get their name for subject
      let contactName = 'WhatsApp Client';
      if (contactId) {
        const { data: c } = await supabase
          .from('contacts').select('name, phone').eq('id', contactId).maybeSingle();
        if (c) contactName = c.name;
      }

      // Create case in CRM (deals = cases in our model)
      const { data: newCase, error } = await supabase
        .from('cases')
        .insert({
          contact_id:   contactId,
          channel:      'whatsapp',
          inquiry_type: 'general',
          subject:      `WhatsApp enquiry — ${contactName}`,
          priority:     'normal',
          status:       'new',
          // assigned to responsible user if we have them
          created_by:   responsibleUserId ?? null,
        })
        .select('id, subject')
        .single();

      if (error) {
        console.error('createDeal insert error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      console.log('Created case:', newCase.id, newCase.subject);

      // Respond in Wazzup's expected deal format
      return new Response(JSON.stringify({
        id:       newCase.id,
        contacts: contactId ? [contactId] : [],
        uri:      `${CRM_BASE}/follow-up`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ══════════════════════════════════════════════════════════
    // WEBHOOK TYPE 3: messages + statuses (existing logic)
    // ══════════════════════════════════════════════════════════
    const messages: any[] = body.messages ?? [];

    for (const msg of messages) {
      const {
        messageId, channelId, chatId, chatType,
        type, text, contentUri, isEcho,
        dateTime, contact, status,
      } = msg;

      if (chatType !== 'whatsapp') continue;

      // 1. Upsert wa_conversation
      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert(
          { channel_id: channelId, chat_id: chatId },
          { onConflict: 'channel_id,chat_id', ignoreDuplicates: false }
        )
        .select('id, contact_id, unread_count')
        .single();

      if (convErr || !conv) { console.error('Conversation upsert failed:', convErr); continue; }

      // 2. Auto-match contact by phone
      let contactId: string | null = conv.contact_id ?? null;

      if (!contactId) {
        const cleanPhone = chatId.replace(/\D/g, '');
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id, organization_id')
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          await supabase.from('wa_conversations').update({ contact_id: contactId }).eq('id', conv.id);
        } else if (contact?.name) {
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({ name: contact.name, phone: `+${chatId.replace(/\D/g,'')}`, source: 'whatsapp' })
            .select('id').maybeSingle();
          if (newContact) {
            contactId = newContact.id;
            await supabase.from('wa_conversations').update({ contact_id: contactId }).eq('id', conv.id);
          }
        }
      }

      // 3. Store message
      const direction = isEcho ? 'outbound' : 'inbound';
      const messageBody = text ?? null;
      const sentAt = dateTime ?? new Date().toISOString();

      await supabase.from('wa_messages').upsert(
        {
          wazzup_id:       messageId,
          conversation_id: conv.id,
          direction,
          msg_type:        type ?? 'text',
          body:            messageBody,
          media_url:       contentUri ?? null,
          sender_name:     contact?.name ?? chatId,
          status:          status ?? 'sent',
          sent_at:         sentAt,
        },
        { onConflict: 'wazzup_id', ignoreDuplicates: true }
      );

      // 4. Update conversation last_message
      const lastMessageText = messageBody ?? `[${type ?? 'media'}]`;
      if (!isEcho) {
        await supabase.from('wa_conversations').update({
          last_message:    lastMessageText,
          last_message_at: sentAt,
          unread_count:    (conv.unread_count ?? 0) + 1,
        }).eq('id', conv.id);
      }

      // 5. Sync to activities table for contact/org timelines
      if (contactId) {
        const { data: contactRow } = await supabase
          .from('contacts').select('organization_id, name').eq('id', contactId).maybeSingle();

        const organizationId = contactRow?.organization_id ?? null;
        const contactName    = contactRow?.name ?? contact?.name ?? `+${chatId}`;
        const preview        = messageBody ? messageBody.slice(0, 80) : `[${type ?? 'media'}]`;

        const { data: existingActivity } = await supabase
          .from('activities').select('id')
          .eq('type', 'whatsapp').eq('contact_id', contactId)
          .eq('outcome', `wa:${conv.id}`).maybeSingle();

        if (existingActivity) {
          await supabase.from('activities').update({ body: preview, updated_at: sentAt })
            .eq('id', existingActivity.id);
        } else {
          await supabase.from('activities').insert({
            type:            'whatsapp',
            subject:         `WhatsApp · ${contactName}`,
            body:            preview,
            outcome:         `wa:${conv.id}`,
            contact_id:      contactId,
            organization_id: organizationId,
            scheduled_at:    sentAt,
            done:            false,
            created_by:      null,
          });
        }

        if (organizationId && existingActivity) {
          await supabase.from('activities').update({ organization_id: organizationId })
            .eq('id', existingActivity.id).is('organization_id', null);
        }
      }
    }

    // Process status updates
    const statuses: any[] = body.statuses ?? [];
    for (const s of statuses) {
      await supabase.from('wa_messages').update({ status: s.status }).eq('wazzup_id', s.messageId);
    }

    return new Response(JSON.stringify({ ok: true, processed: messages.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
