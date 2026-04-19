// Edge Function: wazzup-iframe
// Generates a Wazzup24 iFrame URL.
// Passes options.useDealsEvents: true so WZ_CREATE_ENTITY fires when
// agent clicks "+" in the deals suitcase — enabling CRM panel to open.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  // Verify caller has a valid JWT (authentication) — soft check for role
  // The WhatsApp page is already role-gated by React Router, so we trust
  // authenticated users accessing this function.
  const authHeader = req.headers.get('Authorization') ?? '';
  let callerUserId: string | null = null;
  let callerName: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized — please log in again' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    callerUserId = user.id;
    // Get caller's name for the iFrame user context
    const { data: profile } = await supabaseAdmin.from('profiles')
      .select('full_name, role').eq('id', user.id).maybeSingle();
    // Allow frontdesk and manager only (hard check)
    if (!profile || !['frontdesk', 'manager'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Access denied — insufficient role' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    callerName = profile.full_name ?? 'CRM Agent';
  } else {
    return new Response(JSON.stringify({ error: 'Authorization header required' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
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

    // Step 1: Use the authenticated CRM user's ID and name for the iFrame
    // This scopes the Wazzup interface to show only their assigned chats
    const wazzupUserId  = callerUserId ?? 'crm-agent';
    const wazzupUserName = callerName ?? 'CRM Agent';

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
