import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Case, CaseNote, Department } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Phone, Mail, Clock } from 'lucide-react';

const priorityVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  urgent: 'destructive', normal: 'default', low: 'secondary',
};

interface Props {
  caseItem: Case | null;
  open: boolean;
  onClose: () => void;
  allowEdit?: boolean;
}

const CasePanel = ({ caseItem, open, onClose, allowEdit = false }: Props) => {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const { data: notes = [] } = useQuery<CaseNote[]>({
    queryKey: ['case_notes', caseItem?.id],
    enabled: !!caseItem,
    queryFn: async () => {
      const { data } = await supabase
        .from('case_notes')
        .select('*, profiles(full_name)')
        .eq('case_id', caseItem!.id)
        .order('created_at', { ascending: true });
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

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('case_notes').insert({
        case_id: caseItem!.id, author_id: user?.id, body: note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['case_notes', caseItem?.id] });
      toast.success('Note added');
    },
  });

  const updateCase = useMutation({
    mutationFn: async (updates: Partial<Case>) => {
      const { error } = await supabase.from('cases').update(updates).eq('id', caseItem!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Case updated');
    },
  });

  if (!caseItem) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{caseItem.contacts?.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Contact info */}
          <div className="rounded-lg border bg-card p-3 space-y-1.5 text-sm">
            {caseItem.contacts?.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {caseItem.contacts.phone}
              </div>
            )}
            {caseItem.contacts?.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {caseItem.contacts.email}
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatDistanceToNow(new Date(caseItem.created_at), { addSuffix: true })}
            </div>
          </div>

          {/* Case details */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subject</span>
              <span className="font-medium">{caseItem.subject}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Priority</span>
              <Badge variant={priorityVariant[caseItem.priority]}>{caseItem.priority}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="capitalize">{caseItem.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Department</span>
              <span>{caseItem.departments?.name}</span>
            </div>
            {caseItem.due_at && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className={new Date(caseItem.due_at) < new Date() && caseItem.status !== 'done' ? 'text-destructive font-medium' : ''}>
                  {format(new Date(caseItem.due_at), 'dd MMM yyyy')}
                </span>
              </div>
            )}
          </div>

          {/* Intake notes */}
          {caseItem.notes && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Intake notes</p>
              <p>{caseItem.notes}</p>
            </div>
          )}

          {/* Edit controls — frontdesk/manager only */}
          {allowEdit && (profile?.role === 'frontdesk' || profile?.role === 'manager') && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit case</p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Re-assign department</label>
                <Select
                  value={caseItem.department_id}
                  onValueChange={(v) => updateCase.mutate({ department_id: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Priority</label>
                <Select
                  value={caseItem.priority}
                  onValueChange={(v: any) => updateCase.mutate({ priority: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Case notes */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case notes</p>
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
            {notes.map(n => (
              <div key={n.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{(n.profiles as any)?.full_name ?? 'User'}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p>{n.body}</p>
              </div>
            ))}

            <div className="space-y-2">
              <Textarea
                rows={2}
                placeholder="Add a note…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!note.trim() || addNote.isPending}
                onClick={() => addNote.mutate()}
              >
                Add note
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CasePanel;
