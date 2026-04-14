// CaseHistory — Audit trail showing who changed what and when on a case
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { History, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryRow {
  id: string; field: string; old_value: string | null; new_value: string;
  changed_at: string; profiles?: { full_name: string | null } | null;
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status', priority: 'Priority', department_id: 'Department', created: 'Created',
};

const VALUE_DISPLAY: Record<string, Record<string, string>> = {
  status:   { new: 'New', inprogress: 'In Progress', done: 'Done' },
  priority: { low: 'Low', normal: 'Normal', urgent: 'Urgent' },
};

const FIELD_COLORS: Record<string, string> = {
  status:        'bg-blue-100 text-blue-700',
  priority:      'bg-amber-100 text-amber-700',
  department_id: 'bg-purple-100 text-purple-700',
  created:       'bg-green-100 text-green-700',
};

const fmtVal = (field: string, val: string | null): string => {
  if (!val) return '—';
  return VALUE_DISPLAY[field]?.[val] ?? val.replace(/-/g,' ').replace(/_/g,' ');
};

const CaseHistory = ({ caseId }: { caseId: string }) => {
  const { data: history = [], isLoading } = useQuery<HistoryRow[]>({
    queryKey: ['case-history', caseId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('case_history')
        .select('*, profiles:actor_id(full_name)')
        .eq('case_id', caseId)
        .order('changed_at', { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      Loading history…
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit trail</p>
      </div>

      {history.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No changes recorded yet</p>
      )}

      {history.map(h => (
        <div key={h.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-dashed last:border-0">
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize shrink-0', FIELD_COLORS[h.field] ?? 'bg-muted text-muted-foreground')}>
            {FIELD_LABELS[h.field] ?? h.field}
          </span>
          {h.old_value && (
            <>
              <span className="text-muted-foreground line-through text-[11px]">{fmtVal(h.field, h.old_value)}</span>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="font-medium">{fmtVal(h.field, h.new_value)}</span>
          <span className="ml-auto text-muted-foreground/60 shrink-0">
            {h.profiles?.full_name ?? 'System'} · {formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default CaseHistory;
