// NotificationBell — live badge + dropdown for in-app notifications
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AppNotification } from '@/types';
import { Bell, FileText, MessageSquare, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  case_assigned: { icon: FileText,    color: 'text-amber-600'  },
  case_overdue:  { icon: AlertCircle, color: 'text-red-600'    },
  wa_message:    { icon: MessageSquare, color: 'text-green-600' },
  case_updated:  { icon: CheckCircle2, color: 'text-blue-600'  },
};

const NotificationBell = () => {
  const nav = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ['notifications', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('notifications').select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const unread = notifications.filter(n => !n.read).length;

  // Realtime subscription
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel('notifications:' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications', profile.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from('notifications').update({ read: true }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', profile?.id] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await (supabase as any).from('notifications').update({ read: true })
        .eq('user_id', profile!.id).eq('read', false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', profile?.id] }),
  });

  const go = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) nav(n.link);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted/50 transition-colors">
        <Bell className="h-4.5 w-4.5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border bg-card shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={() => markAll.mutate()}
                    className="text-[10px] text-primary hover:underline">Mark all read</button>
                )}
                <button onClick={() => setOpen(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[380px] overflow-y-auto divide-y">
              {notifications.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  No notifications yet
                </div>
              )}
              {notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.case_assigned;
                const Icon = cfg.icon;
                return (
                  <button key={n.id} onClick={() => go(n)}
                    className={cn(
                      'flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors',
                      !n.read && 'bg-primary/4'
                    )}>
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5')}>
                      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium', !n.read && 'font-semibold')}>{n.title}</p>
                      {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
