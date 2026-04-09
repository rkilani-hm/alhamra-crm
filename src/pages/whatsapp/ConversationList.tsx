import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Search, RefreshCw, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WaChannel, WaConversation } from '@/types';

interface Props {
  channels:       WaChannel[];
  conversations:  WaConversation[];
  activeChannel:  string | null;
  activeConvo:    WaConversation | null;
  loading:        boolean;
  syncing:        boolean;
  onChannelChange: (id: string) => void;
  onSelectConvo:  (c: WaConversation) => void;
  onSync:         () => void;
}

const ConversationList = ({
  channels, conversations, activeChannel, activeConvo,
  loading, syncing, onChannelChange, onSelectConvo, onSync,
}: Props) => {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c =>
    !search ||
    c.contacts?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.chat_id.includes(search) ||
    c.last_message?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <div className="flex w-[300px] flex-shrink-0 flex-col border-r bg-card">

      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">WhatsApp</span>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSync} disabled={syncing} title="Sync channels">
          <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', syncing && 'animate-spin')} />
        </Button>
      </div>

      {/* Channel tabs */}
      {channels.length > 0 && (
        <div className="flex overflow-x-auto border-b scrollbar-thin" style={{ minHeight: 44 }}>
          {channels.map(ch => {
            const chUnread = conversations
              .filter(c => c.channel_id === ch.channel_id)
              .reduce((s, c) => s + (c.unread_count ?? 0), 0);
            return (
              <button
                key={ch.channel_id}
                onClick={() => onChannelChange(ch.channel_id)}
                className={cn(
                  'relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors border-b-2',
                  activeChannel === ch.channel_id
                    ? 'border-green-500 text-green-700 bg-green-50'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Phone className="h-3 w-3" />
                <span>{ch.label ?? ch.phone}</span>
                {chUnread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-500 px-0.5 text-[9px] font-bold text-white">
                    {chUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…" className="h-8 pl-8 text-xs bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        )}

        {!loading && channels.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Phone className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No channels synced yet</p>
            <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Sync from Wazzup24
            </Button>
          </div>
        )}

        {!loading && channels.length > 0 && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search ? 'No results' : 'No conversations yet'}
          </div>
        )}

        {filtered.map(c => {
          const name    = c.contacts?.name ?? `+${c.chat_id}`;
          const initials = name.slice(0, 2).toUpperCase();
          const isActive = activeConvo?.id === c.id;

          return (
            <button
              key={c.id}
              onClick={() => onSelectConvo(c)}
              className={cn(
                'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors',
                isActive
                  ? 'bg-primary/8 border-l-[3px] border-l-primary'
                  : 'hover:bg-muted/50 border-l-[3px] border-l-transparent',
              )}
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className={cn('truncate text-sm', c.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                    {name}
                  </p>
                  {c.last_message_at && (
                    <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <p className={cn('truncate text-xs', c.unread_count > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                    {c.last_message ?? 'No messages'}
                  </p>
                  {c.unread_count > 0 && (
                    <span className="ml-1.5 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ConversationList;
