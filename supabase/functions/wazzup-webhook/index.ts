// Supabase Edge Function: wazzup-webhook
// Receives inbound messages from Wazzup24 and stores them in Supabase.
// Also writes/updates an activity record of type 'whatsapp' per conversation
// so that contact timelines and organization master data show WhatsApp history.
//
// Deploy: supabase functions deploy wazzup-webhook --no-verify-jwt

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();

    // Wazzup sends { test: true } when registering the webhook — respond 200
    if (body.test) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Process incoming messages ──────────────────────────────
    const messages: any[] = body.messages ?? [];

    for (const msg of messages) {
      const {
        messageId, channelId, chatId, chatType,
        type, text, contentUri, isEcho,
        dateTime, contact, status,
      } = msg;

      if (chatType !== 'whatsapp') continue;

      // ── 1. Upsert wa_conversation ──────────────────────────
      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert(
          { channel_id: channelId, chat_id: chatId },
          { onConflict: 'channel_id,chat_id', ignoreDuplicates: false }
        )
        .select('id, contact_id, unread_count')
        .single();

      if (convErr || !conv) {
        console.error('Conversation upsert failed:', convErr);
        continue;
      }

      // ── 2. Auto-match or create contact by phone ──────────
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
          await supabase
            .from('wa_conversations')
            .update({ contact_id: contactId })
            .eq('id', conv.id);
        } else if (contact?.name) {
          // Auto-create contact from Wazzup24 data
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({
              name:   contact.name,
              phone:  `+${cleanPhone}`,
              source: 'whatsapp',
            })
            .select('id')
            .maybeSingle();

          if (newContact) {
            contactId = newContact.id;
            await supabase
              .from('wa_conversations')
              .update({ contact_id: contactId })
              .eq('id', conv.id);
          }
        }
      }

      // ── 3. Store message ───────────────────────────────────
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

      // ── 4. Update conversation last_message + unread count ─
      const lastMessageText = messageBody ?? `[${type ?? 'media'}]`;
      if (!isEcho) {
        await supabase.from('wa_conversations').update({
          last_message:    lastMessageText,
          last_message_at: sentAt,
          unread_count:    (conv.unread_count ?? 0) + 1,
        }).eq('id', conv.id);
      }

      // ── 5. Sync to activities table ───────────────────────
      // One activity record per wa_conversation, upserted on every message.
      // This makes WhatsApp threads visible on contact & org timelines.
      if (contactId) {
        // Look up the contact's organization_id
        const { data: contactRow } = await supabase
          .from('contacts')
          .select('organization_id, name')
          .eq('id', contactId)
          .maybeSingle();

        const organizationId: string | null = contactRow?.organization_id ?? null;
        const contactName   = contactRow?.name ?? contact?.name ?? `+${chatId}`;

        // Build a meaningful subject
        const preview = messageBody
          ? messageBody.slice(0, 80)
          : `[${type ?? 'media'}]`;

        const subject = `WhatsApp · ${contactName}`;
        const body_text = preview;

        // Check if an activity already exists for this conversation
        const { data: existingActivity } = await supabase
          .from('activities')
          .select('id')
          .eq('type', 'whatsapp')
          .eq('contact_id', contactId)
          // Use case_id as a stable key to store conv.id (avoids extra column)
          // Actually use body matching — simpler: filter by subject + contact
          // Best: store conv.id in outcome field as a stable identifier
          .eq('outcome', `wa:${conv.id}`)
          .maybeSingle();

        if (existingActivity) {
          // Update body with latest message preview + bump updated_at
          await supabase
            .from('activities')
            .update({
              body:       body_text,
              updated_at: sentAt,
            })
            .eq('id', existingActivity.id);
        } else {
          // Create new activity for this conversation
          await supabase.from('activities').insert({
            type:            'whatsapp',
            subject,
            body:            body_text,
            outcome:         `wa:${conv.id}`,   // stable key linking back to conversation
            contact_id:      contactId,
            organization_id: organizationId,
            scheduled_at:    sentAt,
            done:            false,
            created_by:      null,              // system-generated
          });
        }

        // If organization_id was just discovered, make sure existing
        // activity also has it (handles the case where contact was linked later)
        if (organizationId && existingActivity) {
          await supabase
            .from('activities')
            .update({ organization_id: organizationId })
            .eq('id', existingActivity.id)
            .is('organization_id', null);
        }
      }
    }

    // ── Process message status updates ────────────────────────
    const statuses: any[] = body.statuses ?? [];
    for (const s of statuses) {
      await supabase
        .from('wa_messages')
        .update({ status: s.status })
        .eq('wazzup_id', s.messageId);
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
