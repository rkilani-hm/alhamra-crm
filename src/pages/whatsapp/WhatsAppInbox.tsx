import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaChannel, WaConversation } from '@/types';
import { toast } from 'sonner';
import { MessageSquare, RefreshCw, Clock, ChevronRight, Upload, Users, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import ContactPanel from './ContactPanel';
import ChatThread from './ChatThread';
import NewConversationModal from './NewConversationModal';

const AH = { RED: '#CD1719', DARK: '#1D1D1B', GRAY: '#B2B2B2', LIGHT: '#EDEDED' };

// ── Global Wazzup24 iFrame ────────────────────────────────────

const ConvoRow = ({
  convo, active, onClick,
}: {
  convo: WaConversation;
  active: boolean;
  onClick: () => void;
}) => {
  const name     = (convo as any).contacts?.name ?? `+${convo.chat_id}`;
  const initials = name.slice(0, 2).toUpperCase();
  const unread   = convo.unread_count ?? 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 border-b text-left transition-colors"
      style={{
        background:  active ? `${AH.RED}10` : 'transparent',
        borderLeft:  active ? `3px solid ${AH.RED}` : '3px solid transparent',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget.style.background = '#f5f5f5'); }}
      onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
    >
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: unread > 0 ? `${AH.RED}15` : '#f0f0f0',
        border: unread > 0 ? `1.5px solid ${AH.RED}40` : '1.5px solid #ddd',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
        color: unread > 0 ? AH.RED : AH.GRAY,
      }}>
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{
            fontSize: 12, fontWeight: unread > 0 ? 700 : 600,
            color: AH.DARK, letterSpacing: '0.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 120,
          }}>
            {name}
          </p>
          {convo.last_message_at && (
            <span style={{ fontSize: 9, color: AH.GRAY, flexShrink: 0, marginLeft: 4 }}>
              {formatDistanceToNow(new Date(convo.last_message_at), { addSuffix: false })}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11, color: AH.GRAY, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {convo.last_message ?? 'Tap to create case'}
        </p>
      </div>

      {/* Unread badge */}
      {unread > 0 ? (
        <span style={{
          background: AH.RED, color: '#fff',
          fontSize: 9, fontWeight: 700, borderRadius: 10,
          padding: '2px 6px', flexShrink: 0,
        }}>
          {unread > 99 ? '99+' : unread}
        </span>
      ) : (
        <ChevronRight style={{ width: 14, height: 14, color: '#ccc', flexShrink: 0 }} />
      )}
    </button>
  );
};

