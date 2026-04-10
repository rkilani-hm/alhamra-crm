import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaChannel, WaConversation } from '@/types';
import { toast } from 'sonner';
import { MessageSquare, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConversationList from './ConversationList';
import ContactPanel     from './ContactPanel';

// ── iFrame-based chat view (works for both live & historical) ─
const WazzupIFrame = ({ conversation, username }: { conversation: WaConversation; username: string }) => {
  const [url, setUrl]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setLoading(true);
    setError(null);

    supabase.functions
      .invoke('wazzup-iframe', {
        body: {
          chatId:    conversation.chat_id,
          chatType:  'whatsapp',
          channelId: conversation.channel_id,
          username,
          userId:    `crm-${conversation.id}`,
          scope:     'card',
        },
      })
      .then(({ data, error: e }) => {
        if (e || data?.error) {
          setError(e?.message ?? data?.error ?? 'Failed to load chat');
        } else if (data?.url) {
          setUrl(data.url);
        }
        setLoading(false);
      });
  }, [conversation.id]);

  if (loading) return (
    <div className="flex flex-1 items-center justify-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      <span className="text-sm text-muted-foreground">Loading chat history…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-1 items-center justify-center">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 max-w-sm text-center">
        <p className="font-medium mb-1">Could not load chat</p>
        <p className="text-xs">{error}</p>
      </div>
    </div>
  );

  return (
    <iframe
      key={url}
      src={url!}
      className="flex-1 border-0 w-full h-full"
      allow="clipboard-write; microphone; camera"
      title="Wazzup24 Chat"
    />
  );
};

// ── Main inbox component ──────────────────────────────────────
const WhatsAppInbox = () => {
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeConvo,   setActiveConvo]   = useState<WaConversation | null>(null);

  // Current user name for iFrame
  const [agentName, setAgentName] = useState('CRM Agent');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle()
          .then(({ data: p }) => { if (p?.full_name) setAgentName(p.full_name); });
      }
    });
  }, []);

  // Channels
  const { data: channels = [] } = useQuery<WaChannel[]>({
    queryKey: ['wa_channels'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('wa_channels').select('*').order('phone');
      return (data ?? []) as WaChannel[];
    },
  });

  useEffect(() => {
    if (channels.length && !activeChannel) setActiveChannel(channels[0].channel_id);
  }, [channels, activeChannel]);

  // Conversations for active channel
  const { data: conversations = [], isLoading: convosLoading } = useQuery<WaConversation[]>({
    queryKey: ['wa_conversations', activeChannel],
    enabled: !!activeChannel,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('*, contacts(id,name,phone,email), wa_channels(phone,label)')
        .eq('channel_id', activeChannel!)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      return (data ?? []) as WaConversation[];
    },
  });

  // Realtime
  useEffect(() => {
    const sub = supabase
      .channel('wa-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' },
        () => qc.invalidateQueries({ queryKey: ['wa_conversations'] }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' },
        () => qc.invalidateQueries({ queryKey: ['wa_conversations'] }))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  useEffect(() => {
    if (activeConvo) {
      const updated = conversations.find(c => c.id === activeConvo.id);
      if (updated) setActiveConvo(updated);
    }
  }, [conversations]);

  // ── Sync channels ──────────────────────────────────────────
  const syncChannels = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_channels'] });
      toast.success(`Synced ${data?.channels ?? 0} WhatsApp channels`);
    },
    onError: (e: any) => toast.error('Sync failed: ' + e.message),
  });

  // ── Import ALL historical contacts ─────────────────────────
  const importContacts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-contacts-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      toast.success(
        `Imported ${data?.created ?? 0} contacts · ${data?.matched ?? 0} already existed`
      );
    },
    onError: (e: any) => toast.error('Import failed: ' + e.message),
  });

  const handleSelectConvo = (c: WaConversation) => {
    setActiveConvo(c);
    if (c.unread_count > 0) {
      (supabase as any).from('wa_conversations').update({ unread_count: 0 }).eq('id', c.id);
      qc.setQueryData(['wa_conversations', activeChannel], (old: WaConversation[] | undefined) =>
        (old ?? []).map(x => x.id === c.id ? { ...x, unread_count: 0 } : x)
      );
    }
  };

  const totalConvos = conversations.length;
  const hasHistory  = conversations.some(c => !c.last_message_at); // imported but no messages yet

  return (
    <div
      className="flex overflow-hidden rounded-xl border bg-background"
      style={{ height: 'calc(100vh - 64px)', margin: '-2rem' }}
    >
      {/* Left: conversation list */}
      <ConversationList
        channels={channels}
        conversations={conversations}
        activeChannel={activeChannel}
        activeConvo={activeConvo}
        loading={convosLoading}
        syncing={syncChannels.isPending}
        onChannelChange={id => { setActiveChannel(id); setActiveConvo(null); }}
        onSelectConvo={handleSelectConvo}
        onSync={() => syncChannels.mutate()}
        onImportHistory={() => importContacts.mutate()}
        importingHistory={importContacts.isPending}
      />

      {/* Center: iFrame chat (works for live & historical) */}
      {activeConvo ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Thread header */}
          <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b px-4 bg-card">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold">
              {(activeConvo.contacts?.name ?? activeConvo.chat_id).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {activeConvo.contacts?.name ?? `+${activeConvo.chat_id}`}
              </p>
              <p className="text-[11px] text-muted-foreground">+{activeConvo.chat_id}</p>
            </div>
            {!activeConvo.last_message_at && (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                Historical
              </span>
            )}
          </div>
          <WazzupIFrame conversation={activeConvo} username={agentName} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
            <MessageSquare className="h-8 w-8 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {channels.length === 0
                ? 'Click the sync button to connect your Wazzup24 channels'
                : totalConvos === 0
                ? 'Import your contact history to see all previous conversations'
                : 'Select a conversation to view full chat history'}
            </p>
          </div>

          {/* Import history CTA — shown when channels exist but no history imported */}
          {channels.length > 0 && totalConvos === 0 && (
            <Button
              onClick={() => importContacts.mutate()}
              disabled={importContacts.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {importContacts.isPending
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Importing…</>
                : <><Download className="h-4 w-4" /> Import all Wazzup24 contacts</>
              }
            </Button>
          )}
        </div>
      )}

      {/* Right: contact + case panel */}
      {activeConvo && <ContactPanel conversation={activeConvo} />}
    </div>
  );
};

export default WhatsAppInbox;
