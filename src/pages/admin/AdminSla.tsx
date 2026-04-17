// AdminSla — Configure SLA targets per inquiry type.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Timer, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface SlaConfig {
  id: string; inquiry_type: string;
  target_hours: number; warning_hours: number; is_active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  leasing:  'Leasing inquiry',
  vendor:   'Vendor inquiry',
  visitor:  'Visitor / walk-in',
  general:  'General inquiry',
  prospect: 'Prospect inquiry',
  event:    'Photo shoot / Event',
};

const AdminSla = () => {
  const qc = useQueryClient();
  const { data: configs = [], isLoading } = useQuery<SlaConfig[]>({
    queryKey: ['sla-config'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('sla_config').select('*').order('inquiry_type');
      return data ?? [];
    },
  });

  const [edits, setEdits] = useState<Record<string, { target_hours: number; warning_hours: number }>>({});

  const save = useMutation({
    mutationFn: async (cfg: SlaConfig & { target_hours: number; warning_hours: number }) => {
      const { error } = await (supabase as any).from('sla_config').update({
        target_hours:  cfg.target_hours,
        warning_hours: Math.min(cfg.warning_hours, cfg.target_hours - 1),
        updated_at:    new Date().toISOString(),
      }).eq('id', cfg.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-config'] }); toast.success('SLA saved'); },
    onError:   () => toast.error('Failed to save SLA'),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          SLA Configuration
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Set response time targets per inquiry type. Breached cases are flagged in red.
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Response time targets</span>
        </div>

        <div className="divide-y">
          {configs.map(cfg => {
            const edit = edits[cfg.id] ?? { target_hours: cfg.target_hours, warning_hours: cfg.warning_hours };
            const dirty = edit.target_hours !== cfg.target_hours || edit.warning_hours !== cfg.warning_hours;

            return (
              <div key={cfg.id} className="px-5 py-4 flex items-center gap-6">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{TYPE_LABELS[cfg.inquiry_type] ?? cfg.inquiry_type}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Warning at {edit.warning_hours}h · Breach at {edit.target_hours}h
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="space-y-0.5 text-center">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Target (h)</label>
                    <input type="number" min={1} max={720} value={edit.target_hours}
                      onChange={e => setEdits(prev => ({
                        ...prev,
                        [cfg.id]: { ...edit, target_hours: parseInt(e.target.value) || 1 }
                      }))}
                      className="w-20 text-center rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-0.5 text-center">
                    <label className="text-[10px] text-amber-600 uppercase tracking-wide">Warning (h)</label>
                    <input type="number" min={1} max={edit.target_hours - 1} value={edit.warning_hours}
                      onChange={e => setEdits(prev => ({
                        ...prev,
                        [cfg.id]: { ...edit, warning_hours: parseInt(e.target.value) || 1 }
                      }))}
                      className="w-20 text-center rounded-lg border border-amber-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  <Button size="sm" variant={dirty ? 'default' : 'ghost'}
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate({ ...cfg, ...edit })}>
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t bg-muted/10 text-xs text-muted-foreground">
          Warning threshold must be less than the target. Cases past the target appear in red on the cases list and dashboard.
        </div>
      </div>
    </div>
  );
};

export default AdminSla;
