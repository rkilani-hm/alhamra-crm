import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Organization, OrgType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Plus, Search, Users, Briefcase, Phone, Globe, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_COLORS: Record<OrgType, string> = {
  tenant:   'bg-blue-50 text-blue-700 border-blue-200',
  vendor:   'bg-purple-50 text-purple-700 border-purple-200',
  partner:  'bg-green-50 text-green-700 border-green-200',
  prospect: 'bg-amber-50 text-amber-700 border-amber-200',
  other:    'bg-slate-50 text-slate-700 border-slate-200',
};

const NewOrgModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', type: 'tenant' as OrgType, industry: '', phone: '',
    email: '', website: '', address: '', sap_bp_number: '', description: '',
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required');
      const { data, error } = await (supabase as any).from('organizations').insert({
        ...form,
        name:       form.name.trim(),
        created_by: user?.id,
        owner_id:   user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created');
      onClose();
      nav(`/organizations/${data.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Organization name *</Label>
              <Input value={form.name} onChange={f('name')} placeholder="Al Hamra Tower LLC"
                className="h-9 mt-1" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v: OrgType) => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['tenant','vendor','partner','prospect','other'] as OrgType[]).map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Industry</Label>
              <Input value={form.industry} onChange={f('industry')} placeholder="Real Estate, Finance…"
                className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={f('phone')} placeholder="+965 2XXX XXXX"
                className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={f('email')} placeholder="info@company.com"
                className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">SAP BP Number</Label>
              <Input value={form.sap_bp_number} onChange={f('sap_bp_number')} placeholder="BP-12345"
                className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Website</Label>
              <Input value={form.website} onChange={f('website')} placeholder="https://…"
                className="h-9 mt-1 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={f('address')} placeholder="Street, Building, Floor"
                className="h-9 mt-1 text-xs" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim()}>
            {create.isPending ? 'Creating…' : 'Create organization'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const OrganizationsList = () => {
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false);

  const { data: orgs = [], isLoading } = useQuery<(Organization & { contact_count: number; case_count: number })[]>({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('organizations')
        .select('*, contacts(id), cases:cases!contact_id(id)')
        .order('name');
      return (data ?? []).map((o: any) => ({
        ...o,
        contact_count: o.contacts?.length ?? 0,
        case_count:    0,
      }));
    },
    refetchInterval: 30_000,
  });

  const filtered = orgs.filter(o => {
    const matchSearch = !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.industry?.toLowerCase().includes(search.toLowerCase()) ||
      o.sap_bp_number?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || o.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Organizations</h1>
          <p className="text-muted-foreground text-sm mt-1">{orgs.length} companies · full history per organization</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New organization
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, industry, SAP…" className="pl-9 h-9" />
        </div>
        <div className="flex gap-1">
          {(['all','tenant','vendor','partner','prospect','other']).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
              )}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {(['tenant','vendor','partner','prospect','other'] as OrgType[]).map(t => (
          <div key={t} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
              {orgs.filter(o => o.type === t).length}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{t}s</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {search ? 'No organizations match your search' : 'No organizations yet'}
            </p>
            <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add first organization
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                {['Organization','Type','Industry','SAP BP','Contacts','Phone',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(org => (
                <tr key={org.id} className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => nav(`/organizations/${org.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-sm">
                        {org.name.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        {org.email && <p className="text-xs text-muted-foreground">{org.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', TYPE_COLORS[org.type])}>
                      {org.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{org.industry ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{org.sap_bp_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span className="text-xs">{org.contact_count}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{org.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewOrgModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
};

export default OrganizationsList;
