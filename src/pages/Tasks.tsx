import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Case, CaseStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CasePanel from '@/components/CasePanel';
import { Phone, User2, Globe, CheckSquare } from 'lucide-react';

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  call: <Phone className="h-3 w-3" />,
  visit: <User2 className="h-3 w-3" />,
  web: <Globe className="h-3 w-3" />,
};

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  urgent: 'destructive', normal: 'default', low: 'secondary',
};

const COLUMNS: { status: CaseStatus; label: string; color: string }[] = [
  { status: 'new', label: 'New', color: 'bg-blue-50 dark:bg-blue-950' },
  { status: 'inprogress', label: 'In Progress', color: 'bg-amber-50 dark:bg-amber-950' },
  { status: 'done', label: 'Done', color: 'bg-green-50 dark:bg-green-950' },
];

const Tasks = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Case | null>(null);

  const { data: cases = [], isLoading } = useQuery<Case[]>({
    queryKey: ['tasks', profile?.department_id],
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('cases')
        .select('*, contacts(*), departments(*), profiles(*)')
        .order('created_at', { ascending: false });

      if (profile?.role === 'department' && profile.department_id) {
        query = query.eq('department_id', profile.department_id);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CaseStatus }) => {
      const { error } = await supabase.from('cases').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Status updated');
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <CheckSquare className="h-5 w-5" />
        <h2 className="text-xl font-semibold">
          {profile?.role === 'department' ? 'My Tasks' : 'All Tasks'}
        </h2>
        <span className="text-sm text-muted-foreground">— {cases.length} cases</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(({ status, label, color }) => {
          const col = cases.filter(c => c.status === status);
          return (
            <div key={status} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{label}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{col.length}</span>
              </div>

              <div className={`rounded-xl p-2 min-h-[200px] space-y-2 ${color}`}>
                {col.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground pt-8">No cases</p>
                )}
                {col.map(c => (
                  <div
                    key={c.id}
                    className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelected(c)}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="font-semibold text-sm leading-tight">{c.contacts?.name}</p>
                      <Badge variant={PRIORITY_VARIANT[c.priority]} className="text-[10px] px-1.5 py-0 shrink-0">
                        {c.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{c.subject}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {CHANNEL_ICON[c.channel]}
                        <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      </div>
                      {status === 'new' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: c.id, status: 'inprogress' }); }}
                        >
                          Start
                        </Button>
                      )}
                      {status === 'inprogress' && (
                        <Button
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: c.id, status: 'done' }); }}
                        >
                          Done ✓
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <CasePanel
        caseItem={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        allowEdit={false}
      />
    </div>
  );
};

export default Tasks;
