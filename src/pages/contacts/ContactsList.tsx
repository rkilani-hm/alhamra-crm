import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Organization } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Users, Plus, Search, Phone, Mail, Building2, ChevronRight, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-50 text-green-700',
  call:     'bg-blue-50 text-blue-700',
  visit:    'bg-orange-50 text-orange-700',
  web:      'bg-purple-50 text-purple-700',
};

interface ContactWithOrg extends Contact { organizations?: { id: string; name: string } | null; }

const NewContactModal = ({ open, onClose, defaultOrgId }: { open: boolean; onClose: () => void; defaultOrgId?: string }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', job_title: '',
    organization_id: defaultOrgId ?? '', source: 'call', client_type: 'potential',
  });

  const { data: orgs = [] } = useQuery<Organization[]>({
    queryKey: ['orgs-select'],
    queryFn: async () => { const { data } = await (supabase as any).from('organizations').select('id,name').order('name'); return data ?? []; },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required');
      const { data, error } = await (supabase as any).from('contacts').insert({
        name:            form.name.trim(),
        phone:           form.phone || null,
        email:           form.email || null,
        job_title:       form.job_title || null,
        organization_id: form.organization_id || null,
        source:          form.source,
        client_type:     form.client_type,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
      onClose();
      nav(`/contacts/${data.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const f = (k: keyof typeof form) => (e: any) => setForm(p => ({ ...p, [k]: e.target?.value ?? e }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Full name *</Label>
            <Input value={form.name} onChange={f('name')} placeholder="Mohammed Al-Rashid" className="h-9 mt-1" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={f('phone')} placeholder="+965 9XXX XXXX" className="h-9 mt-1 text-xs" /></div>
            <div><Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={f('email')} placeholder="m@company.com" className="h-9 mt-1 text-xs" /></div>
          </div>
          <div><Label className="text-xs">Job title</Label>
            <Input value={form.job_title} onChange={f('job_title')} placeholder="FM Manager, CEO…" className="h-9 mt-1 text-xs" /></div>
          <div><Label className="text-xs">Organization</Label>
            <Select value={form.organization_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, organization_id: v === '__none__' ? '' : v }))}>
              <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Source</Label>
              <Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['call','visit','web','whatsapp'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Type</Label>
              <Select value={form.client_type} onValueChange={v => setForm(p => ({ ...p, client_type: v }))}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['existing_tenant','potential','vendor','visitor'].map(t =>
                    <SelectItem key={t} value={t} className="capitalize">{t.replace('_',' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim()}>
            {create.isPending ? 'Creating…' : 'Create contact'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ContactsList = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(params.has('new'));

  const { data: contacts = [], isLoading } = useQuery<ContactWithOrg[]>({
    queryKey: ['contacts'],
    queryFn: async () => {
      const { data: contactData } = await (supabase as any)
        .from('contacts').select('*').order('name');
      if (!contactData?.length) return [];
      const orgIds = [...new Set(contactData.map((c: any) => c.organization_id).filter(Boolean))];
      let orgMap: Record<string, { id: string; name: string }> = {};
      if (orgIds.length) {
        const { data: orgData } = await (supabase as any)
          .from('organizations').select('id,name').in('id', orgIds);
        (orgData ?? []).forEach((o: any) => { orgMap[o.id] = o; });
      }
      return contactData.map((c: any) => ({
        ...c,
        organizations: c.organization_id ? (orgMap[c.organization_id] ?? null) : null,
      }));
    },
    refetchInterval: 30_000,
  });

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()) ||
      (c.organizations as any)?.name?.toLowerCase().includes(search.toLowerCase());
    const matchSource = sourceFilter === 'all' || c.source === sourceFilter;
    return matchSearch && matchSource;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">{contacts.length} people · link to organizations for full history</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New contact
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, org…" className="pl-9 h-9" />
        </div>
        <div className="flex gap-1">
          {['all','whatsapp','call','visit','web'].map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                sourceFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-muted'
              )}>{s === 'all' ? 'All sources' : s}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground">{search ? 'No contacts match your search' : 'No contacts yet'}</p>
            <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add first contact
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                {['Contact','Organization','Phone','Email','Type','Source',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(c => (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => nav(`/contacts/${c.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                        {c.name.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {(c as any).job_title && <p className="text-xs text-muted-foreground">{(c as any).job_title}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(c.organizations as any)?.name ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />{(c.organizations as any).name}
                      </span>
                    ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.client_type && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">{c.client_type.replace('_',' ')}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.source && <span className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize font-medium', SOURCE_COLORS[c.source] ?? 'bg-muted text-muted-foreground')}>{c.source}</span>}
                  </td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground/40" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewContactModal open={newOpen} onClose={() => setNewOpen(false)} defaultOrgId={params.get('org') ?? undefined} />
    </div>
  );
};

export default ContactsList;
