import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaConversation, WaMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, Smile, Paperclip, Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// Group messages by date
const groupByDate = (messages: WaMessage[]) => {
  const groups: { date: string; messages: WaMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const d = format(new Date(msg.sent_at), 'dd MMM yyyy');
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
};

const TODAY     = format(new Date(), 'dd MMM yyyy');
const YESTERDAY = format(new Date(Date.now() - 86400000), 'dd MMM yyyy');
const friendlyDate = (d: string) => d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : d;

interface Props {
  conversation: WaConversation;
}

type ViewMode = 'local' | 'iframe';

const ChatThread = ({ conversation }: Props) => {
  const qc        = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('iframe');

  // Fetch iframe URL
  const { data: iframeUrl, isLoading: iframeLoading } = useQuery<string | null>({
    queryKey: ['wazzup_iframe', conversation.channel_id, conversation.chat_id],
    enabled: viewMode === 'iframe',
    staleTime: 1000 * 60 * 25, // iframe tokens typically last ~8h, refresh at 25min
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-iframe', {
        body: {
          chatId:    conversation.chat_id,
          chatType:  'whatsapp',
          channelId: conversation.channel_id,
          scope:     'card',
        },
      });
      if (error) throw error;
      return data?.url ?? null;
    },
  });

  // Fetch local messages (for "local" mode)
  const { data: messages = [], isLoading } = useQuery<WaMessage[]>({
    queryKey: ['wa_messages', conversation.id],
    enabled: viewMode === 'local',
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true });
      return (data ?? []) as WaMessage[];
    },
    refetchInterval: 5000,
  });

  // Realtime subscription for this conversation
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'wa_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['wa_messages', conversation.id] });
        qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      })
      .subscribe();

    // Mark as read
    (supabase as any).from('wa_conversations').update({ unread_count: 0 }).eq('id', conversation.id);

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, qc]);

  // Auto-scroll to bottom on new messages (local mode)
  useEffect(() => {
    if (viewMode === 'local') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, viewMode]);

  // Send message (local mode)
  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const { error } = await supabase.functions.invoke('wazzup-send', {
        body: {
          channelId:      conversation.channel_id,
          chatId:         conversation.chat_id,
          text:           body,
          conversationId: conversation.id,
        },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['wa_messages', conversation.id] });
    } catch (e: any) {
      toast.error('Failed to send: ' + e.message);
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const groups = groupByDate(messages);
  const contactName = conversation.contacts?.name ?? `+${conversation.chat_id}`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Thread header */}
      <div
        className="flex h-14 flex-shrink-0 items-center gap-3 border-b px-4"
        style={{ background: 'hsl(var(--card))' }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold">
          {contactName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contactName}</p>
          <p className="text-[11px] text-muted-foreground">+{conversation.chat_id}</p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
          <button
            onClick={() => setViewMode('iframe')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              viewMode === 'iframe'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Full history (Wazzup)"
          >
            <ExternalLink className="h-3 w-3" />
            Full History
          </button>
          <button
            onClick={() => setViewMode('local')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              viewMode === 'local'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Local messages"
          >
            <MessageCircle className="h-3 w-3" />
            Local
          </button>
        </div>

        <a
          href={`tel:+${conversation.chat_id}`}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <Phone className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>

      {/* ─── Iframe mode ─── */}
      {viewMode === 'iframe' && (
        <div className="flex-1 overflow-hidden">
          {iframeLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading chat history…</span>
            </div>
          )}
          {!iframeLoading && iframeUrl && (
            <iframe
              src={iframeUrl}
              className="w-full h-full border-0"
              allow="clipboard-write"
              title="Wazzup Chat"
            />
          )}
          {!iframeLoading && !iframeUrl && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Could not load chat window. Try switching to Local view.
            </div>
          )}
        </div>
      )}

      {/* ─── Local mode ─── */}
      {viewMode === 'local' && (
        <>
          <div
            className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3"
            style={{ background: 'hsl(40,18%,95%)' }}
          >
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              </div>
            )}

            {!isLoading && messages.length === 0 && (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No messages yet — start the conversation
              </div>
            )}

            {groups.map(({ date, messages: grpMsgs }) => (
              <div key={date}>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="rounded-full bg-background border px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {friendlyDate(date)}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                {grpMsgs.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          <div className="flex-shrink-0 border-t bg-card px-4 py-3">
            <div className="flex items-end gap-2">
              <button className="mb-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted" title="Attach">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex-1 relative">
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  className="min-h-[40px] max-h-[120px] resize-none rounded-2xl border-muted bg-muted/50 pr-10 text-sm"
                  rows={1}
                />
                <button className="absolute right-2.5 bottom-2 text-muted-foreground hover:text-foreground">
                  <Smile className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                className={cn(
                  'mb-0.5 flex h-9 w-9 items-center justify-center rounded-full transition-all',
                  text.trim() && !sending
                    ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatThread;
