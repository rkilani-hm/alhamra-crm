// Edge Function: wazzup-send
// Sends a WhatsApp message via Wazzup24 API.
// Supports text, image, document, audio, and video messages.
// When conversationId is omitted, creates a new wa_conversation automatically.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getCorsHeaders(origin: string | null) {
  const allowedOrigins = new Set([
    'https://alhamra-crm.lovable.app',
    'https://id-preview--ac11a577-7c5a-457e-a96f-591a93a399c0.lovable.app',
    'https://ac11a577-7c5a-457e-a96f-591a93a399c0.lovableproject.com',
  ]);

  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://alhamra-crm.lovable.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
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


// ── M3: In-memory rate limiting (30 msgs / user / minute) ────
// Uses Deno's module-level Map which persists per isolate instance
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT   = 30;   // max messages per window
const RATE_WINDOW  = 60_000; // 1 minute in ms

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now  = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

serve(async (req) => {
  const CORS = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // C6: Verify caller role
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const auth = await verifyCallerRole(req, supabaseAdmin, ['frontdesk', 'manager']);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // M3: Rate limit check
  const callerToken2 = (req.headers.get('Authorization') ?? '').slice(7);
  const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(callerToken2);
  if (callerUser) {
    const rl = checkRateLimit(callerUser.id);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s` }), {
        status: 429,
        headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      });
    }
  }


  try {
    const body = await req.json();
    const { channelId, chatId, text, conversationId, contentUri, msgType } = body;

    // text OR contentUri must be provided
    if (!channelId || !chatId || (!text && !contentUri)) {
      return new Response(JSON.stringify({ error: 'channelId, chatId and (text or contentUri) are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('WAZZUP_API_KEY');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Resolve or create conversation ────────────────────
    let convId: string = conversationId;

    if (!convId) {
      const { data: conv, error: convErr } = await supabase
        .from('wa_conversations')
        .upsert(
          { channel_id: channelId, chat_id: chatId },
          { onConflict: 'channel_id,chat_id', ignoreDuplicates: false }
        )
        .select('id, contact_id')
        .single();

      if (convErr || !conv) throw new Error('Could not create conversation: ' + convErr?.message);
      convId = conv.id;
    }

    // ── 2. Build Wazzup24 payload ─────────────────────────────
    const wazzupPayload: Record<string, unknown> = {
      channelId,
      chatType:     'whatsapp',
      chatId,
      crmMessageId: crypto.randomUUID(),
    };

    if (contentUri) {
      // Media message — Wazzup uses contentUri for images/documents/etc.
      wazzupPayload.contentUri = contentUri;
      if (text) wazzupPayload.text = text; // caption
    } else {
      wazzupPayload.text = text;
    }

    // ── 3. Send via Wazzup24 ──────────────────────────────────
    const wazzupRes = await fetch('https://api.wazzup24.com/v3/message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(wazzupPayload),
    });

    const wazzupData = await wazzupRes.json().catch(() => ({}));

    if (!wazzupRes.ok) {
      throw new Error(`Wazzup24 error ${wazzupRes.status}: ${JSON.stringify(wazzupData)}`);
    }

    // ── 4. Store outbound message locally ─────────────────────
    const sentAt = new Date().toISOString();
    const effectiveMsgType = msgType ?? (contentUri ? 'image' : 'text');
    const displayBody = text || (contentUri ? `[${effectiveMsgType}]` : '');

    const { data: msg, error: msgErr } = await supabase.from('wa_messages').insert({
      wazzup_id:       wazzupData.messageId ?? crypto.randomUUID(),
      conversation_id: convId,
      direction:       'outbound',
      msg_type:        effectiveMsgType,
      body:            displayBody,
      media_url:       contentUri ?? null,
      status:          'sent',
      sent_at:         sentAt,
    }).select().single();

    if (msgErr) throw msgErr;

    // ── 5. Update conversation last_message ───────────────────
    await supabase.from('wa_conversations').update({
      last_message:    displayBody.slice(0, 200),
      last_message_at: sentAt,
    }).eq('id', convId);

    return new Response(JSON.stringify({ ok: true, message: msg, conversationId: convId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Send error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
