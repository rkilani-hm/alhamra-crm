import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format, isPast, isToday } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Case, CaseStatus, Department } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import CasePanel from '@/components/CasePanel';
import {
  Phone, User2, Globe, CheckSquare, MessageSquare, Mail, AlertCircle,
  Calendar, Clock, GripVertical, Building2, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  call:      <Phone className="h-3 w-3" />,
  visit:     <User2 className="h-3 w-3" />,
  web:       <Globe className="h-3 w-3" />,
  whatsapp:  <MessageSquare className="h-3 w-3 text-green-600" />,
  email:     <Mail className="h-3 w-3" />,
};

const COLUMNS: { status: CaseStatus; label: string; accent: string; bg: string; border: string }[] = [
  { status: 'new',        label: 'New',         accent: 'bg-blue-500',  bg: 'bg-blue-50/60',  border: 'border-blue-200' },
  { status: 'inprogress', label: 'In Progress', accent: 'bg-amber-500', bg: 'bg-amber-50/60', border: 'border-amber-200' },
  { status: 'done',       label: 'Done',        accent: 'bg-green-500', bg: 'bg-green-50/60', border: 'border-green-200' },
];

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
  low:    'bg-muted text-muted-foreground border-border',
};

// ── Case card ─────────────────────────────────────────────────
const CaseCard = ({
  c, onClick, onDragStart, isDragging,
}: {
  c: Case; onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  isDragging: boolean;
}) => {
  const overdue = c.due_at && isPast(new Date(c.due_at)) && c.status !== 'done';
  const dueToday = c.due_at && isToday(new Date(c.due_at)) && c.status !== 'done';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'group rounded-xl border bg-card p-3.5 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-all select-none',
        isDragging && 'opacity-40 scale-95',
        overdue && 'border-l-4 border-l-red-500',
        dueToday && !overdue && 'border-l-4 border-l-amber-400',
      )}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <p className="font-semibold text-sm leading-tight truncate flex-1">{c.contacts?.name ?? '—'}</p>
        <span className={cn('text-[10px] border rounded-full px-1.5 py-0.5 font-medium shrink-0', PRIORITY_STYLE[c.priority])}>
          {c.priority}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-2.5 line-clamp-2">{c.subject}</p>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {CHANNEL_ICON[c.channel] ?? <Globe className="h-3 w-3" />}
          {(c as any).departments?.name && (
            <span className="bg-muted rounded px-1.5 py-0.5 text-[10px]">{(c as any).departments.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {c.due_at && (
            <span className={cn('flex items-center gap-0.5', overdue ? 'text-red-600 font-medium' : dueToday ? 'text-amber-600 font-medium' : '')}>
              {overdue && <AlertCircle className="h-2.5 w-2.5" />}
              <Calendar className="h-2.5 w-2.5" />
              {format(new Date(c.due_at), 'dd MMM')}
            </span>
          )}
          <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Drag handle hint */}
      <div className="flex justify-center mt-1.5 opacity-0 group-hover:opacity-30 transition-opacity">
        <GripVertical className="h-3 w-3" />
      </div>
    </div>
  );
};

// ── Kanban column ─────────────────────────────────────────────
const KanbanColumn = ({
  col, cases, onCardClick, onDrop, draggingId, onDragStart,
}: {
  col: typeof COLUMNS[0];
  cases: Case[];
  onCardClick: (c: Case) => void;
  onDrop: (status: CaseStatus) => void;
  draggingId: string | null;
  onDragStart: (id: string) => void;
}) => {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn('h-2.5 w-2.5 rounded-full', col.accent)} />
        <h3 className="text-sm font-semibold">{col.label}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
          {cases.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'flex-1 rounded-xl border-2 border-dashed p-2 min-h-[300px] space-y-2.5 transition-all',
          col.bg, col.border,
          dragOver && 'border-primary bg-primary/5 scale-[1.01]',
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(col.status); }}
      >
        {cases.length === 0 && !dragOver && (
          <p className="text-center text-xs text-muted-foreground pt-10 opacity-60">
            Drop cases here
          </p>
        )}
        {cases.map(c => (
          <CaseCard
            key={c.id}
            c={c}
            onClick={() => onCardClick(c)}
            isDragging={draggingId === c.id}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(c.id); }}
          />
        ))}
      </div>
    </div>
  );
};

// ── Main Tasks page ───────────────────────────────────────────
const Tasks = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isManager = profile?.role === 'manager';
  const [selected,   setSelected]   = useState<Case | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState('all');

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['tasks', profile?.department_id, profile?.role],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Case[]> => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        let query = (supabase as any)
          .from('cases')
          .select('*, contacts(*), departments(*), profiles:created_by(full_name)')
          .order('due_at', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (profile?.role === 'department' && profile.department_id)
          query = query.eq('department_id', profile.department_id);
        const { data, error } = await query;
        if (error) break;
        all = all.concat(data ?? []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    enabled: isManager,
    queryFn: async () => { const { data } = await supabase.from('departments').select('*').order('name'); return data ?? []; },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CaseStatus }) => {
      const { error } = await (supabase as any).from('cases').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      if (status === 'done') toast.success('Case marked done ✓');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Filter
  const filtered = deptFilter === 'all' ? cases : cases.filter(c => c.department_id === deptFilter);

  // Stats
  const open    = filtered.filter(c => c.status !== 'done').length;
  const urgent  = filtered.filter(c => c.priority === 'urgent' && c.status !== 'done').length;
  const overdue = filtered.filter(c => c.due_at && isPast(new Date(c.due_at)) && c.status !== 'done').length;

  const onDrop = (targetStatus: CaseStatus) => {
    if (!draggingId) return;
    const c = cases.find(x => x.id === draggingId);
    if (!c || c.status === targetStatus) { setDraggingId(null); return; }
    updateStatus.mutate({ id: draggingId, status: targetStatus });
    setDraggingId(null);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            {isManager ? 'All Tasks' : 'My Department Tasks'}
          </h1>
        </div>

        {isManager && departments.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="flex gap-3 flex-wrap text-xs">
        {[
          { label: 'Open',    val: open,    color: 'text-foreground'   },
          { label: 'Urgent',  val: urgent,  color: 'text-red-600'      },
          { label: 'Overdue', val: overdue, color: 'text-amber-600'    },
          { label: 'Done',    val: filtered.filter(c => c.status === 'done').length, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
            <span className={cn('text-base font-light', s.color)} style={{ fontFamily: 'Cormorant Garamond, serif' }}>
              {s.val}
            </span>
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        ))}
        <div className="ml-auto text-muted-foreground flex items-center gap-1">
          <GripVertical className="h-3 w-3" /> Drag cards between columns
        </div>
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        onDragEnd={() => setDraggingId(null)}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.status}
            col={col}
            cases={filtered.filter(c => c.status === col.status)}
            onCardClick={setSelected}
            onDrop={onDrop}
            draggingId={draggingId}
            onDragStart={setDraggingId}
          />
        ))}
      </div>

      <CasePanel caseItem={selected} open={!!selected} onClose={() => setSelected(null)}
        allowEdit={isManager || profile?.role === 'frontdesk'} />
    </div>
  );
};

export default Tasks;
