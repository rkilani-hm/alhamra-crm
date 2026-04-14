// Edge Function: admin-create-user
// H3: Creates users server-side using admin.createUser() instead of signUp()
// - No confirmation email required
// - Caller must be a manager (JWT verified + role checked)
// - Password policy enforced server-side
// Deploy: supabase functions deploy admin-create-user

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_ORIGIN = 'https://alhamra-crm.lovable.app';
const CORS = {
  'Access-Control-Allow-Origin':  CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── 1. Verify caller is authenticated ───────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.replace('Bearer ', '').trim();
  if (!callerToken) return json({ error: 'Unauthorized' }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Verify caller JWT and role
  const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(callerToken);
  if (callerErr || !caller) return json({ error: 'Unauthorized' }, 401);

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'manager') return json({ error: 'Forbidden — manager role required' }, 403);

  // ── 2. Parse + validate request body ────────────────────────
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, password, full_name, role, department_id } = body ?? {};

  if (!email || !password || !full_name)
    return json({ error: 'email, password and full_name are required' }, 400);

  // Server-side password policy (H2 mirrored)
  if (password.length < 8)
    return json({ error: 'Password must be at least 8 characters' }, 400);
  if (!/[A-Z]/.test(password))
    return json({ error: 'Password must contain at least one uppercase letter' }, 400);
  if (!/[0-9]/.test(password))
    return json({ error: 'Password must contain at least one number' }, 400);

  const validRoles = ['frontdesk', 'department', 'manager'];
  if (role && !validRoles.includes(role))
    return json({ error: 'Invalid role' }, 400);

  // ── 3. Create user with admin API (no email confirmation) ────
  const { data: { user: newUser }, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,       // skip confirmation email
      user_metadata: { full_name },
    });

  if (createErr || !newUser)
    return json({ error: createErr?.message ?? 'User creation failed' }, 500);

  // ── 4. Upsert profile with role + dept ───────────────────────
  const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
    id:            newUser.id,
    full_name,
    role:          role ?? 'frontdesk',
    department_id: department_id || null,
  }, { onConflict: 'id' });

  if (profileErr) {
    // Rollback user creation on profile failure
    await supabaseAdmin.auth.admin.deleteUser(newUser.id);
    return json({ error: 'Failed to create profile: ' + profileErr.message }, 500);
  }

  // ── 5. Audit log ─────────────────────────────────────────────
  await supabaseAdmin.from('audit_log').insert({
    actor_id:   caller.id,
    action:     'user.create',
    table_name: 'profiles',
    record_id:  newUser.id,
    new_data:   { email, full_name, role: role ?? 'frontdesk', department_id },
  }).throwOnError().catch(() => {});

  return json({ ok: true, user_id: newUser.id });
});
