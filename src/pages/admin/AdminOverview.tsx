import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  Users, Building2, Briefcase, BarChart2, Tag,
  ArrowRight,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  inprogress: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-800',
};

const AdminOverview = () => {
  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['admin-cases'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cases')
        .select('*, contacts(*), departments(*)')
        .order('created_at', { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: allCasesCount = 0 } = useQuery({
    queryKey: ['admin-cases-count'],
    queryFn: async () => {
      const { count } = await supabase.from('cases').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const openCases = cases.filter(c => c.status !== 'done').length;

  const stats = [
    { label: 'Total Users', value: profiles.length, icon: Users, color: 'bg-blue-100 text-blue-600' },
    { label: 'Departments', value: departments.length, icon: Building2, color: 'bg-purple-100 text-purple-600' },
    { label: 'Open Cases', value: openCases, icon: Briefcase, color: 'bg-amber-100 text-amber-600' },
    { label: 'Total Cases', value: allCasesCount, icon: BarChart2, color: 'bg-green-100 text-green-600' },
  ];

  const quickLinks = [
    { label: 'Manage Users', desc: 'Add, edit, and assign roles to staff', icon: Users, to: '/admin/users' },
    { label: 'Departments', desc: 'Organize teams and routing', icon: Building2, to: '/admin/departments' },
    { label: 'Categories', desc: 'Case inquiry types and labels', icon: Tag, to: '/admin/categories' },
  ];

  const recentUsers = profiles.slice(0, 5);

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold mb-6">Admin Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <Card key={s.label} className="stat-card p-4 relative overflow-hidden">
            <div className={`absolute top-3 right-3 rounded-lg p-2 ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="font-serif text-3xl font-light mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {quickLinks.map(q => (
          <Link key={q.to} to={q.to}>
            <Card className="stat-card p-4 flex items-center gap-3 hover:border-brand-bronze/40 transition-colors">
              <div className="rounded-lg bg-brand-bronze/10 p-2.5 text-brand-bronze">
                <q.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{q.label}</p>
                <p className="text-xs text-muted-foreground">{q.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>

      {/* Two-column panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cases */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold">Recent Cases</h2>
            <Link to="/follow-up" className="text-xs text-brand-bronze hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data yet</p>
          ) : (
            <div className="space-y-2">
              {cases.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.contacts?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.subject} · {c.departments?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status]}`}>
                      {c.status === 'inprogress' ? 'In Progress' : c.status === 'new' ? 'New' : 'Done'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Users */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold">Recent Users</h2>
            <Link to="/admin/users" className="text-xs text-brand-bronze hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data yet</p>
          ) : (
            <div className="space-y-2">
              {recentUsers.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-bronze/20 text-brand-bronze text-xs font-semibold shrink-0">
                    {u.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
