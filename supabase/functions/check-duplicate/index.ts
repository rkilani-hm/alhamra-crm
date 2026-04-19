// check-duplicate — AI-powered duplicate detection for contacts and organizations.
// Searches DB for candidates, then uses Claude to assess semantic similarity.
// Called before creating any contact or organization.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  'https://alhamra-crm.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Auth check
  const token = (req.headers.get('Authorization') ?? '').slice(7);
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { entity_type, name, phone, email, exclude_id } = body;
  // entity_type: 'contact' | 'organization'

  if (!entity_type || !name) return json({ error: 'entity_type and name required' }, 400);

  try {
    // ── Step 1: DB search for candidates ──────────────────
    let candidates: any[] = [];

    if (entity_type === 'contact') {
      // Search by name similarity, phone, or email
      const { data: byName } = await supabase
        .from('contacts')
        .select('id,name,phone,email,job_title,organization_id,organizations(name)')
        .ilike('name', `%${name.split(' ')[0]}%`)  // first word of name
        .limit(10);

      let byPhone: any[] = [], byEmail: any[] = [];
      if (phone) {
        const clean = phone.replace(/\D/g, '').slice(-8); // last 8 digits
        const { data } = await supabase
          .from('contacts').select('id,name,phone,email,job_title')
          .ilike('phone', `%${clean}%`).limit(5);
        byPhone = data ?? [];
      }
      if (email) {
        const { data } = await supabase
          .from('contacts').select('id,name,phone,email,job_title')
          .ilike('email', `%${email.split('@')[0]}%`).limit(5);
        byEmail = data ?? [];
      }

      // Merge + deduplicate candidates
      const seen = new Set<string>();
      for (const r of [...(byName ?? []), ...byPhone, ...byEmail]) {
        if (!seen.has(r.id) && r.id !== exclude_id) {
          seen.add(r.id);
          candidates.push(r);
        }
      }

    } else {
      // organization — search by name
      const words = name.split(/\s+/).filter((w: string) => w.length > 3);
      const firstWord = words[0] ?? name.slice(0, 5);

      const { data: byName } = await supabase
        .from('organizations')
        .select('id,name,phone,email,type,sap_bp_number')
        .ilike('name', `%${firstWord}%`)
        .limit(10);

      candidates = (byName ?? []).filter((r: any) => r.id !== exclude_id);
    }

    if (candidates.length === 0) {
      return json({ is_duplicate: false, confidence: 0, candidates: [], reason: 'No similar records found.' });
    }

    // ── Step 2: Claude assessment ──────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      // Fallback: simple string matching without AI
      const exact = candidates.find((c: any) => {
        const nameSim = c.name?.toLowerCase() === name.toLowerCase();
        const phoneSim = phone && c.phone && c.phone.replace(/\D/g,'').slice(-8) === phone.replace(/\D/g,'').slice(-8);
        const emailSim = email && c.email && c.email.toLowerCase() === email.toLowerCase();
        return nameSim || phoneSim || emailSim;
      });
      if (exact) {
        return json({ is_duplicate: true, confidence: 95, matched: exact, candidates,
          reason: `Exact match found: "${exact.name}"` });
      }
      return json({ is_duplicate: false, confidence: 0, candidates,
        reason: 'No exact match (AI unavailable for fuzzy check).' });
    }

    const incoming = entity_type === 'contact'
      ? `Name: ${name}\nPhone: ${phone || 'n/a'}\nEmail: ${email || 'n/a'}`
      : `Name: ${name}\nPhone: ${phone || 'n/a'}\nEmail: ${email || 'n/a'}`;

    const existingList = candidates.slice(0, 8).map((c: any, i: number) =>
      `[${i+1}] Name: ${c.name} | Phone: ${c.phone || 'n/a'} | Email: ${c.email || 'n/a'}${entity_type === 'organization' ? ` | Type: ${c.type || 'n/a'}` : ''}`
    ).join('\n');

    const prompt = `You are a CRM data quality assistant for Al Hamra Real Estate Kuwait.
Determine if a new ${entity_type} being created is a duplicate of any existing record.

NEW ${entity_type.toUpperCase()} TO CREATE:
${incoming}

EXISTING RECORDS IN DATABASE:
${existingList}

RULES:
- Same phone number (ignoring spaces/country code) = definite duplicate
- Same email address = definite duplicate  
- Very similar name (same person/company with slight spelling variation) = likely duplicate
- Same name but clearly different person/branch = NOT a duplicate
- Arabic vs English name of the same entity = duplicate
- Company abbreviation vs full name = duplicate (e.g. "ROYALTECH" = "Royaltech Electrical and Contracting")

Respond ONLY with valid JSON, no other text:
{
  "is_duplicate": true/false,
  "confidence": 0-100,
  "matched_index": null or 1-based index of the matching record,
  "reason": "one sentence explanation"
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) throw new Error('AI service unavailable');
    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text?.trim() ?? '{}';

    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { is_duplicate: false, confidence: 0 }; }

    const matchedRecord = parsed.matched_index ? candidates[parsed.matched_index - 1] : null;

    return json({
      is_duplicate:  parsed.is_duplicate  ?? false,
      confidence:    parsed.confidence    ?? 0,
      matched:       matchedRecord,
      candidates:    candidates.slice(0, 5),
      reason:        parsed.reason ?? '',
    });

  } catch (e: any) {
    console.error('check-duplicate error:', e);
    return json({ error: e.message }, 500);
  }
});
