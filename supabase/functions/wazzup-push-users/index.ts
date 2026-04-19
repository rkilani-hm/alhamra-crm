// Edge Function: wazzup-push-users
// Pushes CRM staff members to Wazzup24 as users.
// Required for responsibleUserId in webhooks and agent name in chat UI.
//
// Deploy: supabase functions deploy wazzup-push-users

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
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
  const auth = await verifyCallerRole(req, supabaseAdmin, ['manager', 'frontdesk']);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }


  const apiKey = Deno.env.get('WAZZUP_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'WAZZUP_API_KEY secret not set in Supabase Edge Function secrets' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Fetch all staff profiles with names
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .not('full_name', 'is', null);

    if (error) throw error;

    const users = (profiles ?? []).map(p => ({
      id:   p.id,
      name: p.full_name!,
    }));

    console.log(`Pushing ${users.length} users to Wazzup24`);

    const res = await fetch('https://api.wazzup24.com/v3/users', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(users),
    });

    const data = await res.json().catch(() => ({}));

    return new Response(JSON.stringify({
      ok:     res.ok,
      status: res.status,
      pushed: users.length,
      data,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Push users error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
