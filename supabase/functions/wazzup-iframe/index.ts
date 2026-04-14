// Edge Function: wazzup-iframe
// Generates a Wazzup24 iFrame URL.
// Passes options.useDealsEvents: true so WZ_CREATE_ENTITY fires when
// agent clicks "+" in the deals suitcase — enabling CRM panel to open.

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


  try {
    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    if (!apiKey) return new Response(
      JSON.stringify({ error: 'WAZZUP_API_KEY secret not configured' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

    const body = await req.json().catch(() => ({}));
    const { chatId, chatType = 'whatsapp', channelId, scope = 'global' } = body;

    // Step 1: Get a valid Wazzup24 user ID
    const usersRes = await fetch('https://api.wazzup24.com/v3/users', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    let wazzupUserId = 'crm-agent';
    let wazzupUserName = 'CRM Agent';

    if (usersRes.ok) {
      const users = await usersRes.json();
      const list = Array.isArray(users) ? users : (users.users ?? users.data ?? []);
      if (list.length > 0) {
        wazzupUserId  = list[0].id;
        wazzupUserName = list[0].name ?? 'CRM Agent';
      }
    }

    // Step 2: Build payload
    // useDealsEvents: true makes WZ_CREATE_ENTITY fire when agent clicks "+"
    const payload: Record<string, any> = {
      user: { id: wazzupUserId, name: wazzupUserName },
      scope,
      options: {
        useDealsEvents: true,  // enables WZ_CREATE_ENTITY + WZ_OPEN_ENTITY events
      },
    };

    if (scope === 'card' && chatId) {
      payload.filter = [{ chatType, chatId }];
      if (channelId) payload.activeChat = { chatType, chatId, channelId };
    }

    // Step 3: Get iFrame URL
    const res = await fetch('https://api.wazzup24.com/v3/iframe', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resText = await res.text();

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `Wazzup24 error ${res.status}: ${resText}`,
        hint: res.status === 401 ? 'Check WAZZUP_API_KEY' : 'Check Wazzup24 user setup',
      }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const data = JSON.parse(resText);
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
