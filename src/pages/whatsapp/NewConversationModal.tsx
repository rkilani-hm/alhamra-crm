// NewConversationModal — Start a WhatsApp conversation natively from the CRM.
// Agent picks a contact (or types a raw number), selects a channel, types a message, sends.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WaChannel, Contact } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, Phone, Send, MessageSquare, User2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open:      boolean;
  onClose:   () => void;
  channels:  WaChannel[];
  onSuccess: (conversationId: string, channelId: string, chatId: string) => void;
}

const NewConversationModal = ({ open, onClose, channels, onSuccess }: Props) => {
  const qc = useQueryClient();

  // Form state
  const [searchQuery,  setSearchQuery]  = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [rawPhone,     setRawPhone]     = useState('');
  const [channelId,    setChannelId]    = useState(channels[0]?.channel_id ?? '');
  const [message,      setMessage]      = useState('');
  const [tab,          setTab]          = useState<'contact' | 'phone'>('contact');

  // Search contacts
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['contacts-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) {
        const { data } = await (supabase as any)
          .from('contacts').select('id,name,phone').not('phone','is',null).order('name').limit(20);
        return data ?? [];
      }
      const { data } = await (supabase as any)
        .from('contacts').select('id,name,phone')
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .not('phone','is',null).limit(15);
      return data ?? [];
    },
    enabled: open,
  });

  // Determine chatId (digits only)
  const chatId = tab === 'contact'
    ? (selectedContact?.phone ?? '').replace(/\D/g, '')
    : rawPhone.replace(/\D/g, '');

  const isValid = channelId && chatId.length >= 7 && message.trim().length > 0;

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wazzup-send', {
        body: { channelId, chatId, text: message.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      toast.success('Message sent');
      onSuccess(data.conversationId, channelId, chatId);
      handleClose();
    },
    onError: (e: any) => toast.error('Failed to send: ' + e.message),
  });

  const handleClose = () => {
    setSearchQuery(''); setSelectedContact(null); setRawPhone('');
    setMessage(''); setTab('contact');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) send.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-green-600 text-white">
          <MessageSquare className="h-5 w-5" />
          <DialogTitle className="text-white text-base font-semibold">New WhatsApp conversation</DialogTitle>
        </div>

        <div className="p-5 space-y-4">
          {/* Tab: Contact vs Phone */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['contact','phone'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSelectedContact(null); setRawPhone(''); }}
                className={cn(
                  'flex-1 py-2 text-xs font-medium capitalize transition-colors',
                  tab === t ? 'bg-green-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                )}>
                {t === 'contact' ? '📋 Select contact' : '📱 Enter number'}
              </button>
            ))}
          </div>

          {/* Tab: Contact */}
          {tab === 'contact' && (
            <div className="space-y-2">
              <Label className="text-xs">Search contacts with phone</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSelectedContact(null); }}
                  placeholder="Name or phone number…"
                  className="pl-8 h-9 text-sm"
                  autoFocus
                />
              </div>

              {/* Contact list */}
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {contacts.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {searchQuery ? 'No contacts found' : 'Loading contacts…'}
                  </div>
                )}
                {contacts.map(c => (
                  <button key={c.id} onClick={() => { setSelectedContact(c); setSearchQuery(c.name); }}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors',
                      selectedContact?.id === c.id
                        ? 'bg-green-50 border-l-2 border-l-green-500'
                        : 'hover:bg-muted/50'
                    )}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                      {c.name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                    {selectedContact?.id === c.id && (
                      <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Selected</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Selected contact preview */}
              {selectedContact && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <User2 className="h-3.5 w-3.5 text-green-700" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-800">{selectedContact.name}</p>
                    <p className="text-[10px] text-green-700">Sending to: +{selectedContact.phone?.replace(/\D/g,'')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Raw phone number */}
          {tab === 'phone' && (
            <div className="space-y-2">
              <Label className="text-xs">Phone number (with country code)</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={rawPhone}
                  onChange={e => setRawPhone(e.target.value)}
                  placeholder="+965 9999 9999"
                  className="pl-8 h-9 text-sm"
                  autoFocus
                />
              </div>
              {chatId.length >= 7 && (
                <p className="text-[10px] text-muted-foreground">
                  Will send to: +{chatId}
                </p>
              )}
            </div>
          )}

          {/* Channel selector */}
          <div className="space-y-2">
            <Label className="text-xs">Send from (your WhatsApp number)</Label>
            <div className="flex gap-2 flex-wrap">
              {channels.map(ch => (
                <button key={ch.channel_id}
                  onClick={() => setChannelId(ch.channel_id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    channelId === ch.channel_id
                      ? 'bg-green-600 text-white border-green-600'
                      : 'text-muted-foreground hover:bg-muted border-border'
                  )}>
                  <Phone className="h-3 w-3" />
                  {ch.label ?? ch.phone}
                </button>
              ))}
              {channels.length === 0 && (
                <p className="text-xs text-muted-foreground">No channels synced yet</p>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label className="text-xs">First message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message… (⌘+Enter to send)"
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <Button
              size="sm"
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              disabled={!isValid || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {send.isPending ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationModal;
