import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { KpiTarget, Profile, Department } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { BarChart2, Target, Plus, TrendingUp, CheckCircle2, Clock, Users, Briefcase, Activity, Edit2, Trash2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// ── Gauge / progress bar ──────────────────────────────────────
const KpiBar = ({ label, actual, target, unit = '', icon: Icon, color }: any) => {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const status = pct >= 90 ? 'green' : pct >= 60 ? 'amber' : 'red';
  const STATUS_COLOR = { green: 'bg-green-500', amber: 'bg-amber-400', red: 'bg-red-500' };
  const TEXT_COLOR   = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700' };
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-3.5 w-3.5 text-primary" /></div>}
          <p className="text-sm font-medium">{label}</p>
        </div>
        <div className="text-right">
          <p className={cn('text-xl font-light', TEXT_COLOR[status])} style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            {actual}<span className="text-xs text-muted-foreground ml-0.5">{unit}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">of {target}{unit} target</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', STATUS_COLOR[status])} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn('text-xs font-semibold tabular-nums', TEXT_COLOR[status])}>{pct}%</span>
      </div>
    </div>
  );
};

// ── Set Target Modal ──────────────────────────────────────────
const SetTargetModal = ({ open, onClose, target }: { open: boolean; onClose: () => void; target?: KpiTarget | null }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState({
    scope:          target ? (target.user_id ? 'user' : 'dept') : 'user',
    user_id:        target?.user_id ?? '',
    department_id:  target?.department_id ?? '',
    period_type:    target?.period_type ?? 'monthly',
    period_start:   target?.period_start ?? format(startOfMonth(now), 'yyyy-MM-dd'),
    period_end:     target?.period_end ?? format(endOfMonth(now), 'yyyy-MM-dd'),
    target_cases_created:    String(target?.target_cases_created ?? ''),
    target_cases_resolved:   String(target?.target_cases_resolved ?? ''),
    target_response_hours:   String(target?.target_response_hours ?? ''),
    target_resolution_hours: String(target?.target_resolution_hours ?? ''),
    target_activities:       String(target?.target_activities ?? ''),
    target_whatsapp_replies: String(target?.target_whatsapp_replies ?? ''),
  });

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => { const { data } = await supabase.from('profiles').select('id,full_name,role').not('full_name','is',null); return data as unknown as Profile[]; },
  });
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => { const { data } = await supabase.from('departments').select('*').order('name'); return data ?? []; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const n = (v: string) => v ? Number(v) : null;
      const payload = {
        user_id:         form.scope === 'user' ? form.user_id || null : null,
        department_id:   form.scope === 'dept' ? form.department_id || null : null,
        period_type:     form.period_type,
        period_start:    form.period_start,
        period_end:      form.period_end,
        target_cases_created:    n(form.target_cases_created),
        target_cases_resolved:   n(form.target_cases_resolved),
        target_response_hours:   n(form.target_response_hours),
        target_resolution_hours: n(form.target_resolution_hours),
        target_activities:       n(form.target_activities),
        target_whatsapp_replies: n(form.target_whatsapp_replies),
        created_by: user?.id,
      };
      if (target?.id) {
        const { error } = await (supabase as any).from('kpi_targets').update(payload).eq('id', target.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('kpi_targets').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kpi-targets'] }); toast.success('Target saved'); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const f = (k: keyof typeof form) => (e: any) => setForm(p => ({ ...p, [k]: e.target?.value ?? e }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{target ? 'Edit KPI Target' : 'Set KPI Target'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Scope */}
          <div className="flex gap-2">
            {(['user','dept'] as const).map(s => (
              <button key={s} onClick={() => setForm(p => ({...p, scope: s}))}
                className={cn('flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-colors',
                  form.scope === s ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted')}>
                {s === 'user' ? '👤 User target' : '🏢 Department target'}
              </button>
            ))}
          </div>

          {/* Scope selector */}
          {form.scope === 'user' ? (
            <div><Label className="text-xs">User</Label>
              <Select value={form.user_id} onValueChange={v => setForm(p => ({...p, user_id: v}))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select></div>
          ) : (
            <div><Label className="text-xs">Department</Label>
              <Select value={form.department_id} onValueChange={v => setForm(p => ({...p, department_id: v}))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select dept…" /></SelectTrigger>
                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select></div>
          )}

          {/* Period */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1"><Label className="text-xs">Period</Label>
              <Select value={form.period_type} onValueChange={v => setForm(p => ({...p, period_type: v as any}))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['daily','weekly','monthly','quarterly'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label className="text-xs">Start</Label>
              <Input type="date" value={form.period_start} onChange={f('period_start')} className="h-9 mt-1 text-xs" /></div>
            <div><Label className="text-xs">End</Label>
              <Input type="date" value={form.period_end} onChange={f('period_end')} className="h-9 mt-1 text-xs" /></div>
          </div>

          {/* Targets */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target values (leave blank to skip)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Cases created', 'target_cases_created'],
                ['Cases resolved', 'target_cases_resolved'],
                ['Response time (h)', 'target_response_hours'],
                ['Resolution time (h)', 'target_resolution_hours'],
                ['Activities logged', 'target_activities'],
                ['WhatsApp replies', 'target_whatsapp_replies'],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label className="text-[10px]">{label}</Label>
                  <Input type="number" min="0" value={(form as any)[key]} onChange={f(key as any)}
                    className="h-7 mt-0.5 text-xs" placeholder="—" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save target'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main KPI Page ─────────────────────────────────────────────
const AdminKPI = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KpiTarget | null>(null);
  const [viewUser, setViewUser] = useState<string>(profile?.id ?? '');
  const isManager = profile?.role === 'manager';

  const now = new Date();
  const periodStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const periodEnd   = format(endOfMonth(now), 'yyyy-MM-dd');

  // KPI targets for this period
  const { data: targets = [] } = useQuery<KpiTarget[]>({
    queryKey: ['kpi-targets'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('kpi_targets')
        .select('*, profiles(id,full_name), departments(id,name)')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  // Actual performance data for selected user this month
  const { data: actuals } = useQuery({
    queryKey: ['kpi-actuals', viewUser, periodStart],
    enabled: !!viewUser,
    queryFn: async () => {
      const [casesRes, resolvedRes, activitiesRes, waRes] = await Promise.all([
        (supabase as any).from('cases').select('id, created_at').eq('created_by', viewUser)
          .gte('created_at', periodStart + 'T00:00:00').lte('created_at', periodEnd + 'T23:59:59'),
        (supabase as any).from('cases').select('id, created_at').eq('created_by', viewUser)
          .eq('status','done').gte('created_at', periodStart + 'T00:00:00'),
        (supabase as any).from('activities').select('id').eq('created_by', viewUser)
          .gte('created_at', periodStart + 'T00:00:00'),
        (supabase as any).from('wa_messages').select('id, sent_at').eq('direction','outbound')
          .gte('sent_at', periodStart + 'T00:00:00'),
      ]);
      return {
        cases_created:    casesRes.data?.length ?? 0,
        cases_resolved:   resolvedRes.data?.length ?? 0,
        activities:       activitiesRes.data?.length ?? 0,
        whatsapp_replies: waRes.data?.length ?? 0,
      };
    },
  });

  // Find active target for selected user
  const userTarget = targets.find(t =>
    t.user_id === viewUser && t.period_start <= periodEnd && t.period_end >= periodStart
  ) ?? targets.find(t => !t.user_id && t.period_start <= periodEnd) ?? null;

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => { const { data } = await supabase.from('profiles').select('id,full_name,role').not('full_name','is',null); return data as unknown as Profile[]; },
  });

  const deleteTarget = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from('kpi_targets').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kpi-targets'] }); toast.success('Target removed'); },
    onError: (e: any) => toast.error(e.message),
  });

  // Department comparison chart
  const { data: deptActuals = [] } = useQuery({
    queryKey: ['kpi-dept-actuals', periodStart],
    enabled: isManager,
    queryFn: async () => {
      const { data: depts } = await supabase.from('departments').select('id, name');
      if (!depts) return [];
      const results = await Promise.all(depts.map(async (d: any) => {
        const { data: cases } = await (supabase as any).from('cases')
          .select('id').eq('department_id', d.id)
          .gte('created_at', periodStart + 'T00:00:00');
        const { data: resolved } = await (supabase as any).from('cases')
          .select('id').eq('department_id', d.id).eq('status','done')
          .gte('created_at', periodStart + 'T00:00:00');
        return { name: d.name, cases: cases?.length ?? 0, resolved: resolved?.length ?? 0 };
      }));
      return results;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>KPI Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(now, 'MMMM yyyy')} · performance targets & actuals
          </p>
        </div>
        {isManager && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Set target
          </Button>
        )}
      </div>

      {/* User selector */}
      {isManager && (
        <div className="flex gap-2 flex-wrap">
          {profiles.map(p => (
            <button key={p.id} onClick={() => setViewUser(p.id)}
              className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                viewUser === p.id ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted')}>
              <div className="h-5 w-5 rounded-full bg-current/20 flex items-center justify-center text-[10px] font-bold">
                {(p.full_name ?? 'U').slice(0,2).toUpperCase()}
              </div>
              {p.full_name}
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {actuals && userTarget && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {userTarget.target_cases_created != null && (
            <KpiBar label="Cases Created" actual={actuals.cases_created} target={userTarget.target_cases_created} icon={Briefcase} />
          )}
          {userTarget.target_cases_resolved != null && (
            <KpiBar label="Cases Resolved" actual={actuals.cases_resolved} target={userTarget.target_cases_resolved} icon={CheckCircle2} />
          )}
          {userTarget.target_activities != null && (
            <KpiBar label="Activities Logged" actual={actuals.activities} target={userTarget.target_activities} icon={Activity} />
          )}
          {userTarget.target_whatsapp_replies != null && (
            <KpiBar label="WhatsApp Replies" actual={actuals.whatsapp_replies} target={userTarget.target_whatsapp_replies} icon={TrendingUp} />
          )}
        </div>
      )}

      {actuals && !userTarget && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No targets set for this period</p>
          {isManager && <Button size="sm" variant="outline" className="mt-3" onClick={() => setModalOpen(true)}>Set targets</Button>}
        </div>
      )}

      {/* Raw actuals summary */}
      {actuals && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Cases created', val: actuals.cases_created, icon: Briefcase, color: 'text-blue-600' },
            { label: 'Cases resolved', val: actuals.cases_resolved, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Activities', val: actuals.activities, icon: Activity, color: 'text-purple-600' },
            { label: 'WA replies', val: actuals.whatsapp_replies, icon: TrendingUp, color: 'text-emerald-600' },
          ].map(({ label, val, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4 text-center">
              <Icon className={cn('h-5 w-5 mx-auto mb-1', color)} />
              <p className="text-2xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Department comparison chart */}
      {isManager && deptActuals.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-medium text-sm mb-4">Department performance — {format(now, 'MMMM yyyy')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptActuals} barSize={20} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,20%,88%)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
              <Tooltip />
              <Bar dataKey="cases"    name="Cases created" fill="hsl(213,50%,45%)"  radius={[4,4,0,0]} />
              <Bar dataKey="resolved" name="Resolved"      fill="hsl(152,55%,40%)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Targets list (manager only) */}
      {isManager && targets.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-medium text-sm">All KPI Targets</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20 border-b">
              <tr>
                {['Scope', 'Period', 'Created', 'Resolved', 'Response h', 'Resolution h', 'Activities', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {targets.map(t => (
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {t.user_id ? <Users className="h-3.5 w-3.5 text-blue-500" /> : <Building2 className="h-3.5 w-3.5 text-purple-500" />}
                      <span className="text-xs font-medium">
                        {t.user_id ? (t.profiles as any)?.full_name : (t.departments as any)?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">{t.period_type} {format(new Date(t.period_start), 'MMM d')}–{format(new Date(t.period_end), 'd')}</td>
                  {['target_cases_created','target_cases_resolved','target_response_hours','target_resolution_hours','target_activities'].map(f => (
                    <td key={f} className="px-4 py-2.5 text-xs text-center">
                      {(t as any)[f] != null ? (t as any)[f] : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(t); setModalOpen(true); }} className="p-1.5 rounded hover:bg-muted transition-colors">
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteTarget.mutate(t.id)} className="p-1.5 rounded hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SetTargetModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} target={editing} />
    </div>
  );
};

export default AdminKPI;
