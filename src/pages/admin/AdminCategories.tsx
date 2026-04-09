import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CaseCategory, InquiryType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Tag, GripVertical, Pencil, Trash2 } from 'lucide-react';

const TYPE_COLORS: Record<InquiryType, string> = {
  leasing: 'bg-blue-100 text-blue-800 border-blue-200',
  vendor: 'bg-amber-100 text-amber-800 border-amber-200',
  visitor: 'bg-green-100 text-green-800 border-green-200',
  general: 'bg-gray-100 text-gray-800 border-gray-200',
};

const TYPE_LABELS: Record<InquiryType, string> = {
  leasing: 'Leasing',
  vendor: 'Vendor',
  visitor: 'Visitor',
  general: 'General',
};

const TYPES: InquiryType[] = ['leasing', 'vendor', 'visitor', 'general'];

const AdminCategories = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | InquiryType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CaseCategory | null>(null);
  const [form, setForm] = useState({ name: '', inquiry_type: 'general' as InquiryType, description: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['case-categories'],
    queryFn: async (): Promise<CaseCategory[]> => {
      const { data } = await supabase.from('case_categories').select('*').order('sort_order').order('name');
      return (data as unknown as CaseCategory[]) ?? [];
    },
  });

  const filtered = filter === 'all' ? categories : categories.filter(c => c.inquiry_type === filter);

  // Group by inquiry_type
  const grouped = TYPES.reduce((acc, type) => {
    const items = filtered.filter(c => c.inquiry_type === type);
    if (items.length > 0) acc.push({ type, items });
    return acc;
  }, [] as { type: InquiryType; items: CaseCategory[] }[]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', inquiry_type: 'general', description: '' });
    setDialogOpen(true);
  };
  const openEdit = (c: CaseCategory) => {
    setEditing(c);
    setForm({ name: c.name, inquiry_type: c.inquiry_type, description: c.description || '' });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from('case_categories').update({
          name: form.name,
          inquiry_type: form.inquiry_type,
          description: form.description || null,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('case_categories').insert({
          name: form.name,
          inquiry_type: form.inquiry_type,
          description: form.description || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-categories'] });
      toast.success(editing ? 'Category updated' : 'Category created');
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('case_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-categories'] });
      toast.success('Category deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-semibold">Case Categories</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New category
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-6">
        {(['all', ...TYPES] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === t
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t === 'all' ? 'All' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Grouped categories */}
      <div className="space-y-6">
        {grouped.map(group => (
          <div key={group.type}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{TYPE_LABELS[group.type]}</h2>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              {group.items.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cat.name}</p>
                    {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
                  </div>
                  <Badge variant="outline" className={TYPE_COLORS[cat.inquiry_type]}>{TYPE_LABELS[cat.inquiry_type]}</Badge>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(cat)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(cat.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">No categories found</p>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Inquiry type</Label>
              <Select value={form.inquiry_type} onValueChange={v => setForm({ ...form, inquiry_type: v as InquiryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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

export default AdminCategories;
