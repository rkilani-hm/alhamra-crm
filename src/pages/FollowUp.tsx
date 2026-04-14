import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format, isPast } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Case, Department } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import CasePanel from '@/components/CasePanel';
import { toast } from 'sonner';
import {
  ClipboardList, Search, AlertCircle, CheckSquare, Square,
  CheckCircle2, Download, ChevronDown, X, Users, Loader2,
  ArrowUpDown, Circle,
} from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  normal: 'bg-slate-100 text-slate-700 border-slate-200',
  low:    'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  new:        'bg-blue-100 text-blue-700',
  inprogress: 'bg-amber-100 text-amber-700',
  done:       'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New', inprogress: 'In Progress', done: 'Done',
};

// CSV export
const exportCsv = (rows: Case[]) => {
  if (!rows.length) return;
  const headers = ['ID', 'Contact', 'Subject', 'Department', 'Priority', 'Status', 'Channel', 'Created', 'Due'];
  const body = rows.map(c => [
    c.id, c.contacts?.name ?? '', c.subject, c.departments?.name ?? '',
    c.priority, c.status, c.channel ?? '', c.created_at, c.due_at ?? '',
  ].map(v => `"${v}"`).join(','));
  const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `cases-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
};

type SortKey = 'created_at' | 'due_at' | 'priority' | 'status';

const FollowUp = () => {
  const qc = useQueryClient();
  const [selected, setSelected]           = useState<Case | null>(null);
  const [deptFilter, setDeptFilter]       = useState('all');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch]               = useState('');
  const [checkedIds, setCheckedIds]       = useState<Set<string>>(new Set());
  const [bulkMenuOpen, setBulkMenuOpen]   = useState(false);
  const [sortKey, setSortKey]             = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc]             = useState(false);

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['cases'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Case[]> => {
      const { data } = await (supabase as any)
        .from('cases')
        .select('*, contacts(*), departments(*), profiles:created_by(full_name)')
        .order('created_at', { ascending: false });
      return (data ?? []) as Case[];
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => { const { data } = await supabase.from('departments').select('*').order('name'); return data ?? []; },
  });

  const isOverdue = (c: Case) => c.due_at && isPast(new Date(c.due_at)) && c.status !== 'done';

  const PRIORITY_WEIGHT: Record<string, number> = { urgent: 3, normal: 2, low: 1 };
  const STATUS_WEIGHT:   Record<string, number> = { new: 3, inprogress: 2, done: 1 };

  const filtered = useMemo(() => {
    let list = cases.filter(c => {
      if (deptFilter !== 'all' && c.department_id !== deptFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.contacts?.name?.toLowerCase().includes(q) && !c.subject?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortKey === 'due_at') {
        const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        cmp = ad - bd;
      }
      else if (sortKey === 'priority') cmp = (PRIORITY_WEIGHT[a.priority] ?? 0) - (PRIORITY_WEIGHT[b.priority] ?? 0);
      else if (sortKey === 'status')   cmp = (STATUS_WEIGHT[a.status] ?? 0)   - (STATUS_WEIGHT[b.status] ?? 0);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [cases, deptFilter, statusFilter, priorityFilter, search, sortKey, sortAsc]);

  // Summary stats
  const open     = cases.filter(c => c.status !== 'done').length;
  const urgent   = cases.filter(c => c.priority === 'urgent' && c.status !== 'done').length;
  const overdue  = cases.filter(isOverdue).length;
  const doneToday = cases.filter(c => c.status === 'done' && new Date(c.created_at).toDateString() === new Date().toDateString()).length;

  // Checkbox logic
  const allChecked = filtered.length > 0 && filtered.every(c => checkedIds.has(c.id));
  const someChecked = checkedIds.size > 0 && !allChecked;

  const toggleAll = () => {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(filtered.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(checkedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setCheckedIds(next);
  };

  // Bulk mutations
  const bulkUpdate = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      const ids = [...checkedIds];
      const { error } = await (supabase as any).from('cases').update({ [field]: value })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count, vars) => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      setCheckedIds(new Set());
      setBulkMenuOpen(false);
      toast.success(`Updated ${count} case${count !== 1 ? 's' : ''}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => { if (sortKey === k) setSortAsc(a => !a); else { setSortKey(k); setSortAsc(false); } }}
      className="flex items-center gap-1 hover:text-foreground transition-colors group">
      {label}
      <ArrowUpDown className={cn('h-3 w-3 transition-colors', sortKey === k ? 'text-primary' : 'text-muted-foreground/40 group-hover:text-muted-foreground')} />
    </button>
  );

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Follow-up Tracker</h1>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportCsv(filtered)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open',      value: open,      color: 'text-foreground',   bg: 'bg-card',          icon: Circle },
          { label: 'Urgent',    value: urgent,    color: 'text-red-600',      bg: 'bg-red-50',        icon: AlertCircle },
          { label: 'Overdue',   value: overdue,   color: 'text-amber-600',    bg: 'bg-amber-50',      icon: AlertCircle },
          { label: 'Done today',value: doneToday, color: 'text-green-600',    bg: 'bg-green-50',      icon: CheckCircle2 },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn('rounded-xl border p-4 text-center', bg)}>
            <Icon className={cn('h-4 w-4 mx-auto mb-1', color)} />
            <p className={cn('text-2xl font-light', color)} style={{ fontFamily: 'Cormorant Garamond, serif' }}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters + bulk toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search name or subject…" className="pl-8 h-9 text-sm" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="inprogress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk action bar */}
        {checkedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2">
            <span className="text-sm font-medium text-primary">{checkedIds.size} selected</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* Mark done */}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                disabled={bulkUpdate.isPending}
                onClick={() => bulkUpdate.mutate({ field: 'status', value: 'done' })}>
                <CheckCircle2 className="h-3 w-3" /> Mark done
              </Button>
              {/* Set urgent */}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                disabled={bulkUpdate.isPending}
                onClick={() => bulkUpdate.mutate({ field: 'priority', value: 'urgent' })}>
                <AlertCircle className="h-3 w-3" /> Set urgent
              </Button>
              {/* Assign dept */}
              <div className="relative">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  disabled={bulkUpdate.isPending}
                  onClick={() => setBulkMenuOpen(o => !o)}>
                  <Users className="h-3 w-3" /> Assign dept <ChevronDown className="h-3 w-3" />
                </Button>
                {bulkMenuOpen && (
                  <div className="absolute top-8 left-0 z-30 w-48 rounded-lg border bg-card shadow-xl py-1">
                    {departments.map(d => (
                      <button key={d.id} onClick={() => bulkUpdate.mutate({ field: 'department_id', value: d.id })}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-left">
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setCheckedIds(new Set())} className="ml-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              {bulkUpdate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-3 w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allChecked
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : someChecked
                      ? <div className="h-4 w-4 rounded border-2 border-primary bg-primary/20" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </th>
                <th className="px-3 py-3 text-left font-medium">Contact</th>
                <th className="px-3 py-3 text-left font-medium">Subject</th>
                <th className="px-3 py-3 text-left font-medium">Dept</th>
                <th className="px-3 py-3 text-left font-medium"><SortBtn label="Priority" k="priority" /></th>
                <th className="px-3 py-3 text-left font-medium"><SortBtn label="Status" k="status" /></th>
                <th className="px-3 py-3 text-left font-medium"><SortBtn label="Created" k="created_at" /></th>
                <th className="px-3 py-3 text-left font-medium"><SortBtn label="Due" k="due_at" /></th>
                <th className="px-3 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No cases found</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id}
                  className={cn(
                    'hover:bg-muted/20 transition-colors group',
                    checkedIds.has(c.id) && 'bg-primary/4',
                    isOverdue(c) && 'border-l-2 border-l-destructive',
                  )}>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggleOne(c.id)} className="flex items-center justify-center">
                      {checkedIds.has(c.id)
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-sm truncate max-w-[120px]">{c.contacts?.name ?? '—'}</p>
                    {(c as any).profiles?.full_name && (
                      <p className="text-[10px] text-muted-foreground">{(c as any).profiles.full_name}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate text-xs">{c.subject}</td>
                  <td className="px-3 py-2.5 text-xs">{c.departments?.name ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', PRIORITY_COLORS[c.priority])}>
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[c.status])}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {c.due_at ? (
                      <span className={cn('flex items-center gap-1', isOverdue(c) ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                        {isOverdue(c) && <AlertCircle className="h-3 w-3" />}
                        {format(new Date(c.due_at), 'dd MMM')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setSelected(c)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
              {filtered.length} case{filtered.length !== 1 ? 's' : ''} · {cases.filter(c => c.status !== 'done').length} open
            </div>
          )}
        </div>
      )}

      <CasePanel caseItem={selected} open={!!selected} onClose={() => setSelected(null)} allowEdit />
    </div>
  );
};

export default FollowUp;
