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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey = Deno.env.get('WAZZUP_API_KEY');
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
