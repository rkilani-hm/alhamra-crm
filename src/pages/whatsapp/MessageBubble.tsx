import { format } from 'date-fns';
import { Check, CheckCheck, Clock, Image, FileText, Mic } from 'lucide-react';
import { WaMessage } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_ICON = {
  sent:      <Check      className="h-3 w-3 text-muted-foreground" />,
  delivered: <CheckCheck className="h-3 w-3 text-muted-foreground" />,
  read:      <CheckCheck className="h-3 w-3 text-blue-500" />,
  failed:    <Clock      className="h-3 w-3 text-destructive" />,
};

const MediaPlaceholder = ({ type }: { type: string }) => (
  <div className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs">
    {type === 'image'    && <Image    className="h-4 w-4" />}
    {type === 'document' && <FileText className="h-4 w-4" />}
    {type === 'audio'    && <Mic      className="h-4 w-4" />}
    <span className="capitalize">{type} attachment</span>
  </div>
);

const MessageBubble = ({ msg }: { msg: WaMessage }) => {
  const out = msg.direction === 'outbound';

  return (
    <div className={cn('flex mb-1.5', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[72%] rounded-2xl px-3.5 py-2 shadow-sm',
          out
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-card border text-foreground',
        )}
      >
        {/* Sender name for inbound */}
        {!out && msg.sender_name && (
          <p className="mb-0.5 text-[10px] font-semibold" style={{ color: 'hsl(var(--brand-bronze))' }}>
            {msg.sender_name}
          </p>
        )}

        {/* Media */}
        {msg.msg_type !== 'text' && <MediaPlaceholder type={msg.msg_type} />}

        {/* Text body */}
        {msg.body && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
        )}

        {/* Footer: time + status */}
        <div className={cn('mt-0.5 flex items-center gap-1', out ? 'justify-end' : 'justify-start')}>
          <span className="text-[10px] opacity-60">
            {format(new Date(msg.sent_at), 'HH:mm')}
          </span>
          {out && STATUS_ICON[msg.status as keyof typeof STATUS_ICON]}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
