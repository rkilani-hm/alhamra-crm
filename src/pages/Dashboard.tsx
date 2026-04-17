// Dashboard — personalized home page for each role
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import LeaseExpiryAlerts from '@/components/LeaseExpiryAlerts';
import {
  Phone, MessageSquare, Globe, Mail, User2,
  CheckCircle2, AlertCircle, Clock, ClipboardList,
  ArrowRight, Plus, Building2, Users, Activity, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AH = { RED: '#CD1719', NAVY: '#1e3a5f', GREEN: '#2d8653', AMBER: '#e09c1a' };

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  call:     <Phone className="h-3 w-3" />,
  visit:    <User2 className="h-3 w-3" />,
  web:      <Globe className="h-3 w-3" />,
  whatsapp: <MessageSquare className="h-3 w-3 text-green-600" />,
  email:    <Mail className="h-3 w-3" />,
};

const QuickAction = ({ label, icon: Icon, to, color }: any) => (
  <Link to={to}
    className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center hover:shadow-md hover:border-primary/30 transition-all group">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
      <Icon className="h-5 w-5" style={{ color }} />
    </div>
    <p className="text-xs font-semibold">{label}</p>
  </Link>
);

const Dashboard = () => {
  const { profile } = useAuth();
  const nav = useNavigate();
  const role = profile?.role ?? 'frontdesk';
  const isManager  = role === 'manager';
  const isFrontdesk = role === 'frontdesk';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // My open cases
  const { data: myCases = [] } = useQuery({
    queryKey: ['dashboard-my-cases', profile?.id],
    queryFn: async () => {
      const q = (supabase as any).from('cases')
        .select('id,subject,status,priority,channel,created_at,contacts(name),departments(name)')
        .neq('status', 'done')
        .order('created_at', { ascending: false }).limit(8);
      // Frontdesk/manager see all; department sees own dept
      if (role === 'department' && profile?.department_id) {
        q.eq('department_id', profile.department_id);
      }
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!profile?.id,
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', profile?.id],
    queryFn: async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const [openRes, urgentRes, doneRes, waRes] = await Promise.all([
        (supabase as any).from('cases').select('id', { count: 'exact', head: true }).neq('status','done'),
        (supabase as any).from('cases').select('id', { count: 'exact', head: true }).eq('priority','urgent').neq('status','done'),
        (supabase as any).from('cases').select('id', { count: 'exact', head: true }).eq('status','done').gte('created_at', today.toISOString()),
        // SLA breached: open cases older than 24h (simple default — AdminSla page configures per type)
        (supabase as any).from('cases').select('id', { count: 'exact', head: true }).neq('status','done').lt('created_at', new Date(Date.now() - 24*3600*1000).toISOString()),
        (supabase as any).from('wa_conversations').select('unread_count').gt('unread_count', 0),
      ]);
      return {
        open:   openRes.count ?? 0,
        urgent: urgentRes.count ?? 0,
        done:   doneRes.count ?? 0,
        waUnread: (waRes.data ?? []).reduce((s: number, r: any) => s + (r.unread_count ?? 0), 0),
      };
    },
  });

  // Recent WA messages
  const { data: waMessages = [] } = useQuery({
    queryKey: ['dashboard-wa'],
    enabled: isFrontdesk || isManager,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations')
        .select('id,chat_id,last_message,last_message_at,unread_count,contacts(name)')
        .gt('unread_count', 0)
        .order('last_message_at', { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const quickActions = isManager ? [
    { label: 'New Case',      icon: Plus,          to: '/cases/new',         color: AH.RED    },
    { label: 'Follow-up',     icon: ClipboardList, to: '/follow-up',          color: AH.AMBER  },
    { label: 'Organizations', icon: Building2,     to: '/organizations',      color: AH.NAVY   },
    { label: 'Contacts',      icon: Users,         to: '/contacts',           color: '#7c3aed' },
    { label: 'WhatsApp',      icon: MessageSquare, to: '/whatsapp',           color: '#16a34a' },
    { label: 'Reports',       icon: BarChart2,     to: '/reports',            color: '#0284c7' },
  ] : isFrontdesk ? [
    { label: 'New Case',      icon: Plus,          to: '/cases/new',         color: AH.RED    },
    { label: 'Follow-up',     icon: ClipboardList, to: '/follow-up',          color: AH.AMBER  },
    { label: 'WhatsApp',      icon: MessageSquare, to: '/whatsapp',           color: '#16a34a' },
    { label: 'Contacts',      icon: Users,         to: '/contacts',           color: '#7c3aed' },
    { label: 'Activities',    icon: Activity,      to: '/activities',         color: '#0284c7' },
    { label: 'Organizations', icon: Building2,     to: '/organizations',      color: AH.NAVY   },
  ] : [
    { label: 'My Tasks',     icon: ClipboardList, to: '/tasks',              color: AH.RED    },
    { label: 'Activities',   icon: Activity,      to: '/activities',         color: '#0284c7' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            {greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(new Date(), 'EEEE, d MMMM yyyy')} · Al Hamra Real Estate
          </p>
        </div>
        <Link to="/cases/new"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ background: AH.RED }}>
          <Plus className="h-4 w-4" /> New case
        </Link>
      </div>

      {/* KPI strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Open cases',   val: stats.open,     color: AH.NAVY,  to: '/follow-up', icon: Clock       },
            { label: 'Urgent',       val: stats.urgent,   color: AH.RED,   to: '/follow-up', icon: AlertCircle },
            { label: 'Done today',   val: stats.done,     color: AH.GREEN, to: '/follow-up', icon: CheckCircle2},
            { label: 'WA unread',    val: stats.waUnread, color: '#16a34a',to: '/whatsapp',  icon: MessageSquare},
          ].map(({ label, val, color, to, icon: Icon }) => (
            <Link key={label} to={to}
              className="rounded-xl border bg-card p-4 text-center hover:shadow-sm hover:border-primary/20 transition-all">
              <Icon className="h-4 w-4 mx-auto mb-1" style={{ color }} />
              <p className="text-2xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif', color }}>{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Quick actions</p>
        <div className={cn('grid gap-3', quickActions.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-6')}>
          {quickActions.map(a => <QuickAction key={a.to} {...a} />)}
        </div>
      </div>

      {/* Two column: my cases + WA unread */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Open cases */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Open cases</h3>
            </div>
            <Link to="/follow-up" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y max-h-[320px] overflow-y-auto scrollbar-thin">
            {myCases.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-500" />
                All caught up!
              </div>
            )}
            {myCases.map((c: any) => (
              <button key={c.id} onClick={() => nav('/follow-up')}
                className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-muted/20 transition-colors group">
                <div className={cn('h-2 w-2 rounded-full shrink-0',
                  c.priority === 'urgent' ? 'bg-red-500' : c.status === 'inprogress' ? 'bg-amber-400' : 'bg-blue-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.contacts?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground">{CHANNEL_ICON[c.channel ?? 'call']}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                  {c.priority === 'urgent' && (
                    <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-1.5 font-bold">!</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* WA unread */}
        {(isFrontdesk || isManager) && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                <h3 className="font-semibold text-sm">WhatsApp unread</h3>
              </div>
              <Link to="/whatsapp" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Open inbox <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y max-h-[320px] overflow-y-auto scrollbar-thin">
              {waMessages.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <MessageSquare className="h-5 w-5 mx-auto mb-2 text-green-400" />
                  No unread messages
                </div>
              )}
              {waMessages.map((c: any) => (
                <button key={c.id} onClick={() => nav('/whatsapp')}
                  className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-muted/20 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">
                    {(c.contacts?.name ?? c.chat_id).slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.contacts?.name ?? `+${c.chat_id}`}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.last_message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white px-1">
                        {c.unread_count}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Department view for staff */}
        {role === 'department' && (
          <div className="rounded-xl border bg-card p-5 flex flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium">My KPI this month</p>
            <Link to="/admin/kpi" className="text-xs text-primary hover:underline">View my KPIs →</Link>
          </div>
        )}
      </div>

      {/* Lease expiry alerts — manager + frontdesk only */}
      {(isManager || isFrontdesk) && <LeaseExpiryAlerts />}
    </div>
  );
};

export default Dashboard;
