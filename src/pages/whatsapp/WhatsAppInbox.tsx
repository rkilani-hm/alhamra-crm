import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Search, RefreshCw, Wifi, WifiOff,
  Phone, User2, ChevronRight, Circle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Channel  { id: string; channel_id: string; phone: string; label: string; state: string; }
interface Convo    { id: string; channel_id: string; chat_id: string; last_message: string; last_message_at: string; unread_count: number; contacts?: { name: string } | null; }

/* ── Conversation list item ─────────────────────────────────── */
const ConvoItem = ({ c, active, onClick }: { c: Convo; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-start gap-3 px-4 py-3.5 text-left border-b transition-colors',
      active
        ? 'bg-primary/8 border-l-2 border-l-primary'
        : 'hover:bg-muted/60 border-l-2 border-l-transparent',
    )}
    style={{ borderBottomColor: 'hsl(var(--border))' }}
  >
    {/* Avatar */}
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold">
      {(c.contacts?.name ?? c.chat_id).slice(0, 2).toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-sm font-medium truncate">{c.contacts?.name ?? `+${c.chat_id}`}</p>
        {c.last_message_at && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
            {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false })}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground truncate">{c.last_message ?? 'No messages yet'}</p>
        {c.unread_count > 0 && (
          <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white shrink-0">
            {c.unread_count > 99 ? '99+' : c.unread_count}
          </span>
        )}
      </div>
    </div>
  </button>
);

/* ── Main component ─────────────────────────────────────────── */
const WhatsAppInbox = () => {
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeConvo,   setActiveConvo]   = useState<Convo | null>(null);
  const [iframeUrl,     setIframeUrl]     = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [search,        setSearch]        = useState('');

  /* Channels */
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['wa_channels'],
    queryFn: async () => {
      const { data } = await supabase.from('wa_channels').select('*').order('phone');
      return data ?? [];
    },
  });

  /* Set first channel on load */
  useEffect(() => {
    if (channels.length && !activeChannel) setActiveChannel(channels[0].channel_id);
  }, [channels]);

  /* Conversations for active channel */
  const { data: convos = [], isLoading: convosLoading } = useQuery<Convo[]>({
    queryKey: ['wa_conversations', activeChannel],
    enabled: !!activeChannel,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('wa_conversations')
        .select('*, contacts(name)')
        .eq('channel_id', activeChannel!)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      return data ?? [];
    },
  });

  /* Realtime subscription */
  useEffect(() => {
    const sub = supabase
      .channel('wa-inbox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, () => {
        qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  /* Load iFrame URL — either full inbox or specific chat */
  const loadIframe = async (convo?: Convo) => {
    setIframeLoading(true);
    setIframeUrl(null);
    try {
      const body = convo
        ? { chatId: convo.chat_id, chatType: 'whatsapp', channelId: convo.channel_id }
        : {};
      const { data, error } = await supabase.functions.invoke('wazzup-iframe', { body });
      if (error) throw error;
      if (data?.url) {
        setIframeUrl(data.url);
        // Mark as read
        if (convo) {
          await supabase.from('wa_conversations').update({ unread_count: 0 }).eq('id', convo.id);
          qc.invalidateQueries({ queryKey: ['wa_conversations'] });
        }
      }
    } catch (e: any) {
      toast.error('Could not load chat: ' + e.message);
    } finally {
      setIframeLoading(false);
    }
  };

  /* Sync channels from Wazzup24 */
  const syncChannels = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_channels'] });
      toast.success(`Synced ${data.channels} WhatsApp channels`);
    },
    onError: (e: any) => toast.error('Sync failed: ' + e.message),
  });

  const filtered = convos.filter(c =>
    !search ||
    c.contacts?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.chat_id.includes(search)
  );

  const totalUnread = convos.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <div className="flex h-[calc(100vh-64px)] -m-8 overflow-hidden rounded-xl border bg-card">

      {/* ── Left: Channel tabs + conversation list ─────────────── */}
      <div className="flex w-80 flex-col border-r">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" />
            <h2 className="font-semibold text-sm">WhatsApp</h2>
            {totalUnread > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
                {totalUnread}
              </span>
            )}
          </div>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => syncChannels.mutate()}
            disabled={syncChannels.isPending}
            title="Sync channels from Wazzup24"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncChannels.isPending && 'animate-spin')} />
          </Button>
        </div>

        {/* Channel tabs */}
        {channels.length > 0 && (
          <div className="flex overflow-x-auto border-b px-2 pt-2 gap-1 scrollbar-thin">
            {channels.map(ch => (
              <button
                key={ch.channel_id}
                onClick={() => { setActiveChannel(ch.channel_id); setActiveConvo(null); setIframeUrl(null); }}
                className={cn(
                  'flex shrink-0 flex-col items-center gap-0.5 rounded-t-lg px-3 pb-2 pt-1.5 text-[10px] transition-colors border-b-2',
                  activeChannel === ch.channel_id
                    ? 'border-green-500 text-green-700 font-semibold bg-green-50'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Phone className="h-3.5 w-3.5" />
                <span>{ch.label ?? ch.phone}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations…"
              className="h-8 pl-8 text-xs"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Open full inbox button */}
        <button
          onClick={() => { setActiveConvo(null); loadIframe(); }}
          className="flex items-center gap-2 border-b px-4 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Open full Wazzup24 inbox
          <ChevronRight className="h-3.5 w-3.5 ml-auto" />
        </button>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {channels.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <WifiOff className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No channels connected</p>
              <Button size="sm" variant="outline" onClick={() => syncChannels.mutate()} disabled={syncChannels.isPending}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync from Wazzup24
              </Button>
            </div>
          )}

          {convosLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          )}

          {!convosLoading && filtered.length === 0 && channels.length > 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-6 w-6 opacity-30" />
              <p>No conversations yet</p>
            </div>
          )}

          {filtered.map(c => (
            <ConvoItem
              key={c.id}
              c={c}
              active={activeConvo?.id === c.id}
              onClick={() => { setActiveConvo(c); loadIframe(c); }}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Wazzup24 iFrame ──────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {!iframeUrl && !iframeLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
              <MessageSquare className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select a conversation or open the full inbox
              </p>
            </div>
            {channels.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 max-w-sm text-left text-sm">
                <p className="font-medium text-amber-800 mb-1">Setup required</p>
                <p className="text-amber-700">
                  Click the sync button above to connect your Wazzup24 channels. Make sure the
                  <code className="mx-1 rounded bg-amber-100 px-1 text-xs">WAZZUP_API_KEY</code>
                  secret is set in Supabase.
                </p>
              </div>
            ) : (
              <Button onClick={() => loadIframe()} className="bg-green-600 hover:bg-green-700 text-white">
                <MessageSquare className="h-4 w-4 mr-2" />
                Open Wazzup24 inbox
              </Button>
            )}
          </div>
        )}

        {iframeLoading && (
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading chat…</span>
          </div>
        )}

        {iframeUrl && (
          <iframe
            key={iframeUrl}
            src={iframeUrl}
            className="flex-1 border-0"
            allow="clipboard-write; microphone; camera"
            title="Wazzup24 Chat"
          />
        )}
      </div>
    </div>
  );
};

export default WhatsAppInbox;
