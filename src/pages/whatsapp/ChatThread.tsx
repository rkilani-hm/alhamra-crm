// ChatThread — Native WhatsApp read & reply interface.
// Messages are stored in Supabase (wa_messages) and synced via webhooks.
// Realtime subscription for instant message delivery.
// Send via wazzup-send edge function → Wazzup24 → WhatsApp.

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaConversation, WaMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Send, Paperclip, Phone, X, FileText,
  RefreshCw, ChevronDown, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const groupByDate = (messages: WaMessage[]) => {
  const groups: { date: string; messages: WaMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const d = format(new Date(msg.sent_at), 'dd MMM yyyy');
    if (d !== currentDate) { currentDate = d; groups.push({ date: d, messages: [] }); }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
};

const TODAY     = format(new Date(), 'dd MMM yyyy');
const YESTERDAY = format(new Date(Date.now() - 86400000), 'dd MMM yyyy');
const friendlyDate = (d: string) => d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : d;

const isImageFile = (f: File) => f.type.startsWith('image/');
const getMsgType = (file: File) => {
  if (file.type.startsWith('image/'))  return 'image';
  if (file.type.startsWith('video/'))  return 'video';
  if (file.type.startsWith('audio/'))  return 'audio';
  return 'document';
};

interface Props { conversation: WaConversation; }

const ChatThread = ({ conversation }: Props) => {
  const qc        = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const contactName = conversation.contacts?.name ?? `+${conversation.chat_id}`;

  // ── Messages query (native, always on) ──────────────────────
  const { data: messages = [], isLoading, error, refetch } = useQuery<WaMessage[]>({
    queryKey: ['wa_messages', conversation.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WaMessage[];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,  // fallback polling — realtime handles live updates
  });

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`msgs-${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'wa_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['wa_messages', conversation.id] });
        qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      })
      .subscribe();

    // Mark as read on open
    (supabase as any).from('wa_conversations')
      .update({ unread_count: 0 }).eq('id', conversation.id);

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, qc]);

  // ── Auto-scroll to bottom ────────────────────────────────────
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only auto-scroll if user is near bottom (< 200px)
    if (distFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowScrollBtn(true);
    }
  }, [messages.length]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBtn(false);
  };

  // ── Attachment handling ──────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error('File must be under 16 MB'); return; }
    setAttachment(file);
    setAttachPreview(isImageFile(file) ? URL.createObjectURL(file) : null);
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Send message ─────────────────────────────────────────────
  const handleSend = async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    setText('');

    try {
      let contentUri: string | undefined;
      let msgType: string | undefined;

      if (attachment) {
        const ext  = attachment.name.split('.').pop() || 'bin';
        const path = `${conversation.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('wa-attachments').upload(path, attachment, { contentType: attachment.type });
        if (upErr) throw new Error('Upload failed: ' + upErr.message);
        const { data } = supabase.storage.from('wa-attachments').getPublicUrl(path);
        contentUri = data.publicUrl;
        msgType    = getMsgType(attachment);
        clearAttachment();
      }

      const { error: sendErr } = await supabase.functions.invoke('wazzup-send', {
        body: {
          channelId:      conversation.channel_id,
          chatId:         conversation.chat_id,
          text:           body || undefined,
          conversationId: conversation.id,
          contentUri,
          msgType,
        },
      });
      if (sendErr) throw sendErr;

      // Optimistic: immediately scroll to bottom
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: any) {
      toast.error('Failed to send: ' + e.message);
      setText(body); // restore text on failure
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const canSend = !!(text.trim() || attachment) && !sending;
  const groups  = groupByDate(messages);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b bg-card px-4 shadow-sm">
        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold shrink-0">
          {contactName.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contactName}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            WhatsApp · +{conversation.chat_id}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button onClick={() => refetch()}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors"
            title="Refresh">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <a href={`tel:+${conversation.chat_id}`}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors"
            title={`Call +${conversation.chat_id}`}>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* ── Messages area ────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="h-full overflow-y-auto scrollbar-thin px-4 py-3 space-y-0.5"
          style={{ background: 'hsl(40 18% 95%)' }}
          onScroll={e => {
            const el = e.currentTarget;
            const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScrollBtn(fromBottom > 300);
          }}
        >
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading messages…</span>
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-muted-foreground text-center">
                Could not load messages. Check your connection.
              </p>
              <button onClick={() => refetch()}
                className="text-xs text-primary hover:underline">
                Try again
              </button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Send className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground">Send a message to start the conversation</p>
            </div>
          )}

          {/* Message groups */}
          {groups.map(({ date, messages: grpMsgs }) => (
            <div key={date}>
              {/* Date divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-black/10" />
                <span className="rounded-full bg-white/80 border border-black/10 px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                  {friendlyDate(date)}
                </span>
                <div className="flex-1 h-px bg-black/10" />
              </div>
              {grpMsgs.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            </div>
          ))}

          <div ref={bottomRef} className="h-2" />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white border shadow-lg hover:shadow-xl transition-shadow"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Attachment preview ───────────────────────────────── */}
      {attachment && (
        <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-2.5">
          {attachPreview ? (
            <img src={attachPreview} alt="preview"
              className="h-14 w-14 rounded-lg object-cover border shadow-sm" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{attachment.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {(attachment.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button onClick={clearAttachment}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* ── Reply box ────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t bg-card px-3 py-3">
        <div className="flex items-end gap-2">
          {/* Attach */}
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
            onChange={handleFileSelect} />
          <button onClick={() => fileRef.current?.click()}
            className="mb-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            title="Attach file">
            <Paperclip className="h-4.5 w-4.5 text-muted-foreground" />
          </button>

          {/* Text input */}
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                attachment
                  ? 'Add a caption… (Enter to send)'
                  : 'Message… (Enter to send, Shift+Enter for new line)'
              }
              className="min-h-[42px] max-h-[120px] resize-none rounded-2xl border-border/60 bg-muted/50 text-sm leading-snug"
              rows={1}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'mb-0.5 flex h-10 w-10 items-center justify-center rounded-full transition-all shrink-0',
              canSend
                ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm active:scale-95'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {sending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-1 text-center text-[10px] text-muted-foreground/50">
          Enter to send · Shift+Enter for new line · Paperclip to attach files
        </p>
      </div>
    </div>
  );
};

export default ChatThread;
