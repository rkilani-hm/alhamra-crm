import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Contact, Activity, Case, Organization } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ActivityIcon } from '@/components/crm/ActivityIcon';
import LogActivityModal from '@/components/crm/LogActivityModal';
import { Phone, Mail, Building2, ChevronLeft, Plus, Edit2, Save, X, Briefcase, LayoutList, MessageSquare, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'timeline' | 'cases' | 'activities';

const ContactDetail = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('timeline');
  const [editing, setEditing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Contact & { job_title?: string; organization_id?: string }>>({});

  const { data: contact } = useQuery<Contact & { organizations?: Organization | null; job_title?: string }>({
    queryKey: ['contact', id],
    queryFn: async () => {
      const { data } = await (supabase as any).from('contacts').select('*').eq('id', id).single();
      if (!data) return null;
      let org = null;
      if (data.organization_id) {
        const { data: orgData } = await (supabase as any).from('organizations').select('id,name,type').eq('id', data.organization_id).maybeSingle();
        org = orgData;
      }
      return { ...data, organizations: org };
    },
  });

  useEffect(() => { if (contact) setEditForm(contact); }, [contact]);

  const { data: orgs = [] } = useQuery<Organization[]>({
    queryKey: ['orgs-select'],
    queryFn: async () => { const { data } = await (supabase as any).from('organizations').select('id,name').order('name'); return data ?? []; },
  });

  const { data: cases = [] } = useQuery<Case[]>({
    queryKey: ['contact-cases', id],
    queryFn: async () => { const { data } = await (supabase as any).from('cases').select('*, departments(name)').eq('contact_id', id).order('created_at', { ascending: false }); return data ?? []; },
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ['contact-activities', id],
    queryFn: async () => { const { data } = await (supabase as any).from('activities').select('*, profiles:created_by(id,full_name), departments(id,name)').eq('contact_id', id).order('created_at', { ascending: false }); return data ?? []; },
    refetchInterval: 15_000,
  });

  const timeline = [...activities, ...cases.map((c: any) => ({
    id: c.id, type: 'case' as const, subject: c.subject, body: `${c.departments?.name} · ${c.priority}`,
    created_at: c.created_at, done: c.status === 'done', profiles: c.profiles, outcome: null,
  }))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const save = useMutation({
    mutationFn: async () => { const { error } = await (supabase as any).from('contacts').update(editForm).eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contact', id] }); qc.invalidateQueries({ queryKey: ['contacts'] }); setEditing(false); toast.success('Saved'); },
    onError: (e: any) => toast.error(e.message),
  });

  const ef = (k: string) => (e: any) => setEditForm((p: any) => ({ ...p, [k]: e.target?.value ?? e }));

  if (!contact) return <div className="flex items-center justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const STATUS_COLOR: Record<string, string> = { new:'bg-blue-50 text-blue-700', inprogress:'bg-amber-50 text-amber-700', done:'bg-green-50 text-green-700' };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/contacts')} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-lg">{contact.name.slice(0,2).toUpperCase()}</div>
          <div>
            {editing ? <Input value={(editForm as any).name ?? ''} onChange={ef('name')} className="h-8 text-xl font-semibold w-64" />
              : <h1 className="text-2xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{contact.name}</h1>}
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {(contact as any).job_title && <span>{(contact as any).job_title}</span>}
              {(contact as any).organizations && (
                <button onClick={() => nav(`/organizations/${(contact as any).organizations.id}`)}
                  className="flex items-center gap-1 text-primary hover:underline">
                  <Building2 className="h-3 w-3" />{(contact as any).organizations.name}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log activity
          </Button>
          {editing
            ? <><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-3.5 w-3.5 mr-1.5" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>
            : <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit2 className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Info panel */}
        <div className="w-64 shrink-0 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            {editing ? (
              <div className="space-y-2">
                {[['phone','Phone'],['email','Email'],['job_title','Job title']].map(([k,l]) => (
                  <div key={k}><Label className="text-[10px]">{l}</Label>
                    <Input value={(editForm as any)[k] ?? ''} onChange={ef(k)} className="h-7 text-xs mt-0.5" /></div>
                ))}
                <div><Label className="text-[10px]">Organization</Label>
                  <Select value={(editForm as any).organization_id || '__none__'} onValueChange={v => setEditForm((p: any) => ({ ...p, organization_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-7 mt-0.5 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">None</SelectItem>{orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {contact.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span>{contact.phone}</span></div>}
                {contact.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span>{contact.email}</span></div>}
                {contact.source && <div className="flex items-center gap-2 capitalize text-muted-foreground"><span>Source: {contact.source}</span></div>}
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Summary</p>
            <div className="space-y-2">
              {[{ icon: Briefcase, label: 'Cases', val: cases.length }, { icon: LayoutList, label: 'Activities', val: activities.length }].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-xs">{label}</span></div>
                  <span className="font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 min-w-0">
          <div className="flex border-b mb-4">
            {(['timeline','cases','activities'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t} <span className="ml-1 text-[10px] text-muted-foreground">
                  {t === 'cases' ? cases.length : t === 'activities' ? activities.length : timeline.length}
                </span>
              </button>
            ))}
          </div>

          {tab === 'timeline' && (
            <div className="space-y-0">
              {timeline.length === 0
                ? <div className="py-12 text-center text-sm text-muted-foreground">No activity yet</div>
                : timeline.map(a => (
                  <div key={a.id} className="flex gap-3 mb-4">
                    <div className="flex flex-col items-center">
                      <ActivityIcon type={a.type as any} size="sm" />
                      <div className="mt-1 w-px flex-1 bg-border" />
                    </div>
                    <div className="pb-4 flex-1">
                      <p className="font-medium text-sm">{a.subject}</p>
                      {a.body && <p className="text-xs text-muted-foreground">{a.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(a as any).profiles?.full_name} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {tab === 'cases' && (
            <div className="space-y-2">
              {cases.map((c: any) => (
                <div key={c.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between">
                    <div><p className="font-medium text-sm">{c.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.departments?.name} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', STATUS_COLOR[c.status])}>
                      {c.status === 'inprogress' ? 'Active' : c.status}
                    </span>
                  </div>
                </div>
              ))}
              {cases.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No cases yet</div>}
            </div>
          )}

          {tab === 'activities' && (
            <div className="space-y-2">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Log activity</Button>
              </div>
              {activities.map(a => (
                <div key={a.id} className="flex gap-3 rounded-lg border bg-card p-3">
                  <ActivityIcon type={a.type} size="sm" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{a.subject}</p>
                    {a.body && <p className="text-xs text-muted-foreground">{a.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">{a.profiles?.full_name} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No activities yet</div>}
            </div>
          )}
        </div>
      </div>
      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} contactId={id} />
    </div>
  );
};

export default ContactDetail;
