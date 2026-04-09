import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format, isPast } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Case, Department } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import CasePanel from '@/components/CasePanel';
import { ClipboardList, Search, AlertCircle } from 'lucide-react';

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  urgent: 'destructive', normal: 'default', low: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  inprogress: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
};

const FollowUp = () => {
  const [selected, setSelected] = useState<Case | null>(null);
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: cases = [], isLoading } = useQuery<Case[]>({
    queryKey: ['cases'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('cases')
        .select('*, contacts(*), departments(*), profiles(*)')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const now = new Date();
  const isOverdue = (c: Case) => c.due_at && isPast(new Date(c.due_at)) && c.status !== 'done';

  const filtered = useMemo(() => {
    return cases.filter(c => {
      if (deptFilter !== 'all' && c.department_id !== deptFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.contacts?.name?.toLowerCase().includes(q) && !c.subject.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [cases, deptFilter, statusFilter, priorityFilter, search]);

  // Summary stats
  const open = cases.filter(c => c.status !== 'done').length;
  const urgent = cases.filter(c => c.priority === 'urgent' && c.status !== 'done').length;
  const overdue = cases.filter(isOverdue).length;
  const doneToday = cases.filter(c => {
    if (c.status !== 'done') return false;
    const d = new Date(c.created_at);
    return d.toDateString() === now.toDateString();
  }).length;

  const stats = [
    { label: 'Open', value: open, color: 'text-foreground' },
    { label: 'Urgent', value: urgent, color: 'text-destructive' },
    { label: 'Overdue', value: overdue, color: 'text-destructive' },
    { label: 'Done today', value: doneToday, color: 'text-green-600' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <ClipboardList className="h-5 w-5" />
        <h1 className="font-serif text-2xl font-semibold">Follow-up Tracker</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or subject…"
            className="pl-8 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="inprogress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">Contact</th>
                <th className="px-3 py-2.5 text-left">Subject</th>
                <th className="px-3 py-2.5 text-left">Department</th>
                <th className="px-3 py-2.5 text-left">Priority</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Created</th>
                <th className="px-3 py-2.5 text-left">Due</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No cases found</td></tr>
              )}
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className={cn(
                    'bg-card hover:bg-muted/30 transition-colors',
                    isOverdue(c) && 'border-l-2 border-l-destructive'
                  )}
                >
                  <td className="px-3 py-2.5 font-medium">{c.contacts?.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[160px] truncate">{c.subject}</td>
                  <td className="px-3 py-2.5">{c.departments?.name}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={PRIORITY_VARIANT[c.priority]}>{c.priority}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[c.status])}>
                      {c.status === 'inprogress' ? 'In Progress' : c.status === 'new' ? 'New' : 'Done'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {c.due_at ? (
                      <span className={cn(isOverdue(c) && 'text-destructive font-medium flex items-center gap-1')}>
                        {isOverdue(c) && <AlertCircle className="h-3 w-3" />}
                        {format(new Date(c.due_at), 'dd MMM')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelected(c)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CasePanel
        caseItem={selected}
        open={!!selected}
        onClose={() => { setSelected(null); }}
        allowEdit={true}
      />
    </div>
  );
};

export default FollowUp;
