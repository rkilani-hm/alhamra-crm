import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaConversation, WaMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, Smile, Paperclip, Phone } from 'lucide-react';
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

const TODAY    = format(new Date(), 'dd MMM yyyy');
const YESTERDAY = format(new Date(Date.now() - 86400000), 'dd MMM yyyy');
const friendlyDate = (d: string) => d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : d;

interface Props {
  conversation: WaConversation;
}

const ChatThread = ({ conversation }: Props) => {
  const qc        = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery<WaMessage[]>({
    queryKey: ['wa_messages', conversation.id],
    queryFn: async () => {
      const { data } = await supabase
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
    supabase.from('wa_conversations').update({ unread_count: 0 }).eq('id', conversation.id);

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, qc]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Send message
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
      setText(body); // restore text on failure
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
        <a
          href={`tel:+${conversation.chat_id}`}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <Phone className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>

      {/* Messages */}
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
            {/* Date divider */}
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
    </div>
  );
};

export default ChatThread;
