import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaChannel, WaConversation } from '@/types';
import { toast } from 'sonner';
import { MessageSquare, RefreshCw, Maximize2, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ContactPanel from './ContactPanel';

// ── Global iFrame (shows ALL Wazzup24 chats including history) ─
const GlobalIFrame = ({
  onContactSelected,
}: {
  onContactSelected: (chatId: string, channelId: string, name?: string) => void;
}) => {
  const [url,     setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const { data: res, error: e } = await supabase.functions.invoke('wazzup-iframe', {
        body: { scope: 'global' },
      });

      if (e || res?.error) {
        setError(e?.message ?? res?.error ?? 'Failed to load inbox');
      } else if (res?.url) {
        setUrl(res.url);
      }
      setLoading(false);
    });
  }, []);

  // Listen for postMessage events from the Wazzup24 iFrame
  // Wazzup fires WZ_OUTPUT_MESSAGE when agent opens a chat
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const d = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (d?.type === 'WZ_OUTPUT_MESSAGE' && d?.data) {
          const { chatId, channelId, chatType } = d.data;
          if (chatType === 'whatsapp' && chatId && channelId) {
            onContactSelected(chatId, channelId);
          }
        }
      } catch { /* ignore parse errors */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onContactSelected]);

  if (loading) return (
    <div className="flex flex-1 items-center justify-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      <span className="text-sm text-muted-foreground">Loading Wazzup24 inbox…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 max-w-sm text-center space-y-2">
        <p className="font-medium">Could not load Wazzup24 inbox</p>
        <p className="text-xs">{error}</p>
        <p className="text-xs text-muted-foreground">Check that WAZZUP_API_KEY is set in Supabase edge function secrets</p>
      </div>
    </div>
  );

  return (
    <iframe
      ref={iframeRef}
      src={url!}
      className="flex-1 border-0 w-full h-full"
      allow="clipboard-write; microphone; camera"
      title="Wazzup24 — All chats"
    />
  );
};

// ── Scoped iFrame (single contact) ───────────────────────────
const ScopedIFrame = ({ conversation }: { conversation: WaConversation }) => {
  const [url,     setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUrl(null);
    setLoading(true);
    supabase.auth.getUser().then(async ({ data }) => {
      const { data: res } = await supabase.functions.invoke('wazzup-iframe', {
        body: {
          scope:     'card',
          chatId:    conversation.chat_id,
          chatType:  'whatsapp',
          channelId: conversation.channel_id,
        },
      });
      if (res?.url) setUrl(res.url);
      setLoading(false);
    });
  }, [conversation.id]);

  if (loading) return (
    <div className="flex flex-1 items-center justify-center gap-3">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      <span className="text-sm text-muted-foreground">Loading chat…</span>
    </div>
  );

  return url
    ? <iframe key={url} src={url} className="flex-1 border-0 w-full h-full" allow="clipboard-write; microphone; camera" title="Chat" />
    : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Could not load chat</div>;
};

// ── Main inbox ────────────────────────────────────────────────
const WhatsAppInbox = () => {
  const qc = useQueryClient();
  const [activeConvo,   setActiveConvo]   = useState<WaConversation | null>(null);
  const [showPanel,     setShowPanel]     = useState(true);
  const [globalMode,    setGlobalMode]    = useState(true); // true = show full Wazzup24 inbox

  // Channels (just to check connection status)
  const { data: channels = [] } = useQuery<WaChannel[]>({
    queryKey: ['wa_channels'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('wa_channels').select('*').order('phone');
      return (data ?? []) as WaChannel[];
    },
  });

  // Recent conversations from DB
  const { data: conversations = [] } = useQuery<WaConversation[]>({
    queryKey: ['wa_conversations_all'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('*, contacts(id,name,phone,email), wa_channels(phone,label)')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);
      return (data ?? []) as WaConversation[];
    },
  });

  // When agent clicks a contact inside the global iFrame
  const handleContactSelected = useCallback(async (chatId: string, channelId: string) => {
    // Check if conversation already exists in DB
    const existing = conversations.find(c => c.channel_id === channelId && c.chat_id === chatId);
    if (existing) {
      setActiveConvo(existing);
      setGlobalMode(false);
      return;
    }

    // Create it on the fly
    const { data: conv } = await (supabase as any)
      .from('wa_conversations')
      .upsert({ channel_id: channelId, chat_id: chatId }, { onConflict: 'channel_id,chat_id' })
      .select('*, contacts(id,name,phone,email), wa_channels(phone,label)')
      .single();

    if (conv) {
      qc.invalidateQueries({ queryKey: ['wa_conversations_all'] });
      setActiveConvo(conv as WaConversation);
      setGlobalMode(false);
      setShowPanel(true);
    }
  }, [conversations, qc]);

  // Sync channels + update webhook subscription
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_channels'] });
      toast.success(`Synced ${data?.channels ?? 0} channels · webhook updated`);
    },
    onError: (e: any) => toast.error('Sync failed: ' + e.message),
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border bg-background"
      style={{ height: 'calc(100vh - 64px)', margin: '-2rem' }}
    >
      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b px-4 bg-card">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-green-600" />
          <span className="font-semibold text-sm">WhatsApp</span>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
              {totalUnread}
            </span>
          )}
          {channels.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {channels.length} number{channels.length > 1 ? 's' : ''} connected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          {activeConvo && (
            <div className="flex rounded-lg border text-xs overflow-hidden">
              <button
                onClick={() => setGlobalMode(true)}
                className={cn('px-3 py-1.5 transition-colors', globalMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                All chats
              </button>
              <button
                onClick={() => setGlobalMode(false)}
                className={cn('px-3 py-1.5 transition-colors', !globalMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {activeConvo.contacts?.name ?? `+${activeConvo.chat_id}`}
              </button>
            </div>
          )}

          {/* Toggle contact panel */}
          {activeConvo && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPanel(p => !p)} title="Toggle contact panel">
              <PanelRight className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Sync button */}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} title="Sync channels">
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', syncMutation.isPending && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main: global iFrame OR scoped iFrame */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {channels.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
                <MessageSquare className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
                <p className="text-sm text-muted-foreground mt-1">No channels connected yet</p>
              </div>
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                <RefreshCw className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')} />
                {syncMutation.isPending ? 'Connecting…' : 'Connect Wazzup24 channels'}
              </Button>
            </div>
          ) : globalMode ? (
            <GlobalIFrame onContactSelected={handleContactSelected} />
          ) : activeConvo ? (
            <ScopedIFrame conversation={activeConvo} />
          ) : (
            <GlobalIFrame onContactSelected={handleContactSelected} />
          )}
        </div>

        {/* Right: contact + case panel */}
        {activeConvo && showPanel && !globalMode && (
          <ContactPanel conversation={activeConvo} />
        )}
      </div>
    </div>
  );
};

export default WhatsAppInbox;
