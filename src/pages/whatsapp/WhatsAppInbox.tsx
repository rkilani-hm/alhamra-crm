import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaChannel, WaConversation } from '@/types';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import ConversationList from './ConversationList';
import ChatThread       from './ChatThread';
import ContactPanel     from './ContactPanel';

const WhatsAppInbox = () => {
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeConvo,   setActiveConvo]   = useState<WaConversation | null>(null);

  // Channels
  const { data: channels = [] } = useQuery<WaChannel[]>({
    queryKey: ['wa_channels'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('wa_channels').select('*').order('phone');
      return (data ?? []) as WaChannel[];
    },
  });

  // Set first channel on load
  useEffect(() => {
    if (channels.length && !activeChannel) setActiveChannel(channels[0].channel_id);
  }, [channels, activeChannel]);

  // Conversations for active channel
  const { data: conversations = [], isLoading: convosLoading } = useQuery<WaConversation[]>({
    queryKey: ['wa_conversations', activeChannel],
    enabled: !!activeChannel,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('*, contacts(id,name,phone,email), wa_channels(phone,label)')
        .eq('channel_id', activeChannel!)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      return (data ?? []) as WaConversation[];
    },
  });

  // Realtime — new messages update the conversation list
  useEffect(() => {
    const sub = supabase
      .channel('wa-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' },
        () => qc.invalidateQueries({ queryKey: ['wa_conversations'] }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' },
        () => qc.invalidateQueries({ queryKey: ['wa_conversations'] }))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  // Keep active conversation in sync with refreshed data
  useEffect(() => {
    if (activeConvo) {
      const updated = conversations.find(c => c.id === activeConvo.id);
      if (updated) setActiveConvo(updated);
    }
  }, [conversations]);

  // Sync channels from Wazzup24
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_channels'] });
      toast.success(`Synced ${data?.channels ?? 0} WhatsApp channels & registered webhook`);
    },
    onError: (e: any) => toast.error('Sync failed: ' + (e.message ?? 'Unknown error')),
  });

  const handleSelectConvo = (c: WaConversation) => {
    setActiveConvo(c);
    // Mark as read locally immediately
    if (c.unread_count > 0) {
      (supabase as any).from('wa_conversations').update({ unread_count: 0 }).eq('id', c.id);
      qc.setQueryData(['wa_conversations', activeChannel], (old: WaConversation[] | undefined) =>
        (old ?? []).map(x => x.id === c.id ? { ...x, unread_count: 0 } : x)
      );
    }
  };

  return (
    <div
      className="flex overflow-hidden rounded-xl border bg-background"
      style={{ height: 'calc(100vh - 64px)', margin: '-2rem' }}
    >
      {/* Left: conversation list */}
      <ConversationList
        channels={channels}
        conversations={conversations}
        activeChannel={activeChannel}
        activeConvo={activeConvo}
        loading={convosLoading}
        syncing={syncMutation.isPending}
        onChannelChange={id => { setActiveChannel(id); setActiveConvo(null); }}
        onSelectConvo={handleSelectConvo}
        onSync={() => syncMutation.mutate()}
      />

      {/* Center: chat thread OR empty state */}
      {activeConvo ? (
        <ChatThread conversation={activeConvo} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
            <MessageSquare className="h-8 w-8 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {channels.length === 0
                ? 'Click the sync button to connect your Wazzup24 channels'
                : 'Select a conversation to start messaging'}
            </p>
          </div>
          {channels.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 max-w-sm text-left text-sm">
              <p className="font-medium text-amber-800 mb-1.5">Setup checklist</p>
              <ol className="text-amber-700 space-y-1 list-decimal list-inside text-xs">
                <li>Set <code className="bg-amber-100 px-1 rounded">WAZZUP_API_KEY</code> in Supabase Edge Function secrets</li>
                <li>Deploy: <code className="bg-amber-100 px-1 rounded">wazzup-sync</code>, <code className="bg-amber-100 px-1 rounded">wazzup-webhook</code>, <code className="bg-amber-100 px-1 rounded">wazzup-send</code></li>
                <li>Click the sync button in the conversation list</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Right: contact + case panel */}
      {activeConvo && <ContactPanel conversation={activeConvo} />}
    </div>
  );
};

export default WhatsAppInbox;
