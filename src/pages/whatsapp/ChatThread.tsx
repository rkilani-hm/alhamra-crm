// ChatThread — Native WhatsApp read & reply interface.
// Reads from wa_messages via Supabase realtime. Sends via wazzup-send edge function.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaConversation, WaMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Send, Paperclip, Phone, X, FileText,
  RefreshCw, ChevronDown, AlertCircle, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import QuickReplies from './QuickReplies';

/* ── Date grouping helpers ─────────────────────────────────── */
const groupByDate = (messages: WaMessage[]) => {
  const groups: { date: string; messages: WaMessage[] }[] = [];
  let cur = '';
  for (const msg of messages) {
    const d = format(new Date(msg.sent_at), 'dd MMM yyyy');
    if (d !== cur) { cur = d; groups.push({ date: d, messages: [] }); }
    groups.at(-1)!.messages.push(msg);
  }
  return groups;
};
const TODAY     = format(new Date(), 'dd MMM yyyy');
const YESTERDAY = format(new Date(Date.now() - 86400000), 'dd MMM yyyy');
const friendly  = (d: string) => d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : d;

/* ── File helpers ──────────────────────────────────────────── */
const getMsgType = (f: File) => {
  if (f.type.startsWith('image/'))  return 'image';
  if (f.type.startsWith('video/'))  return 'video';
  if (f.type.startsWith('audio/'))  return 'audio';
  return 'document';
};

/* ── ChatThread ────────────────────────────────────────────── */
interface Props { conversation: WaConversation; }

