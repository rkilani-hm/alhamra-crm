// Edge Function: admin-create-user
// H3: Create users server-side using the admin API (no confirmation email).
// Only callable by managers (verified via JWT role check).
// Deploy: supabase functions deploy admin-create-user

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate password strength server-side too (H2)
function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8)              return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw))                return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(pw))                return 'Password must contain a number';
  if (pw.length > 128)                   return 'Password too long';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Verify caller is a manager
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the calling user is a manager
    const token = authHeader.slice(7);
    const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', callerUser.id).maybeSingle();

    if (!callerProfile || callerProfile.role !== 'manager') {
      return new Response(JSON.stringify({ error: 'Only managers can create users' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { email, password, full_name, role, department_id } = await req.json();

    // Validate inputs
    if (!email?.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const pwError = validatePassword(password);
    if (pwError) {
      return new Response(JSON.stringify({ error: pwError }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const VALID_ROLES = ['frontdesk', 'department', 'manager'];
    if (!VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create user via admin API — no confirmation email required
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,          // skip email confirmation
      user_metadata: { full_name },
    });

    if (createErr) throw createErr;
    if (!newUser?.user) throw new Error('User creation returned no user');

    // Update profile (trigger creates it with frontdesk default)
    const { error: profileErr } = await supabaseAdmin.from('profiles').update({
      full_name,
      role,
      department_id: department_id || null,
    }).eq('id', newUser.user.id);

    if (profileErr) throw profileErr;

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id:     callerUser.id,
      action:      'create',
      entity_type: 'user',
      entity_id:   newUser.user.id,
      details:     { email, role, created_by: callerUser.email },
    });

    return new Response(JSON.stringify({
      ok:      true,
      user_id: newUser.user.id,
      email:   newUser.user.email,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('admin-create-user error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
