// LocalWhatsAppChannels — Two-tab page:
//   "Inbox"    — conversation list + chat thread for local WA numbers
//   "Channels" — QR instance management (connect/disconnect numbers)
// Sends via local-wa-api edge function (Evolution API on Railway).
// Completely separate from Wazzup24 inbox at /whatsapp.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, RefreshCw, Smartphone, Wifi, WifiOff, Loader2,
  QrCode, Trash2, LogOut, CheckCircle2, AlertCircle,
  Info, ExternalLink, MessageSquare, Send, Clock,
  User, Phone, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface WaInstance {
  id: string; instance_name: string; label: string; phone: string | null;
  state: 'disconnected'|'connecting'|'qr'|'connected'|'refused'|'error';
  qr_code: string | null; qr_updated_at: string | null;
  connected_at: string | null; channel_id: string | null; created_at: string;
}
interface Conversation {
  id: string; channel_id: string; chat_id: string;
  contact_id: string | null; last_message: string | null;
  last_message_at: string | null; unread_count: number;
  contacts?: { name: string; phone: string | null; email: string | null } | null;
}
interface Message {
  id: string; conversation_id: string; direction: 'inbound'|'outbound';
  msg_type: string; body: string | null; media_url: string | null;
  sender_name: string | null; status: string; sent_at: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const instanceNameFromChannelId = (channelId: string) => channelId.replace(/^local_/, '');

const StateBadge = ({ state }: { state: WaInstance['state'] }) => {
  const cfg: Record<string, { label: string; icon: any; cls: string }> = {
    connected:    { label: 'Connected',    icon: CheckCircle2, cls: 'text-green-700 bg-green-100 border-green-200'   },
    qr:           { label: 'Scan QR',      icon: QrCode,       cls: 'text-blue-700 bg-blue-100 border-blue-200'     },
    connecting:   { label: 'Connecting…',  icon: Loader2,      cls: 'text-amber-700 bg-amber-100 border-amber-200'  },
    disconnected: { label: 'Disconnected', icon: WifiOff,      cls: 'text-gray-600 bg-gray-100 border-gray-200'     },
    refused:      { label: 'Refused',      icon: AlertCircle,  cls: 'text-red-700 bg-red-100 border-red-200'        },
    error:        { label: 'Error',        icon: AlertCircle,  cls: 'text-red-700 bg-red-100 border-red-200'        },
  };
  const { label, icon: Icon, cls } = cfg[state] ?? cfg.disconnected;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls)}>
      <Icon className={cn('h-3 w-3', state === 'connecting' && 'animate-spin')} />{label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// QR Card (inside Channels tab)
// ─────────────────────────────────────────────────────────────
const QrCard = ({ instance, onRefresh }: { instance: WaInstance; onRefresh: () => void }) => {
  const [sec, setSec] = useState(60);
  useEffect(() => {
    if (instance.state !== 'qr' || !instance.qr_updated_at) return;
    const elapsed = Math.floor((Date.now() - new Date(instance.qr_updated_at).getTime()) / 1000);
    setSec(Math.max(0, 60 - elapsed));
    const t = setInterval(() => setSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [instance.qr_updated_at, instance.state]);

  if (instance.state !== 'qr' || !instance.qr_code) return null;
  const src = instance.qr_code.startsWith('data:') ? instance.qr_code : `data:image/png;base64,${instance.qr_code}`;
  return (
    <div className="mt-3 mb-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-4 flex flex-col items-center gap-3">
      <p className="text-xs font-semibold text-blue-800 text-center">
        Open WhatsApp → Settings → Linked Devices → Link a device → Scan QR
      </p>
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <img src={src} alt="WhatsApp QR Code" className="h-44 w-44" />
      </div>
      <div className="flex items-center gap-3 text-xs text-blue-700">
        <span>Expires in {sec}s</span>
        {sec < 10 && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Instance Card (Channels tab)
// ─────────────────────────────────────────────────────────────
const InstanceCard = ({ instance }: { instance: WaInstance }) => {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      const { data, error } = await supabase.functions.invoke('local-wa-api', {
        body: { action, instanceName: instance.instance_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      if (action === 'logout') toast.success('Disconnected');
      if (action === 'delete') toast.success('Instance deleted');
      if (action === 'connect') toast.success('Fetching QR code…');
    },
    onError: (e: any) => toast.error(e.message, { duration: 5000 }),
  });

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/20">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          instance.state === 'connected' ? 'bg-green-100' : 'bg-muted')}>
          <Smartphone className={cn('h-5 w-5', instance.state === 'connected' ? 'text-green-600' : 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{instance.label}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {instance.phone ? `+${instance.phone}` : instance.instance_name}
          </p>
        </div>
        <StateBadge state={instance.state} />
      </div>
      <div className="px-5">
        <QrCard instance={instance} onRefresh={() => act.mutate({ action: 'connect' })} />
      </div>
      {instance.connected_at && instance.state === 'connected' && (
        <div className="px-5 py-2 text-xs text-muted-foreground">
          <Wifi className="h-3 w-3 inline mr-1 text-green-500" />
          Connected {formatDistanceToNow(new Date(instance.connected_at), { addSuffix: true })}
        </div>
      )}
      <div className="flex items-center gap-2 px-5 py-3 border-t bg-muted/10">
        {['disconnected','error','refused'].includes(instance.state) && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={act.isPending}
            onClick={() => act.mutate({ action: 'connect' })}>
            <QrCode className="h-3.5 w-3.5" />{act.isPending ? 'Loading…' : 'Connect via QR'}
          </Button>
        )}
        {instance.state === 'connected' && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
            disabled={act.isPending} onClick={() => act.mutate({ action: 'logout' })}>
            <LogOut className="h-3.5 w-3.5" /> Disconnect
          </Button>
        )}
        {instance.state === 'qr' && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={act.isPending}
            onClick={() => act.mutate({ action: 'connect' })}>
            <RefreshCw className={cn('h-3.5 w-3.5', act.isPending && 'animate-spin')} /> Refresh QR
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-red-50"
          disabled={act.isPending}
          onClick={() => { if (window.confirm(`Delete "${instance.label}"?`)) act.mutate({ action: 'delete' }); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Add Instance Modal
// ─────────────────────────────────────────────────────────────
const AddInstanceModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [name,  setName]  = useState('');

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !label.trim()) throw new Error('Label and instance name are required');
      const { data, error } = await supabase.functions.invoke('local-wa-api', {
        body: { action: 'create_instance', instanceName: name.trim(), data: { label: label.trim() } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.setup ? '\n\n' + data.setup : ''));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      toast.success('Instance created — scan the QR code to connect');
      setLabel(''); setName(''); onClose();
    },
    onError: (e: any) => toast.error(e.message, { duration: 8000 }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add WhatsApp Number</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium">Display label *</label>
            <Input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Sales Line, Leasing Support" className="h-9 mt-1 text-sm" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium">Instance name * (letters, numbers, underscores only)</label>
            <Input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,''))}
              placeholder="e.g. sales_line_1" className="h-9 mt-1 text-sm font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">Cannot be changed after creation</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()}
            disabled={create.isPending || !label.trim() || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create & get QR'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// Chat Thread (Inbox tab — right panel)
// ─────────────────────────────────────────────────────────────
const LocalChatThread = ({ conversation }: { conversation: Conversation }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['local-wa-messages', conversation.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_messages').select('*')
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true }).limit(200);
      return data ?? [];
    },
    refetchInterval: 3000,
  });

  // Realtime
  useEffect(() => {
    const sub = supabase.channel(`local-chat-${conversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages',
        filter: `conversation_id=eq.${conversation.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['local-wa-messages', conversation.id] });
      }).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [conversation.id, qc]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');

    const instanceName = instanceNameFromChannelId(conversation.channel_id);

    try {
      const { data, error } = await supabase.functions.invoke('local-wa-api', {
        body: {
          action: 'send_message',
          instanceName,
          data: { to: conversation.chat_id, text: body },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Optimistically write message to DB
      await (supabase as any).from('wa_messages').insert({
        wazzup_id:       `local_out_${Date.now()}`,
        conversation_id: conversation.id,
        direction:       'outbound',
        msg_type:        'text',
        body,
        status:          'sent',
        sent_at:         new Date().toISOString(),
      });
      await (supabase as any).from('wa_conversations').update({
        last_message:    body.slice(0, 200),
        last_message_at: new Date().toISOString(),
      }).eq('id', conversation.id);

      qc.invalidateQueries({ queryKey: ['local-wa-messages', conversation.id] });
      qc.invalidateQueries({ queryKey: ['local-wa-convos'] });
    } catch (e: any) {
      toast.error('Send failed: ' + e.message);
      setText(body);
    } finally {
      setSending(false);
    }
  }, [text, sending, conversation, qc]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const contactName = conversation.contacts?.name ?? `+${conversation.chat_id}`;
  const channelLabel = instanceNameFromChannelId(conversation.channel_id).replace(/_/g,' ');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 font-semibold text-sm shrink-0">
          {contactName.slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground">via {channelLabel}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[72%] rounded-2xl px-3 py-2 text-sm',
              msg.direction === 'outbound'
                ? 'bg-[#CD1719] text-white rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm')}>
              {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}
              {msg.media_url && (
                <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs underline opacity-80">[media]</a>
              )}
              <p className={cn('text-[10px] mt-1 text-right',
                msg.direction === 'outbound' ? 'text-red-100' : 'text-muted-foreground')}>
                {format(new Date(msg.sent_at), 'HH:mm')}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Send bar */}
      <div className="flex items-end gap-2 px-4 py-3 border-t shrink-0">
        <Textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1} className="flex-1 min-h-9 max-h-28 resize-none text-sm" />
        <Button size="icon" disabled={!text.trim() || sending} onClick={send}
          className="h-9 w-9 shrink-0 bg-[#CD1719] hover:bg-[#b01215]">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Inbox Tab — conversation list + chat thread
// ─────────────────────────────────────────────────────────────
const LocalInbox = ({ instances }: { instances: WaInstance[] }) => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Conversation | null>(null);

  const { data: convos = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['local-wa-convos'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('*, contacts(name, phone, email)')
        .like('channel_id', 'local_%')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  // Realtime
  useEffect(() => {
    const sub = supabase.channel('local-convos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['local-wa-convos'] });
      }).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  const connected = instances.filter(i => i.state === 'connected');

  if (connected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <WifiOff className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">No connected WhatsApp numbers</p>
        <p className="text-xs text-muted-foreground mt-1">
          Go to the <strong>Channels</strong> tab to connect a number via QR code
        </p>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-xl border" style={{ height: 'calc(100vh - 180px)' }}>
      {/* Left — conversation list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #e5e5e5',
        display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>
            Local Inbox
          </p>
          <p style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
            {connected.map(i => i.label).join(' · ')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && convos.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
              No conversations yet — messages will appear here
            </div>
          )}
          {convos.map(c => {
            const name = c.contacts?.name ?? `+${c.chat_id}`;
            const isActive = selected?.id === c.id;
            return (
              <button key={c.id} onClick={() => setSelected(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', textAlign: 'left',
                  background: isActive ? '#fff5f5' : 'transparent',
                  borderLeft: isActive ? '3px solid #CD1719' : '3px solid transparent',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', background: '#f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#666', flexShrink: 0,
                }}>
                  {name.slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, truncate: true, color: '#1D1D1B' }}>{name}</p>
                    {c.last_message_at && (
                      <p style={{ fontSize: 10, color: '#aaa', flexShrink: 0, marginLeft: 4 }}>
                        {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false })}
                      </p>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_message ?? 'No messages yet'}
                  </p>
                </div>
                {(c.unread_count ?? 0) > 0 && (
                  <span style={{
                    background: '#CD1719', color: '#fff', borderRadius: 10,
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', flexShrink: 0,
                  }}>
                    {c.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right — chat thread */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <LocalChatThread key={selected.id} conversation={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Setup Guide
// ─────────────────────────────────────────────────────────────
const SetupGuide = ({ show }: { show: boolean }) => {
  if (!show) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">One-time Railway setup required</p>
      </div>
      <p className="text-sm text-amber-800">
        Local WhatsApp channels use <strong>Evolution API</strong> on Railway (QR-based, no Meta approval needed).
        Complete these steps once, then add numbers above.
      </p>
      <div className="space-y-2 text-xs text-amber-900">
        {[
          { n:'1', t:'Deploy Evolution API on Railway',        d:'Railway project → New Service → Template → "Evolution API". Auto-provisions API + PostgreSQL + Redis.' },
          { n:'2', t:'Set Evolution API environment variables', d:'AUTHENTICATION_TYPE=apikey\nAUTHENTICATION_API_KEY=<strong-key>\nCORS_ORIGIN=https://alhamra-crm.lovable.app' },
          { n:'3', t:'Set Supabase Edge Function secrets',     d:'RAILWAY_WA_URL = https://your-service.up.railway.app\nRAILWAY_WA_API_KEY = <same-key>\nLOCAL_WA_WEBHOOK_SECRET = <any-random-string>' },
          { n:'4', t:'Tell Lovable to deploy',                  d:'local-wa-api\nlocal-wa-webhook  (--no-verify-jwt)\nRun migration: 20260423_local_whatsapp.sql' },
        ].map(({ n, t, d }) => (
          <div key={n} className="flex gap-3 rounded-lg bg-amber-100 border border-amber-200 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white font-bold text-[10px]">{n}</span>
            <div><p className="font-semibold">{t}</p><p className="opacity-80 mt-0.5 whitespace-pre-line font-mono text-[10px]">{d}</p></div>
          </div>
        ))}
      </div>
      <a href="https://railway.com/deploy/evolution-api-4" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-xs text-amber-800 underline font-medium">
        <ExternalLink className="h-3 w-3" /> Open Evolution API Railway template
      </a>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
const LocalWhatsAppChannels = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab]     = useState<'inbox'|'channels'>('inbox');
  const [addOpen, setAddOpen] = useState(false);
  const isManager = profile?.role === 'manager';

  const { data: instances = [], isLoading } = useQuery<WaInstance[]>({
    queryKey: ['local-wa-instances'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('local_wa_instances').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const sub = supabase.channel('local-wa-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_wa_instances' }, () => {
        qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      }).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  const connected = instances.filter(i => i.state === 'connected');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            Local WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {connected.length > 0
              ? `${connected.length} number${connected.length > 1 ? 's' : ''} connected — ${connected.map(i => i.label).join(', ')}`
              : 'No numbers connected — go to Channels tab to connect'}
          </p>
        </div>
        {isManager && tab === 'channels' && (
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add number
          </Button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b">
        {([
          { key: 'inbox',    label: 'Inbox',    icon: MessageSquare },
          { key: 'channels', label: 'Channels', icon: Settings      },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-[#CD1719] text-[#CD1719]'
                : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
            {key === 'inbox' && connected.length > 0 && (
              <span className="ml-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5">
                {connected.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'inbox' && <LocalInbox instances={instances} />}

      {tab === 'channels' && (
        <div className="space-y-5 max-w-4xl">
          {instances.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total numbers', value: instances.length,                    icon: Smartphone },
                { label: 'Connected',     value: connected.length,                    icon: Wifi       },
                { label: 'Offline',       value: instances.length - connected.length, icon: WifiOff    },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                </div>
              ))}
            </div>
          )}

          <SetupGuide show={instances.length === 0 && !isLoading} />

          {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

          {!isLoading && instances.length === 0 && (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No WhatsApp numbers connected yet</p>
              <p className="text-xs text-muted-foreground mt-1">Complete the setup above, then click "Add number"</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instances.map(inst => <InstanceCard key={inst.id} instance={inst} />)}
          </div>
        </div>
      )}

      <AddInstanceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
};

export default LocalWhatsAppChannels;
