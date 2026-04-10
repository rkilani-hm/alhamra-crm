import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Activity, ActivityType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActivityIcon, ACTIVITY_CONFIG } from '@/components/crm/ActivityIcon';
import LogActivityModal from '@/components/crm/LogActivityModal';
import { toast } from 'sonner';
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from 'date-fns';
import { Plus, Search, CheckCircle2, Circle, Calendar, Clock, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPES: ('all' | ActivityType)[] = ['all','call','meeting','whatsapp','email','visit','task','note'];

const ActivitiesPage = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all');
  const [doneFilter, setDoneFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [logOpen, setLogOpen]   = useState(false);

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ['activities', typeFilter, doneFilter],
    queryFn: async () => {
      let q = (supabase as any)
        .from('activities')
        .select('*, organizations(id,name), contacts(id,name), cases(id,subject), profiles:created_by(id,full_name), departments(id,name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (typeFilter !== 'all') q = q.eq('type', typeFilter);
      if (doneFilter === 'pending') q = q.eq('done', false);
      if (doneFilter === 'done') q = q.eq('done', true);
      const { data } = await q;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('activities')
        .update({ done: true, done_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = activities.filter(a =>
    !search ||
    a.subject.toLowerCase().includes(search.toLowerCase()) ||
    (a.organizations as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (a.contacts as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount  = activities.filter(a => !a.done).length;
  const overdueCount  = activities.filter(a => !a.done && a.scheduled_at && isPast(new Date(a.scheduled_at))).length;
  const todayCount    = activities.filter(a => a.scheduled_at && isToday(new Date(a.scheduled_at))).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Activities</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pendingCount} pending · {overdueCount > 0 && <span className="text-red-600">{overdueCount} overdue · </span>}{todayCount} today
          </p>
        </div>
        <Button onClick={() => setLogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Log activity
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'Total logged', val: activities.length, icon: LayoutList },
          { label:'Pending', val: pendingCount, icon: Circle, color: 'text-amber-600' },
          { label:'Overdue', val: overdueCount, icon: Clock, color: overdueCount > 0 ? 'text-red-600' : '' },
          { label:'Done this month', val: activities.filter(a => a.done).length, icon: CheckCircle2, color: 'text-green-600' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4 text-center">
            <div className={cn('mx-auto mb-1', color ?? 'text-muted-foreground')}><Icon className="h-4 w-4 mx-auto" /></div>
            <p className="text-2xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{val}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search activities…" className="pl-9 h-9 w-64" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(t => {
            const cfg = t !== 'all' ? ACTIVITY_CONFIG[t] : null;
            const Icon = cfg?.icon;
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
                )}>
                {Icon && <Icon className="h-3 w-3" />}{t}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          {(['all','pending','done'] as const).map(d => (
            <button key={d} onClick={() => setDoneFilter(d)}
              className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                doneFilter === d ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
              )}>{d}</button>
          ))}
        </div>
      </div>

      {/* Activity list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">No activities found</p>
          <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Log first activity
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {filtered.map(a => {
            const isOverdue = !a.done && a.scheduled_at && isPast(new Date(a.scheduled_at));
            return (
              <div key={a.id} className={cn('flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/20', isOverdue && 'bg-red-50/30')}>
                <ActivityIcon type={a.type} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className={cn('font-medium text-sm', a.done && 'line-through text-muted-foreground')}>{a.subject}</p>
                      {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.body}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {(a.organizations as any)?.name && (
                          <button onClick={() => nav(`/organizations/${(a.organizations as any).id}`)}
                            className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full hover:bg-primary/20">
                            <Building2 className="h-2.5 w-2.5" />{(a.organizations as any).name}
                          </button>
                        )}
                        {(a.contacts as any)?.name && (
                          <button onClick={() => nav(`/contacts/${(a.contacts as any).id}`)}
                            className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full hover:bg-blue-100">
                            {(a.contacts as any).name}
                          </button>
                        )}
                        {a.outcome && <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">→ {a.outcome}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                      <p className="text-[10px] text-muted-foreground">{(a.profiles as any)?.full_name}</p>
                      {a.scheduled_at && (
                        <p className={cn('text-[10px] mt-0.5', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                          {isToday(new Date(a.scheduled_at)) ? 'Today' : isTomorrow(new Date(a.scheduled_at)) ? 'Tomorrow' : format(new Date(a.scheduled_at), 'd MMM')}
                          {isOverdue && ' — overdue'}
                        </p>
                      )}
                      {!a.done && (
                        <button onClick={() => markDone.mutate(a.id)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 hover:text-green-600 transition-colors">
                          <Circle className="h-3 w-3" /> Mark done
                        </button>
                      )}
                      {a.done && <span className="flex items-center gap-0.5 text-[10px] text-green-600 mt-1"><CheckCircle2 className="h-3 w-3" /> Done</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
};

// Fix missing import
import { LayoutList } from 'lucide-react';

export default ActivitiesPage;
