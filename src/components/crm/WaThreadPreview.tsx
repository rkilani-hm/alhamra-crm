import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  msg_type: string | null;
  sender_name: string | null;
  sent_at: string;
}

interface Props {
  conversationId: string;  // the uuid from outcome='wa:<uuid>'
  contactName?: string;
}

const WaThreadPreview = ({ conversationId, contactName }: Props) => {
  const [expanded, setExpanded] = useState(false);

  // Fetch the conversation + channel label so we can show where it happened
  const { data: convInfo } = useQuery<{ label: string | null } | null>({
    queryKey: ['wa-conv-channel', conversationId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('wa_channels(label, phone)')
        .eq('id', conversationId)
        .maybeSingle();
      const ch = data?.wa_channels;
      if (!ch) return { label: null };
      return { label: ch.label ?? ch.phone ?? null };
    },
  });

  const { data: messages = [], isLoading } = useQuery<WaMessage[]>({
    queryKey: ['wa-thread', conversationId],
    enabled: expanded,   // only fetch when opened
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_messages')
        .select('id, direction, body, msg_type, sender_name, sent_at')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: true });
      return (data ?? []) as WaMessage[];
    },
  });

  return (
    <div className="mt-2">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[11px] text-green-700 font-medium hover:text-green-800 transition-colors"
      >
        <MessageSquare className="h-3 w-3" />
        {expanded ? 'Hide messages' : 'View messages'}
        {convInfo?.label && (
          <span className="text-[10px] font-normal text-muted-foreground">· via {convInfo.label}</span>
        )}
        {expanded
          ? <ChevronUp className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Thread */}
      {expanded && (
        <div className="mt-2 rounded-xl border bg-[hsl(40,18%,97%)] overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              Loading messages…
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No messages stored yet</p>
          )}

          {!isLoading && messages.length > 0 && (
            <div className="max-h-72 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-thin">
              {messages.map(msg => {
                const isOut = msg.direction === 'outbound';
                const hasText = msg.body && msg.body.trim();
                const isMedia = !hasText && msg.msg_type && msg.msg_type !== 'text';

                return (
                  <div key={msg.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-1.5 shadow-sm text-xs',
                      isOut
                        ? 'rounded-br-sm bg-green-500 text-white'
                        : 'rounded-bl-sm bg-white border text-foreground'
                    )}>
                      {/* Sender name for inbound only */}
                      {!isOut && msg.sender_name && (
                        <p className="text-[9px] font-semibold mb-0.5 text-green-700 opacity-80">
                          {msg.sender_name}
                        </p>
                      )}

                      {hasText
                        ? <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                        : isMedia
                          ? <p className="italic opacity-60">[{msg.msg_type}]</p>
                          : <p className="italic opacity-60">[empty]</p>
                      }

                      <p className={cn(
                        'text-[9px] mt-0.5 text-right',
                        isOut ? 'text-white/60' : 'text-muted-foreground'
                      )}>
                        {format(new Date(msg.sent_at), 'dd MMM · HH:mm')}
                        {isOut && ' ✓'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {!isLoading && messages.length > 0 && (
            <div className="border-t bg-white/60 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>{messages.length} messages</span>
              <button
                onClick={() => setExpanded(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Collapse
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WaThreadPreview;
