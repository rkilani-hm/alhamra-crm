// Edge Function: wazzup-push-contacts
// Pushes ALL CRM contacts (with phone numbers) TO Wazzup24.
// This is the missing piece — once Wazzup knows our contacts:
//   - It recognizes them in incoming messages
//   - iFrame scoped to chatId shows full history
//   - createContact/createDeal webhooks fire with our CRM IDs
//   - Agents see "Go to CRM" link in Wazzup chat UI
//
// Deploy: supabase functions deploy wazzup-push-contacts

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH = 100; // Wazzup limit per request

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey = Deno.env.get('WAZZUP_API_KEY');
  const crmBase = Deno.env.get('CRM_BASE_URL') || 'https://alhamra-crm.lovable.app';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Fetch all contacts with a phone number
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .not('phone', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const valid = (contacts ?? []).filter(c => c.phone && c.phone.replace(/\D/g,'').length >= 7);

    console.log(`Pushing ${valid.length} contacts to Wazzup24`);

    let pushed = 0;
    let errors = 0;

    // 2. Push in batches of 100
    for (let i = 0; i < valid.length; i += BATCH) {
      const batch = valid.slice(i, i + BATCH).map(c => {
        const chatId = c.phone!.replace(/\D/g, ''); // digits only = WhatsApp chatId
        return {
          id:              c.id,           // our CRM UUID becomes Wazzup's contact ID
          name:            c.name,
          contactData:     [{ chatType: 'whatsapp', chatId }],
          uri:             `${crmBase}/contacts/${c.id}`, // "Go to CRM" deep link
        };
      });

      const res = await fetch('https://api.wazzup24.com/v3/contacts', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        pushed += batch.length;
      } else {
        const text = await res.text();
        console.error(`Batch ${i / BATCH} failed: ${res.status} ${text}`);
        errors += batch.length;
      }
    }

    return new Response(JSON.stringify({
      ok:     true,
      total:  valid.length,
      pushed,
      errors,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Push contacts error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
