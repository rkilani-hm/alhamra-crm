// Edge Function: intake-form  (PUBLIC — no JWT required)
// Receives web form submissions, creates contact + case, returns reference number.
// Handles all inquiry types: tenant, prospect, vendor, visitor, event/photo shoot.
//
// Deploy: supabase functions deploy intake-form --no-verify-jwt

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allow embedding from any origin (public form)
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Reference number: WEB-YYYYMMDD-XXXX ──────────────────────
const makeRef = () => {
  const d   = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WEB-${ymd}-${rnd}`;
};

// ── Photo shoot event subject builder ───────────────────────
const buildSubject = (type: string, data: any): string => {
  switch (type) {
    case 'prospect': return `Prospect Tenant — ${data.company_name || data.name}`;
    case 'leasing':  return `Tenant Request — ${data.subject || 'Lease enquiry'}`;
    case 'vendor':   return `Vendor — ${data.company_name || data.name}: ${data.service_type || 'Service proposal'}`;
    case 'event':    return `${data.event_type || 'Event'} — ${data.company_name || data.name} (${data.requested_date || 'TBD'})`;
    case 'visitor':  return `Visitor — ${data.name}: ${data.purpose || 'Walk-in'}`;
    default:         return data.subject || `General inquiry from ${data.name}`;
  }
};

// ── Map inquiry type to priority ─────────────────────────────
const getPriority = (type: string, data: any): string => {
  if (type === 'event') return 'normal';
  if (data.urgency === 'urgent') return 'urgent';
  return 'normal';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { inquiry_type, ...formData } = body;

  // Basic validation
  if (!inquiry_type) return json({ error: 'inquiry_type is required' }, 400);
  if (!formData.name || !formData.phone)
    return json({ error: 'name and phone are required' }, 400);

  const validTypes = ['leasing', 'prospect', 'vendor', 'visitor', 'event', 'general'];
  if (!validTypes.includes(inquiry_type))
    return json({ error: 'Invalid inquiry_type' }, 400);

  try {
    // ── 1. Log raw submission ───────────────────────────────
    await supabase.from('web_submissions').insert({
      inquiry_type,
      form_data:  formData,
      ip_address: req.headers.get('x-forwarded-for') ?? null,
    });

    // ── 2. Find or create contact ───────────────────────────
    const cleanPhone = formData.phone.replace(/\D/g, '');
    let contactId: string | null = null;

    const { data: existing } = await supabase
      .from('contacts').select('id')
      .or(`phone.eq.+${cleanPhone},phone.eq.${cleanPhone}`)
      .maybeSingle();

    if (existing) {
      contactId = existing.id;
      // Update with any new info
      await supabase.from('contacts').update({
        name:      formData.name,
        email:     formData.email || undefined,
        job_title: formData.job_title || undefined,
      }).eq('id', contactId);
    } else {
      const clientTypeMap: Record<string, string> = {
        leasing:  'existing_tenant',
        prospect: 'potential',
        vendor:   'vendor',
        visitor:  'visitor',
        event:    'visitor',
        general:  'potential',
      };
      // Build contact payload — exclude columns that may not exist in schema cache yet
      const contactPayload: any = {
        name:   formData.name,
        phone:  `+${cleanPhone}`,
        email:  formData.email || null,
        source: 'web',
      };
      // Add optional columns safely — if schema cache is stale, omit them
      try {
        contactPayload.job_title   = formData.job_title || null;
        contactPayload.client_type = clientTypeMap[inquiry_type] ?? 'potential';
        contactPayload.company_name = formData.company_name || null;
      } catch (_) { /* ignore if columns don't exist yet */ }

      const { data: newContact, error: cErr } = await supabase.from('contacts')
        .insert(contactPayload).select('id').single();

      if (cErr) throw new Error('Contact creation failed: ' + cErr.message);
      contactId = newContact.id;
    }

    // ── 3. Find routing → department ────────────────────────
    let departmentId: string | null = null;

    const { data: routing } = await supabase
      .from('intake_routing').select('department_name, default_priority')
      .eq('inquiry_type', inquiry_type).maybeSingle();

    if (routing?.department_name) {
      const { data: dept } = await supabase
        .from('departments').select('id')
        .ilike('name', `%${routing.department_name}%`)
        .maybeSingle();
      departmentId = dept?.id ?? null;
    }

    // Fallback: any available department
    if (!departmentId) {
      const { data: anyDept } = await supabase
        .from('departments').select('id').limit(1).maybeSingle();
      departmentId = anyDept?.id ?? null;
    }

    // ── 4. Find best matching category ─────────────────────
    let categoryId: string | null = null;
    const categoryHint = formData.category || formData.event_type || '';
    if (categoryHint) {
      const { data: cat } = await supabase.from('case_categories')
        .select('id').eq('inquiry_type', inquiry_type)
        .ilike('name', `%${categoryHint}%`).maybeSingle();
      categoryId = cat?.id ?? null;
    }
    if (!categoryId) {
      const { data: cat } = await supabase.from('case_categories')
        .select('id').eq('inquiry_type', inquiry_type)
        .order('sort_order').limit(1).maybeSingle();
      categoryId = cat?.id ?? null;
    }

    // ── 5. Build case notes (structured for staff) ──────────
    const buildNotes = (type: string, d: any): string => {
      const lines: string[] = ['[Web Form Submission]', ''];
      const add = (label: string, val: any) => { if (val) lines.push(`${label}: ${val}`); };

      add('Inquiry type', type.charAt(0).toUpperCase() + type.slice(1));
      add('Name',         d.name);
      add('Phone',        d.phone);
      add('Email',        d.email);
      add('Company',      d.company_name);
      add('Job title',    d.job_title);

      if (type === 'leasing' || type === 'prospect') {
        add('Unit / Floor',     `${d.unit || ''} ${d.floor || ''}`.trim());
        add('Contract No.',     d.contract_number);
        add('Preferred area',   d.preferred_area);
        add('Budget (KWD/m)',   d.budget);
        add('Move-in date',     d.move_in_date);
        add('Unit type wanted', d.unit_type);
      }
      if (type === 'vendor') {
        add('Service type',  d.service_type);
        add('CR / License',  d.cr_number);
        add('Website',       d.website);
        add('Speciality',    d.speciality);
      }
      if (type === 'event') {
        add('Event type',        d.event_type);
        add('Requested date',    d.requested_date);
        add('Start time',        d.start_time);
        add('Duration',          d.duration);
        add('Crew / Team size',  d.crew_size);
        add('Equipment',         d.equipment);
        add('Location in tower', d.location_in_tower);
        add('Purpose / Brief',   d.purpose);
        add('Permit required',   d.permit_needed ? 'Yes' : null);
        add('Insurance',         d.has_insurance ? 'Yes — ' + (d.insurance_details || '') : null);
      }
      if (type === 'visitor') {
        add('Host / Meeting with', d.host_name);
        add('Purpose',             d.purpose);
        add('Visit date',          d.visit_date);
        add('ID / Passport',       d.id_number);
        add('Vehicle plate',       d.vehicle_plate);
      }
      if (d.notes) { lines.push(''); lines.push('Additional notes:'); lines.push(d.notes); }
      return lines.join('\n');
    };

    const ref      = makeRef();
    const subject  = buildSubject(inquiry_type, formData);
    const priority = getPriority(inquiry_type, formData) as any;
    const notes    = buildNotes(inquiry_type, formData);

    // ── 6. Create case ──────────────────────────────────────
    const { data: newCase, error: caseErr } = await supabase.from('cases').insert({
      contact_id:    contactId,
      department_id: departmentId,
      category_id:   categoryId,
      inquiry_type,
      channel:       'web',
      subject,
      priority,
      status:        'new',
      notes,
      // Store reference in notes for now
    }).select('id').single();

    if (caseErr) throw new Error('Case creation failed: ' + caseErr.message);

    // Link submission to case
    await supabase.from('web_submissions').update({ case_id: newCase.id })
      .eq('form_data->>phone', formData.phone)
      .order('created_at', { ascending: false }).limit(1);

    // Notification for assigned dept users
    if (departmentId) {
      const { data: deptUsers } = await supabase.from('profiles')
        .select('id').eq('department_id', departmentId);
      if (deptUsers?.length) {
        await supabase.from('notifications').insert(
          deptUsers.map((u: any) => ({
            user_id:  u.id,
            type:     'case_assigned',
            title:    `New web enquiry: ${formData.name}`,
            body:     subject,
            link:     '/follow-up',
            case_id:  newCase.id,
          }))
        );
      }
    }

    return json({
      ok:        true,
      reference: ref,
      case_id:   newCase.id,
      message:   'Your request has been received. Our team will contact you shortly.',
    });

  } catch (err: any) {
    console.error('intake-form error:', err);
    return json({ error: err.message }, 500);
  }
});
