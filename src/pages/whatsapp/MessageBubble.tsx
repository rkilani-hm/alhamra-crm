import { format } from 'date-fns';
import { Check, CheckCheck, Clock, Image, FileText, Mic, Video, Download } from 'lucide-react';
import { WaMessage } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_ICON = {
  sent:      <Check      className="h-3 w-3 text-muted-foreground" />,
  delivered: <CheckCheck className="h-3 w-3 text-muted-foreground" />,
  read:      <CheckCheck className="h-3 w-3 text-blue-500" />,
  failed:    <Clock      className="h-3 w-3 text-destructive" />,
};

const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url);

const MediaContent = ({ msg }: { msg: WaMessage }) => {
  const url = msg.media_url;
  const type = msg.msg_type ?? 'text';

  if (!url) {
    // Fallback placeholder for messages without a stored URL
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs">
        {type === 'image'    && <Image    className="h-4 w-4" />}
        {type === 'document' && <FileText className="h-4 w-4" />}
        {type === 'audio'    && <Mic      className="h-4 w-4" />}
        {type === 'video'    && <Video    className="h-4 w-4" />}
        <span className="capitalize">{type} attachment</span>
      </div>
    );
  }

  // Image — render inline
  if (type === 'image' || isImage(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1">
        <img
          src={url}
          alt="attachment"
          className="max-w-full rounded-lg max-h-64 object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  // Video
  if (type === 'video') {
    return (
      <video
        src={url}
        controls
        className="max-w-full rounded-lg max-h-64 mb-1"
        preload="metadata"
      />
    );
  }

  // Audio
  if (type === 'audio') {
    return <audio src={url} controls className="w-full mb-1" preload="metadata" />;
  }

  // Document / other — download link
  const filename = url.split('/').pop()?.split('?')[0] || 'file';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs hover:bg-black/15 transition-colors mb-1"
    >
      <FileText className="h-4 w-4 flex-shrink-0" />
      <span className="truncate flex-1">{filename}</span>
      <Download className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
    </a>
  );
};

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
        {msg.msg_type !== 'text' && <MediaContent msg={msg} />}

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