const ChatThread = ({ conversation }: Props) => {
  const qc          = useQueryClient();
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textRef     = useRef<HTMLTextAreaElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const prevCount   = useRef(0);

  const [text,           setText]           = useState('');
  const [sending,        setSending]        = useState(false);
  const [attachment,     setAttachment]     = useState<File | null>(null);
  const [attachPreview,  setAttachPreview]  = useState<string | null>(null);
  const [showScrollBtn,  setShowScrollBtn]  = useState(false);
  const [showQR,         setShowQR]         = useState(false);

  const contactName = conversation.contacts?.name ?? `+${conversation.chat_id}`;

  /* ── Messages ────────────────────────────────────────────── */
  const { data: messages = [], isLoading, error, refetch } = useQuery<WaMessage[]>({
    queryKey: ['wa_messages', conversation.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('wa_messages').select('*')
        .eq('conversation_id', conversation.id)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WaMessage[];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  /* ── Realtime ────────────────────────────────────────────── */
  useEffect(() => {
    const ch = supabase.channel(`msgs-${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'wa_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['wa_messages', conversation.id] });
        qc.invalidateQueries({ queryKey: ['wa_conversations_inbox'] });
        if ('vibrate' in navigator) navigator.vibrate(80);
      })
      .subscribe();

    // Mark read
    (supabase as any).from('wa_conversations').update({ unread_count: 0 }).eq('id', conversation.id);

    return () => { supabase.removeChannel(ch); };
  }, [conversation.id, qc]);

  /* ── Auto-scroll ─────────────────────────────────────────── */
  useEffect(() => {
    if (messages.length === 0) return;
    const isNew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (isNew || fromBottom < 300) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollBtn(false);
    } else {
      setShowScrollBtn(true);
    }
  }, [messages.length]);

  /* ── Reset when switching conversation ───────────────────── */
  useEffect(() => {
    setText('');
    setAttachment(null);
    setAttachPreview(null);
    setShowQR(false);
    prevCount.current = 0;
  }, [conversation.id]);

  /* ── Attachment ──────────────────────────────────────────── */
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 16 * 1024 * 1024) { toast.error('Max file size is 16 MB'); return; }
    setAttachment(f);
    setAttachPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearFile = () => {
    setAttachment(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
  };

  /* ── Send ────────────────────────────────────────────────── */
  const send = useCallback(async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    setText('');
    setShowQR(false);

    try {
      let contentUri: string | undefined;
      let msgType: string | undefined;

      if (attachment) {
        const ext  = attachment.name.split('.').pop() || 'bin';
        const path = `${conversation.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('wa-attachments').upload(path, attachment, { contentType: attachment.type });
        if (upErr) throw new Error('Upload failed: ' + upErr.message);
        contentUri = supabase.storage.from('wa-attachments').getPublicUrl(path).data.publicUrl;
        msgType    = getMsgType(attachment);
        clearFile();
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
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
    } catch (e: any) {
      const msg = e.message ?? 'Unknown error';
      if (msg.includes('Failed to send') || msg.includes('non-2xx') || msg.includes('fetch')) {
        toast.error('Cannot reach send service — the wazzup-send edge function needs to be redeployed in Lovable.', { duration: 8000 });
      } else if (msg.includes('Rate limit')) {
        toast.error('Too many messages sent — wait a minute and try again.');
      } else if (msg.includes('WAZZUP_API_KEY')) {
        toast.error('Wazzup API key not configured — contact your admin.');
      } else {
        toast.error('Send failed: ' + msg);
      }
      setText(body);
    } finally {
      setSending(false);
      textRef.current?.focus();
    }
  }, [text, attachment, sending, conversation]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === '/' && !text) { e.preventDefault(); setShowQR(true); }
    if (e.key === 'Escape') { setShowQR(false); }
  };

  const canSend = !!(text.trim() || attachment) && !sending;
  const groups  = groupByDate(messages);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b bg-card px-4 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-bold">
          {contactName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contactName}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            WhatsApp · +{conversation.chat_id}
          </p>
        </div>
        <button onClick={() => refetch()} title="Refresh messages"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <a href={`tel:+${conversation.chat_id}`} title={`Call +${conversation.chat_id}`}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
          <Phone className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>

      {/* ── Messages area ────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-thin px-4 py-3"
          style={{ background: 'hsl(40 18% 95%)' }}
          onScroll={e => {
            const el = e.currentTarget;
            setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 300);
          }}>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <span className="text-sm text-muted-foreground">Loading messages…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-muted-foreground">Could not load messages.</p>
              <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Try again</button>
            </div>
          )}

          {!isLoading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Send a message below, or wait for the client to write first.
                  <br />New incoming messages appear here in real time.
                </p>
              </div>
            </div>
          )}

          {groups.map(({ date, messages: grp }) => (
            <div key={date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-black/10" />
                <span className="rounded-full bg-white/80 border border-black/10 px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                  {friendly(date)}
                </span>
                <div className="flex-1 h-px bg-black/10" />
              </div>
              {grp.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            </div>
          ))}

          <div ref={bottomRef} className="h-2" />
        </div>

        {showScrollBtn && (
          <button onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollBtn(false); }}
            className="absolute bottom-3 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white border shadow-lg hover:shadow-xl transition-all">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Attachment preview ───────────────────────────────── */}
      {attachment && (
        <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-2.5">
          {attachPreview
            ? <img src={attachPreview} alt="preview" className="h-12 w-12 rounded-lg object-cover border" />
            : <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{attachment.name}</p>
            <p className="text-[10px] text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</p>
          </div>
          <button onClick={clearFile} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* ── Quick Replies popover ────────────────────────────── */}
      {showQR && (
        <div className="border-t bg-card">
          <QuickReplies
            onSelect={t => { setText(prev => prev ? prev + '\n' + t : t); setShowQR(false); textRef.current?.focus(); }}
            onClose={() => { setShowQR(false); textRef.current?.focus(); }}
          />
        </div>
      )}

      {/* ── Reply bar ────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t bg-card px-3 py-2.5">
        <div className="flex items-end gap-2">
          {/* Attach file */}
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
            onChange={pickFile} />
          <button onClick={() => fileRef.current?.click()} title="Attach file (max 16 MB)"
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Quick replies toggle */}
          <button onClick={() => setShowQR(q => !q)} title="Quick replies (or type '/')"
            className={cn('mb-0.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors shrink-0',
              showQR ? 'bg-amber-100 text-amber-600' : 'hover:bg-muted text-muted-foreground')}>
            <Zap className="h-4 w-4" />
          </button>

          {/* Text input */}
          <Textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={attachment ? 'Add a caption… (Enter to send)' : "Message… (Enter ↵ to send · '/' for quick replies)"}
            className="min-h-[42px] max-h-[120px] resize-none rounded-2xl border-border/60 bg-muted/40 text-sm leading-snug"
            rows={1}
          />

          {/* Send */}
          <button onClick={send} disabled={!canSend} title="Send (Enter)"
            className={cn('mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95',
              canSend ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {sending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Send className="h-4 w-4" />}
          </button>
        </div>

        <p className="mt-1 text-center text-[10px] text-muted-foreground/40">
          Enter to send · Shift+Enter for new line · ⚡ or "/" for quick replies · 📎 to attach files
        </p>
      </div>
    </div>
  );
};

export default ChatThread;
