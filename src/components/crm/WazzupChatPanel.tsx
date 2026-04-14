// WazzupChatPanel — embeds the Wazzup24 iFrame scoped to a single contact.
// Shows full WhatsApp history for a contact directly inside the CRM.
// Used in ContactDetail and OrganizationDetail sidebars.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  chatId:    string;          // phone number digits only, e.g. "96599120803"
  channelId?: string;         // optional: scope to a specific channel
  contactName?: string;
  height?: number;
}

const WazzupChatPanel = ({ chatId, channelId, contactName, height = 500 }: Props) => {
  const { profile } = useAuth();
  const [url,     setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setUrl(null);

    const { data, error: fnErr } = await supabase.functions.invoke('wazzup-iframe', {
      body: {
        chatId,
        chatType:  'whatsapp',
        channelId: channelId ?? undefined,
        username:  profile?.full_name ?? 'CRM Agent',
        userId:    profile?.id ?? 'crm-agent',
        scope:     'card',
      },
    });

    if (fnErr || data?.error) {
      setError(fnErr?.message ?? data?.error ?? 'Failed to load WhatsApp chat');
    } else if (data?.url) {
      setUrl(data.url);
    } else {
      setError('No iFrame URL returned. Check your Wazzup24 API key.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (chatId) load();
  }, [chatId]);

  if (!chatId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No phone number — add one to see WhatsApp history</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-8">
        <RefreshCw className="h-4 w-4 animate-spin text-green-600" />
        <span className="text-sm text-muted-foreground">Loading WhatsApp history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800">WhatsApp unavailable</p>
            <p className="text-xs text-amber-700 mt-0.5">{error}</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs border-amber-300" onClick={load}>
              <RefreshCw className="h-3 w-3 mr-1.5" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-card">
      {/* Mini header */}
      <div className="flex items-center justify-between px-3 py-2 bg-green-600 text-white">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {contactName ? `WhatsApp — ${contactName}` : `WhatsApp +${chatId}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} title="Reload" className="opacity-70 hover:opacity-100 transition-opacity">
            <RefreshCw className="h-3 w-3" />
          </button>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" title="Open full screen" className="opacity-70 hover:opacity-100 transition-opacity">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <iframe
        key={url}
        src={url!}
        style={{ width: '100%', height, border: 'none', display: 'block' }}
        allow="microphone"
        title="WhatsApp Chat"
      />
    </div>
  );
};

export default WazzupChatPanel;
