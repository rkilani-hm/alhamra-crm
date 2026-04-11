import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaConversation, WaMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, Paperclip, Phone, MessageCircle, ExternalLink, X, Image, FileText } from 'lucide-react';
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

const isImageFile = (f: File) => f.type.startsWith('image/');
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB

// Determine msg_type from file MIME
const getMsgType = (file: File): string => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
};

interface Props {
  conversation: WaConversation;
}

type ViewMode = 'local' | 'iframe';

const ChatThread = ({ conversation }: Props) => {
  const qc        = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('iframe');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);

  // Fetch iframe URL
  const { data: iframeUrl, isLoading: iframeLoading } = useQuery<string | null>({
    queryKey: ['wazzup_iframe', conversation.channel_id, conversation.chat_id],
    enabled: viewMode === 'iframe',
    staleTime: 1000 * 60 * 25,
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

  // Fetch local messages
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

  // Realtime subscription
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

    (supabase as any).from('wa_conversations').update({ unread_count: 0 }).eq('id', conversation.id);

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, qc]);

  // Auto-scroll
  useEffect(() => {
    if (viewMode === 'local') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, viewMode]);

  // Clean up preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (attachPreview) URL.revokeObjectURL(attachPreview);
    };
  }, [attachPreview]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 16 MB.');
      return;
    }
    setAttachment(file);
    if (isImageFile(file)) {
      setAttachPreview(URL.createObjectURL(file));
    } else {
      setAttachPreview(null);
    }
    // Switch to local mode for sending
    if (viewMode !== 'local') setViewMode('local');
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Upload to storage, then send via edge function
  const handleSend = async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    setText('');

    try {
      let contentUri: string | undefined;
      let msgType: string | undefined;

      // Upload attachment if present
      if (attachment) {
        const ext = attachment.name.split('.').pop() || 'bin';
        const path = `${conversation.id}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('wa-attachments')
          .upload(path, attachment, { contentType: attachment.type, upsert: false });

        if (upErr) throw new Error('Upload failed: ' + upErr.message);

        const { data: urlData } = supabase.storage
          .from('wa-attachments')
          .getPublicUrl(path);

        contentUri = urlData.publicUrl;
        msgType = getMsgType(attachment);
        clearAttachment();
      }

      const { error } = await supabase.functions.invoke('wazzup-send', {
        body: {
          channelId:      conversation.channel_id,
          chatId:         conversation.chat_id,
          text:           body || undefined,
          conversationId: conversation.id,
          contentUri,
          msgType,
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
  const canSend = (text.trim() || attachment) && !sending;

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

          {/* Attachment preview bar */}
          {attachment && (
            <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-2">
              {attachPreview ? (
                <img src={attachPreview} alt="preview" className="h-14 w-14 rounded-lg object-cover border" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{attachment.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(attachment.size / 1024).toFixed(0)} KB · {attachment.type || 'unknown'}
                </p>
              </div>
              <button
                onClick={clearAttachment}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Reply box */}
          <div className="flex-shrink-0 border-t bg-card px-4 py-3">
            <div className="flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="mb-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex-1 relative">
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={attachment ? 'Add a caption… (optional)' : 'Type a message… (Enter to send)'}
                  className="min-h-[40px] max-h-[120px] resize-none rounded-2xl border-muted bg-muted/50 pr-10 text-sm"
                  rows={1}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  'mb-0.5 flex h-9 w-9 items-center justify-center rounded-full transition-all',
                  canSend
                    ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {sending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatThread;
