import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Department } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react';

const TINT_COLORS = [
  'from-blue-500/10 to-blue-500/5',
  'from-purple-500/10 to-purple-500/5',
  'from-amber-500/10 to-amber-500/5',
  'from-green-500/10 to-green-500/5',
  'from-rose-500/10 to-rose-500/5',
  'from-teal-500/10 to-teal-500/5',
];

const AdminDepartments = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, department_id');
      return data ?? [];
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['admin-dept-cases'],
    queryFn: async () => {
      const { data } = await supabase.from('cases').select('id, department_id, status');
      return data ?? [];
    },
  });

  const staffCount = (deptId: string) => profiles.filter((p: any) => p.department_id === deptId).length;
  const openCases = (deptId: string) => cases.filter((c: any) => c.department_id === deptId && c.status !== 'done').length;
  const totalCases = (deptId: string) => cases.filter((c: any) => c.department_id === deptId).length;

  const openCreate = () => { setEditing(null); setName(''); setDialogOpen(true); };
  const openEdit = (d: Department) => { setEditing(d); setName(d.name); setDialogOpen(true); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from('departments').update({ name }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('departments').insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success(editing ? 'Department updated' : 'Department created');
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-semibold">Departments</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New department
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {departments.map((d, i) => (
          <Card key={d.id} className={`relative overflow-hidden p-5 bg-gradient-to-br ${TINT_COLORS[i % TINT_COLORS.length]}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-serif text-lg font-semibold">{d.name}</h3>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(d)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Staff', value: staffCount(d.id) },
                { label: 'Open', value: openCases(d.id) },
                { label: 'Total', value: totalCases(d.id) },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-background/60 p-2 text-center">
                  <p className="text-lg font-semibold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Created {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
            </p>
          </Card>
        ))}

        {departments.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2" />
            <p className="text-sm">No departments yet</p>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{editing ? 'Edit Department' : 'New Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Department name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Leasing" />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department?</AlertDialogTitle>
            <AlertDialogDescription>
              Staff and cases assigned to this department may need to be re-assigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDepartments;
