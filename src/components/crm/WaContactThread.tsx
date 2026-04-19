// WaContactThread — renders WhatsApp conversations for a contact (or phone)
// inline in the same timeline-style as WaThreadPreview. No iframe.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  msg_type: string | null;
  sender_name: string | null;
  sent_at: string;
}

interface ConversationRow {
  id: string;
  chat_id: string;
  last_message_at: string | null;
  wa_channels: { label: string | null; phone: string | null } | null;
}

interface Props {
  contactId?: string | null;
  phone?: string | null;        // digits only or with +
  contactName?: string;
  height?: number;
}

const normalizePhone = (p?: string | null) => (p ? p.replace(/\D/g, '') : '');

const WaContactThread = ({ contactId, phone, contactName, height = 480 }: Props) => {
  const phoneDigits = normalizePhone(phone);

  // 1. Find all conversations for this contact (by id or by chat_id matching phone)
  const { data: conversations = [], isLoading: convLoading } = useQuery<ConversationRow[]>({
    queryKey: ['wa-contact-convs', contactId, phoneDigits],
    enabled: !!(contactId || phoneDigits),
    queryFn: async () => {
      let query = (supabase as any)
        .from('wa_conversations')
        .select('id, chat_id, last_message_at, wa_channels(label, phone)')
        .order('last_message_at', { ascending: false });

      if (contactId && phoneDigits) {
        query = query.or(`contact_id.eq.${contactId},chat_id.eq.${phoneDigits}`);
      } else if (contactId) {
        query = query.eq('contact_id', contactId);
      } else {
        query = query.eq('chat_id', phoneDigits);
      }

      const { data } = await query;
      return (data ?? []) as ConversationRow[];
    },
  });

  if (!contactId && !phoneDigits) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No phone number — add one to view WhatsApp history
      </div>
    );
  }

  if (convLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        <span className="text-sm text-muted-foreground">Loading WhatsApp history…</span>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No WhatsApp conversations yet for this contact
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {conversations.map(conv => (
        <ConversationBlock
          key={conv.id}
          conversation={conv}
          contactName={contactName}
          height={height}
        />
      ))}
    </div>
  );
};

const ConversationBlock = ({
  conversation,
  contactName,
  height,
}: {
  conversation: ConversationRow;
  contactName?: string;
  height: number;
}) => {
  const { data: messages = [], isLoading } = useQuery<WaMessage[]>({
    queryKey: ['wa-thread-full', conversation.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_messages')
        .select('id, direction, body, msg_type, sender_name, sent_at')
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true });
      return (data ?? []) as WaMessage[];
    },
  });

  const channelLabel =
    conversation.wa_channels?.label ?? conversation.wa_channels?.phone ?? 'WhatsApp';

  return (
    <div className="rounded-xl border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-green-600 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-medium truncate">
            {contactName ? `${contactName}` : `+${conversation.chat_id}`}
          </span>
          <span className="text-[10px] opacity-80 shrink-0">· via {channelLabel}</span>
        </div>
        <span className="text-[10px] opacity-80 shrink-0">{messages.length} msgs</span>
      </div>

      {/* Body */}
      <div
        className="bg-[hsl(40,18%,97%)] overflow-y-auto px-3 py-3 space-y-1.5"
        style={{ maxHeight: height }}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            Loading messages…
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No messages stored yet</p>
        )}

        {!isLoading &&
          messages.map(msg => {
            const isOut = msg.direction === 'outbound';
            const hasText = msg.body && msg.body.trim();
            const isMedia = !hasText && msg.msg_type && msg.msg_type !== 'text';

            return (
              <div key={msg.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3 py-1.5 shadow-sm text-xs',
                    isOut
                      ? 'rounded-br-sm bg-green-500 text-white'
                      : 'rounded-bl-sm bg-white border text-foreground'
                  )}
                >
                  {!isOut && msg.sender_name && (
                    <p className="text-[9px] font-semibold mb-0.5 text-green-700 opacity-80">
                      {msg.sender_name}
                    </p>
                  )}

                  {hasText ? (
                    <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                  ) : isMedia ? (
                    <p className="italic opacity-60">[{msg.msg_type}]</p>
                  ) : (
                    <p className="italic opacity-60">[empty]</p>
                  )}

                  <p
                    className={cn(
                      'text-[9px] mt-0.5 text-right',
                      isOut ? 'text-white/60' : 'text-muted-foreground'
                    )}
                  >
                    {format(new Date(msg.sent_at), 'dd MMM · HH:mm')}
                    {isOut && ' ✓'}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default WaContactThread;
