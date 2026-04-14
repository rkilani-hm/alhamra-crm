import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, subDays, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Building2, Briefcase, BarChart2, Tag, ArrowRight,
  CheckCircle2, AlertCircle, MessageSquare, Shield, Target,
  TrendingUp, Activity, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const AH = { RED: '#CD1719', NAVY: '#1e3a5f', GREEN: '#2d8653', AMBER: '#e09c1a' };

const StatCard = ({ label, value, icon: Icon, color, sub, to }: any) => {
  const el = (
    <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: color + '18' }}>
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        {to && <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />}
      </div>
      <p className="text-3xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{value}</p>
      <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{el}</Link> : el;
};

const SectionHeader = ({ title, to, label = 'View all' }: any) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-lg font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{title}</h2>
    {to && (
      <Link to={to} className="flex items-center gap-1 text-xs text-primary hover:underline">
        {label} <ArrowRight className="h-3 w-3" />
      </Link>
    )}
  </div>
);

const AdminOverview = () => {
  const nav = useNavigate();
  const since30 = subDays(new Date(), 30).toISOString();
  const today   = new Date().toDateString();

  const { data: profiles = [] }    = useQuery({ queryKey: ['admin-profiles'],
    queryFn: async () => { const { data } = await supabase.from('profiles').select('*, departments(name)').order('created_at', { ascending: false }); return (data ?? []) as any[]; } });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'],
    queryFn: async () => { const { data } = await supabase.from('departments').select('*').order('name'); return data ?? []; } });
  const { data: orgs = [] }        = useQuery({ queryKey: ['orgs-count'],
    queryFn: async () => { const { data } = await (supabase as any).from('organizations').select('id'); return data ?? []; } });
  const { data: contacts = [] }    = useQuery({ queryKey: ['contacts-count'],
    queryFn: async () => { const { data } = await (supabase as any).from('contacts').select('id'); return data ?? []; } });

  const { data: cases = [] } = useQuery({ queryKey: ['admin-cases-all'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('cases')
        .select('id,status,priority,created_at,updated_at,department_id,departments(name),contacts(name),subject')
        .order('created_at', { ascending: false }).limit(50);
      return (data ?? []) as any[];
    },
  });

  const { data: waCount = 0 } = useQuery({ queryKey: ['wa-count-30d'],
    queryFn: async () => { const { count } = await (supabase as any).from('wa_messages').select('*', { count: 'exact', head: true }).gte('sent_at', since30); return count ?? 0; },
  });

  const { data: activitiesCount = 0 } = useQuery({ queryKey: ['activities-count-30d'],
    queryFn: async () => { const { count } = await (supabase as any).from('activities').select('*', { count: 'exact', head: true }).gte('created_at', since30); return count ?? 0; },
  });

  // Computed
  const openCases   = cases.filter((c: any) => c.status !== 'done').length;
  const urgentCases = cases.filter((c: any) => c.priority === 'urgent' && c.status !== 'done').length;
  const doneToday   = cases.filter((c: any) => c.status === 'done' && new Date(c.updated_at ?? c.created_at).toDateString() === today).length;

  // Dept breakdown
  const deptCases: Record<string, { name: string; open: number; done: number }> = {};
  cases.forEach((c: any) => {
    const n = c.departments?.name ?? 'Unassigned';
    if (!deptCases[n]) deptCases[n] = { name: n, open: 0, done: 0 };
    c.status !== 'done' ? deptCases[n].open++ : deptCases[n].done++;
  });
  const deptChart = Object.values(deptCases).sort((a, b) => (b.open + b.done) - (a.open + a.done)).slice(0, 6);

  const recentCases = cases.slice(0, 6);
  const recentUsers = profiles.slice(0, 5);

  const quickLinks = [
    { label: 'Manage Users',    desc: 'Add, edit, assign roles',     icon: Users,    to: '/admin/users',       color: '#2563eb' },
    { label: 'Departments',     desc: 'Teams and routing',           icon: Building2, to: '/admin/departments', color: '#7c3aed' },
    { label: 'Authorities',     desc: 'User permissions',            icon: Shield,   to: '/admin/permissions', color: AH.NAVY  },
    { label: 'KPI Targets',     desc: 'Set team targets',            icon: Target,   to: '/admin/kpi',         color: AH.GREEN },
    { label: 'Categories',      desc: 'Case inquiry types',          icon: Tag,      to: '/admin/categories',  color: AH.AMBER },
    { label: 'Reports',         desc: 'Analytics & trends',          icon: BarChart2, to: '/reports',          color: AH.RED   },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Admin Overview</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Staff"         value={profiles.length}   icon={Users}         color="#2563eb" to="/admin/users"       sub={`${profiles.filter((p: any) => p.role === 'manager').length} managers`} />
        <StatCard label="Departments"   value={departments.length} icon={Building2}    color="#7c3aed" to="/admin/departments" />
        <StatCard label="Open Cases"    value={openCases}         icon={Briefcase}      color={AH.AMBER} to="/follow-up"       sub={`${urgentCases} urgent`} />
        <StatCard label="Done Today"    value={doneToday}         icon={CheckCircle2}   color={AH.GREEN} />
        <StatCard label="Organizations" value={orgs.length}       icon={Building2}      color={AH.NAVY}  to="/organizations"  />
        <StatCard label="Contacts"      value={contacts.length}   icon={Users}          color={AH.RED}   to="/contacts"       />
      </div>

      {/* Second strip: activity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="WA Messages (30d)"  value={waCount}         icon={MessageSquare} color={AH.GREEN} to="/whatsapp" />
        <StatCard label="Activities (30d)"   value={activitiesCount} icon={Activity}      color="#7c3aed"  to="/activities" />
        <StatCard label="Urgent Open"        value={urgentCases}     icon={AlertCircle}   color={AH.RED}   to="/follow-up" />
        <StatCard label="Total Cases"        value={cases.length}    icon={BarChart2}     color={AH.NAVY}  to="/reports"   sub="(last 50)" />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickLinks.map(q => (
          <Link key={q.to} to={q.to}
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center hover:shadow-md hover:border-primary/30 transition-all group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: q.color + '18' }}>
              <q.icon className="h-5 w-5" style={{ color: q.color }} />
            </div>
            <p className="text-xs font-semibold">{q.label}</p>
            <p className="text-[10px] text-muted-foreground">{q.desc}</p>
          </Link>
        ))}
      </div>

      {/* Department chart + recent cases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Dept breakdown */}
        <div className="rounded-xl border bg-card p-5">
          <SectionHeader title="Cases by department" to="/reports" label="Full report" />
          {deptChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptChart} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="open" name="Open"     fill={AH.AMBER}  radius={[0,3,3,0]} />
                <Bar dataKey="done" name="Resolved" fill={AH.GREEN}  radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground py-10 text-center">No cases yet</p>}
        </div>

        {/* Recent cases */}
        <div className="rounded-xl border bg-card p-5">
          <SectionHeader title="Recent cases" to="/follow-up" />
          <div className="space-y-1">
            {recentCases.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">No cases yet</p>}
            {recentCases.map((c: any) => (
              <button key={c.id} onClick={() => nav('/follow-up')}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 hover:bg-muted/30 text-left transition-colors group">
                <div className={cn('h-2 w-2 rounded-full shrink-0', c.status === 'done' ? 'bg-green-500' : c.priority === 'urgent' ? 'bg-red-500' : 'bg-amber-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.contacts?.name ?? 'Unknown'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.subject}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-[10px] rounded-full px-1.5 py-0.5 font-medium',
                    c.status === 'done' ? 'bg-green-100 text-green-700' : c.status === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
                    {c.status === 'inprogress' ? 'Active' : c.status}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent users */}
      <div className="rounded-xl border bg-card p-5">
        <SectionHeader title="Team" to="/admin/users" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {recentUsers.map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {(u.full_name ?? '??').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name ?? 'Unnamed'}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{u.role?.replace('_',' ')} · {(u.departments as any)?.name ?? 'No dept'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
