// Edge Function: wazzup-iframe
// Generates a Wazzup24 iFrame URL.
// IMPORTANT: The user.id must be a user registered in Wazzup24 via POST /v3/users.
// We fetch the first available Wazzup24 user and use their ID.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'WAZZUP_API_KEY secret is not set in Supabase' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { chatId, chatType = 'whatsapp', channelId, scope = 'global' } = body;

    // ── Step 1: Get a valid Wazzup24 user ID ─────────────────
    // The iFrame requires a user registered in Wazzup24 — not a Supabase UUID
    const usersRes = await fetch('https://api.wazzup24.com/v3/users', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    let wazzupUserId = 'default-agent';
    let wazzupUserName = 'CRM Agent';

    if (usersRes.ok) {
      const users = await usersRes.json();
      const userList = Array.isArray(users) ? users : (users.users ?? users.data ?? []);
      if (userList.length > 0) {
        wazzupUserId  = userList[0].id;
        wazzupUserName = userList[0].name ?? 'CRM Agent';
        console.log(`Using Wazzup24 user: ${wazzupUserId} (${wazzupUserName})`);
      } else {
        console.log('No Wazzup24 users found — will try without user');
      }
    } else {
      const errText = await usersRes.text();
      console.error('Failed to fetch Wazzup24 users:', usersRes.status, errText);
    }

    // ── Step 2: Build iFrame payload ─────────────────────────
    // scope=global → full inbox with all conversations
    // scope=card   → single contact view
    const payload: Record<string, any> = {
      user: { id: wazzupUserId, name: wazzupUserName },
      scope,
    };

    if (scope === 'card' && chatId) {
      payload.filter = [{ chatType, chatId }];
      if (channelId) payload.activeChat = { chatType, chatId, channelId };
    }

    console.log('Wazzup iFrame payload:', JSON.stringify(payload));

    // ── Step 3: Request iFrame URL ───────────────────────────
    const iframeRes = await fetch('https://api.wazzup24.com/v3/iframe', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    const iframeBody = await iframeRes.text();
    console.log(`Wazzup iFrame response: ${iframeRes.status} — ${iframeBody.slice(0, 300)}`);

    if (!iframeRes.ok) {
      // Return a helpful error with the actual Wazzup24 response
      return new Response(JSON.stringify({
        error: `Wazzup24 returned ${iframeRes.status}: ${iframeBody}`,
        hint:  iframeRes.status === 401
          ? 'Check WAZZUP_API_KEY is correct'
          : iframeRes.status === 400
          ? 'iFrame payload rejected — check Wazzup24 user setup'
          : 'Wazzup24 API error',
      }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const data = JSON.parse(iframeBody);
    return new Response(JSON.stringify({ url: data.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('wazzup-iframe error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