// ── Main inbox ────────────────────────────────────────────────
const WhatsAppInbox = () => {
  const qc = useQueryClient();
  const [activeConvo, setActiveConvo] = useState<WaConversation | null>(null);
  const [newConvOpen, setNewConvOpen] = useState(false);

  // Load channels
  const { data: channels = [] } = useQuery<WaChannel[]>({
    queryKey: ['wa_channels'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('wa_channels').select('*').order('phone');
      return (data ?? []) as WaChannel[];
    },
  });

  // Load conversations (created by webhook on new messages)
  const { data: conversations = [], isLoading } = useQuery<WaConversation[]>({
    queryKey: ['wa_conversations_inbox'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('*, contacts(id,name,phone,email), wa_channels(phone,label)')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);
      return (data ?? []) as WaConversation[];
    },
  });

  // Realtime updates
  useEffect(() => {
    const sub = supabase.channel('wa-inbox-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' },
        () => qc.invalidateQueries({ queryKey: ['wa_conversations_inbox'] }))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  // Keep active convo in sync
  useEffect(() => {
    if (activeConvo) {
      const updated = conversations.find(c => c.id === activeConvo.id);
      if (updated) setActiveConvo(updated);
    }
  }, [conversations]);

  // When agent clicks "+" in Wazzup iFrame (WZ_CREATE_ENTITY event)


  // Push CRM contacts TO Wazzup (bidirectional sync)
  const pushContacts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-push-contacts');
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => toast.success(`${d?.pushed ?? 0} contacts pushed to Wazzup24`),
    onError: (e: any) => toast.error('Push failed: ' + e.message),
  });

  // Push CRM users TO Wazzup
  const pushUsers = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-push-users');
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => toast.success(`${d?.pushed ?? 0} users synced to Wazzup24`),
    onError: (e: any) => toast.error('User push failed: ' + e.message),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ['wa_channels'] });
      toast.success(`${d?.channels ?? 0} channels synced`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <div
      className="flex overflow-hidden rounded-xl border"
      style={{ height: 'calc(100vh - 64px)', margin: '-2rem', background: '#fff' }}
    >
      {/* ── Left sidebar — conversation list ─────────────────── */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: '1px solid #e5e5e5',
        display: 'flex', flexDirection: 'column',
        background: '#fff',
      }}>
        {/* Header */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 14px',
          borderBottom: '1px solid #e5e5e5', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare style={{ width: 16, height: 16, color: '#25D366' }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: AH.DARK }}>
              Inbox
            </span>
            {totalUnread > 0 && (
              <span style={{
                background: AH.RED, color: '#fff',
                fontSize: 9, fontWeight: 700, borderRadius: 10, padding: '2px 7px',
              }}>
                {totalUnread}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              sync.mutate();
              // Also push contacts + users on every sync
              setTimeout(() => pushContacts.mutate(), 1000);
              setTimeout(() => pushUsers.mutate(), 2000);
            }}
            disabled={sync.isPending}
            title="Sync channels"
            style={{ background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: AH.GRAY }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <RefreshCw style={{
              width: 14, height: 14,
              animation: sync.isPending ? 'spin 1s linear infinite' : 'none',
            }} />
          </button>

          {/* New conversation button */}
          <button
            onClick={() => setNewConvOpen(true)}
            title="Start new conversation"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: 6, padding: 4, color: '#CD1719',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <SquarePen style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* How to create a case — tip */}
        <div style={{
          padding: '8px 12px',
          background: '#fffbeb',
          borderBottom: '1px solid #fde68a',
          fontSize: 10, color: '#92400e', lineHeight: 1.5,
          flexShrink: 0,
        }}>
          <strong>To create a case:</strong> click a conversation below → then click <strong>"New case"</strong> in the panel that opens on the right.
          <br />In the chat window, click <strong>"+"</strong> on any contact to auto-open the panel.
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: AH.RED }} />
            </div>
          )}

          {!isLoading && conversations.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Clock style={{ width: 28, height: 28, color: '#ccc', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: AH.GRAY }}>
                Conversations appear here when clients message you via WhatsApp.
              </p>
              {channels.length === 0 && (
                <Button
                  size="sm" className="mt-3 gap-2"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Connect channels
                </Button>
              )}
            </div>
          )}

          {conversations.map(c => (
            <ConvoRow
              key={c.id}
              convo={c}
              active={activeConvo?.id === c.id}
              onClick={() => setActiveConvo(c)}
            />
          ))}
        </div>
      </div>

      {/* ── Center — Native chat thread ───────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeConvo ? (
          <ChatThread conversation={activeConvo} />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: 24, textAlign: 'center',
            background: 'hsl(40 18% 97%)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: '#25D36615', border: '1.5px solid #25D36630',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageSquare style={{ width: 26, height: 26, color: '#25D366' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: AH.DARK, letterSpacing: '0.04em' }}>
                Select a conversation
              </p>
              <p style={{ fontSize: 11, color: AH.GRAY, marginTop: 6, lineHeight: 1.6 }}>
                Choose a chat from the left to read and reply to messages.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right — Contact & Case panel ─────────────────────── */}
      {activeConvo ? (
        <div style={{
          width: 300, flexShrink: 0,
          borderLeft: '1px solid #e5e5e5',
          overflowY: 'auto',
        }}
          className="scrollbar-thin"
        >
          <ContactPanel
            conversation={activeConvo}
            onClose={() => setActiveConvo(null)}
          />
        </div>
      ) : (
        <div style={{
          width: 300, flexShrink: 0,
          borderLeft: '1px solid #e5e5e5',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 24, textAlign: 'center',
          background: '#fafafa',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${AH.RED}10`, border: `1.5px solid ${AH.RED}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageSquare style={{ width: 22, height: 22, color: AH.RED }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: AH.DARK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Select a Conversation
            </p>
            <p style={{ fontSize: 11, color: AH.GRAY, marginTop: 6, lineHeight: 1.6 }}>
              Click any conversation from the list on the left to view contact details and create a case.
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={newConvOpen}
        onClose={() => setNewConvOpen(false)}
        channels={channels}
        onSuccess={handleNewConvSuccess}
      />
    </div>
  );
};

export default WhatsAppInbox;
