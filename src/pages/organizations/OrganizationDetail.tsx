import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Organization, Contact, Activity, Case, OrganizationExtended } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { ActivityIcon, ACTIVITY_CONFIG } from '@/components/crm/ActivityIcon';
import LogActivityModal from '@/components/crm/LogActivityModal';
import WaContactThread from '@/components/crm/WaContactThread';
import ImageUploader from '@/components/crm/ImageUploader';
import WaThreadPreview from '@/components/crm/WaThreadPreview';
import {
  Building2, Phone, Mail, Globe, MapPin, Edit2, Save, X,
  Plus, ChevronLeft, Users, Briefcase, Clock, FileText, Search, UserPlus, Link2,
  LayoutList, CheckCircle2, Circle, FileKey, CalendarRange, Hash, Activity as ActivityIcon2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = ['timeline','contacts','cases','activities','notes','whatsapp'] as const;
type Tab = typeof TABS[number];

// ── Timeline item ─────────────────────────────────────────────
const TimelineItem = ({ activity }: { activity: Activity }) => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [, setDone] = useState(activity.done);

  const markDone = async () => {
    await (supabase as any).from('activities').update({ done: true, done_at: new Date().toISOString() })
      .eq('id', activity.id);
    qc.invalidateQueries({ queryKey: ['org-activities'] });
  };

  // WhatsApp activities store the conversation reference as "wa:<conv_id>"
  const isWhatsApp = activity.type === 'whatsapp';
  const waConvId   = isWhatsApp && activity.outcome?.startsWith('wa:')
    ? activity.outcome.slice(3) : null;

  // For non-whatsapp activities, show outcome as normal text
  const displayOutcome = !isWhatsApp && activity.outcome ? activity.outcome : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <ActivityIcon type={activity.type} size="sm" />
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{activity.subject}</p>
              {waConvId && (
                <button
                  onClick={() => nav('/whatsapp')}
                  className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors font-medium"
                >
                  View conversation →
                </button>
              )}
            </div>
            {activity.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.body}</p>}
            {displayOutcome && (
              <div className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                Outcome: {displayOutcome}
              </div>
            )}
            {/* Inline WhatsApp thread */}
            {waConvId && (
              <WaThreadPreview
                conversationId={waConvId}
                contactName={activity.contacts?.name}
              />
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {activity.contacts && (
                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                  {activity.contacts.name}
                </span>
              )}
              {activity.departments && (
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {activity.departments.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
            </p>
            <p className="text-[10px] text-muted-foreground">{activity.profiles?.full_name}</p>
            {!activity.done && (
              <button onClick={markDone} className="mt-1 text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-1">
                <Circle className="h-3 w-3" /> Mark done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────
const OrganizationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const nav    = useNavigate();
  const qc     = useQueryClient();
  const [tab, setTab]         = useState<Tab>('timeline');
  const [editing, setEditing]   = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberQuery,   setMemberQuery]   = useState('');
  const [newMemberForm, setNewMemberForm] = useState({ name:'', phone:'', email:'', job_title:'' });
  const [memberMode,    setMemberMode]    = useState<'search'|'create'>('search');
  const [logOpen, setLogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Organization>>({});

  // Load org
  const { data: org, isLoading } = useQuery<Organization>({
    queryKey: ['org', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('organizations').select('*').eq('id', id).single();
      return data;
    },
    
  });

  useEffect(() => { if (org) setEditForm(org); }, [org]);

  // Load contacts for this org
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['org-contacts', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('contacts').select('*').eq('organization_id', id).order('name');
      return data ?? [];
    },
  });

  // Search for existing contacts to link (not already in this org)
  const { data: searchResults = [] } = useQuery<Contact[]>({
    queryKey: ['contact-search-link', memberQuery],
    enabled:  memberQuery.trim().length >= 2,
    queryFn: async () => {
      const like = `%${memberQuery}%`;
      const { data } = await (supabase as any)
        .from('contacts')
        .select('id,name,phone,email,job_title,organization_id')
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        // Include unassigned contacts (null org) AND contacts from other orgs
        // .neq() in SQL excludes NULLs, so we must use .or() explicitly
        .or(`organization_id.is.null,organization_id.neq.${id}`)
        .limit(8);
      return data ?? [];
    },
  });

  const linkContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await (supabase as any)
        .from('contacts').update({ organization_id: id }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-contacts', id] });
      toast.success('Contact linked to organization');
      setMemberQuery('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createAndLinkContact = useMutation({
    mutationFn: async () => {
      if (!newMemberForm.name.trim()) throw new Error('Name is required');
      const { data, error } = await (supabase as any).from('contacts').insert({
        name:            newMemberForm.name.trim(),
        phone:           newMemberForm.phone  || null,
        email:           newMemberForm.email  || null,
        job_title:       newMemberForm.job_title || null,
        organization_id: id,
        source:          'call',
        client_type:     'potential',
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-contacts', id] });
      toast.success('Contact created and linked');
      setNewMemberForm({ name:'', phone:'', email:'', job_title:'' });
      setAddMemberOpen(false);
      setMemberMode('search');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Load cases for all contacts in this org
  const { data: cases = [] } = useQuery<Case[]>({
    queryKey: ['org-cases', id],
    queryFn: async () => {
      if (!contacts.length) return [];
      const contactIds = contacts.map((c: Contact) => c.id);
      const { data } = await (supabase as any)
        .from('cases')
        .select('*, departments(name), contacts(name), profiles(full_name)')
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: contacts.length > 0,
  });

  // Load activities for this org
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ['org-activities', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('activities')
        .select('*, contacts(id,name), cases(id,subject), profiles:created_by(id,full_name), departments(id,name)')
        .eq('organization_id', id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  // Timeline = activities + cases as activity items, sorted by date
  const timeline = [
    ...activities,
    ...cases.map((c: any) => ({
      id: c.id, type: 'case' as const, subject: c.subject,
      body: `${c.inquiry_type ?? ''} · ${c.channel}`,
      created_at: c.created_at, done: c.status === 'done',
      contacts: c.contacts, departments: c.departments,
      profiles: c.profiles, organization_id: id,
      outcome: null,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Save edits
  const saveEdit = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('organizations')
        .update({ ...editForm, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org', id] }); qc.invalidateQueries({ queryKey: ['organizations'] }); setEditing(false); toast.success('Saved'); },
    onError: (e: any) => toast.error(e.message),
  });

  const ef = (k: keyof Organization) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEditForm(p => ({ ...p, [k]: e.target.value }));

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  if (!org) return <div className="py-12 text-center text-muted-foreground">Organization not found</div>;

  const STATUS_COLOR: Record<string, string> = {
    new: 'bg-blue-50 text-blue-700', inprogress: 'bg-amber-50 text-amber-700', done: 'bg-green-50 text-green-700',
  };

  return (
    <div className="space-y-0">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/organizations')} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <ImageUploader
            bucket="org-logos"
            entityId={org.id}
            currentUrl={(org as any).logo_url}
            initials={org.name.slice(0,2)}
            size="md"
            shape="square"
            editable={editing}
            onUpload={async (url) => {
              await (supabase as any).from('organizations').update({ logo_url: url }).eq('id', org.id);
              qc.invalidateQueries({ queryKey: ['org', id] });
            }}
            onRemove={async () => {
              await (supabase as any).from('organizations').update({ logo_url: null }).eq('id', org.id);
              qc.invalidateQueries({ queryKey: ['org', id] });
            }}
          />
          <div>
            {editing ? (
              <Input value={editForm.name ?? ''} onChange={ef('name')} className="h-8 text-xl font-semibold w-72" />
            ) : (
              <h1 className="text-2xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{org.name}</h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', {
                tenant:'bg-blue-50 text-blue-700 border-blue-200', vendor:'bg-purple-50 text-purple-700 border-purple-200',
                partner:'bg-green-50 text-green-700 border-green-200', prospect:'bg-amber-50 text-amber-700 border-amber-200',
                other:'bg-slate-50 text-slate-700 border-slate-200',
              }[org.type])}>{org.type}</span>
              {org.industry && <span className="text-xs text-muted-foreground">{org.industry}</span>}
              {org.sap_bp_number && <span className="text-xs font-mono text-muted-foreground">{org.sap_bp_number}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log activity
          </Button>
          {editing ? (
            <>
              <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Left: info panel ──────────────────────────────── */}
        <div className="w-72 shrink-0 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact info</p>
            {editing ? (
              <div className="space-y-2">
                {([['phone','Phone'], ['email','Email'], ['website','Website'], ['address','Address'], ['city','City']] as const).map(([k, lbl]) => (
                  <div key={k}>
                    <Label className="text-[10px]">{lbl}</Label>
                    <Input value={(editForm as any)[k] ?? ''} onChange={ef(k as keyof Organization)} className="h-7 text-xs mt-0.5" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {org.phone && <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span>{org.phone}</span></div>}
                {org.email && <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={`mailto:${org.email}`} className="text-primary hover:underline">{org.email}</a></div>}
                {org.website && <div className="flex items-center gap-2 text-xs"><Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={org.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">{org.website}</a></div>}
                {org.address && <div className="flex items-center gap-2 text-xs"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span>{org.address}{org.city ? `, ${org.city}` : ''}</span></div>}
                {!org.phone && !org.email && !org.website && !org.address && (
                  <p className="text-xs text-muted-foreground">No contact info yet</p>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Summary</p>
            <div className="space-y-2">
              {[
                { icon: Users, label: 'Contacts', val: contacts.length, color: 'text-blue-600' },
                { icon: Briefcase, label: 'Cases', val: cases.length, color: 'text-amber-600' },
                { icon: LayoutList, label: 'Activities', val: activities.length, color: 'text-green-600' },
                { icon: CheckCircle2, label: 'Done cases', val: cases.filter((c: any) => c.status === 'done').length, color: 'text-green-600' },
              ].map(({ icon: Icon, label, val, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className={cn('h-3.5 w-3.5', color)} /><span className="text-xs">{label}</span>
                  </div>
                  <span className="font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes / description */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">About</p>
            {editing ? (
              <>
                <div className="mb-2">
                  <Label className="text-[10px]">Arabic Name</Label>
                  <Input
                    value={(editForm as any).name_arabic ?? ''}
                    onChange={e => setEditForm((p: any) => ({ ...p, name_arabic: e.target.value }))}
                    className="h-7 text-xs mt-0.5 text-right" dir="rtl"
                    placeholder="الاسم بالعربي"
                  />
                </div>
                <Textarea value={editForm.description ?? ''} onChange={ef('description')}
                  rows={3} className="text-xs resize-none" placeholder="Notes about this organization…" />
              </>
            ) : (
              <>
                {(org as any).name_arabic && (
                  <p className="text-sm text-foreground text-right mb-2 font-medium" dir="rtl">
                    {(org as any).name_arabic}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{org.description ?? 'No description yet'}</p>
              </>
            )}
          </div>

          {/* SAP Leasing Data */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileKey className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SAP Leasing Data</p>
            </div>
            {editing ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px]">Contract Number</Label>
                  <Input value={(editForm as any).lease_contract_number ?? ''}
                    onChange={e => setEditForm((p: any) => ({ ...p, lease_contract_number: e.target.value }))}
                    className="h-7 text-xs mt-0.5 font-mono" placeholder="e.g. LC-2024-00145" />
                </div>
                <div>
                  <Label className="text-[10px]">Rental Object Code</Label>
                  <Input value={(editForm as any).lease_rental_object ?? ''}
                    onChange={e => setEditForm((p: any) => ({ ...p, lease_rental_object: e.target.value }))}
                    className="h-7 text-xs mt-0.5 font-mono" placeholder="e.g. RO-T12-F05" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Start Date</Label>
                    <Input type="date" value={(editForm as any).lease_start_date ?? ''}
                      onChange={e => setEditForm((p: any) => ({ ...p, lease_start_date: e.target.value }))}
                      className="h-7 text-xs mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px]">End Date</Label>
                    <Input type="date" value={(editForm as any).lease_end_date ?? ''}
                      onChange={e => setEditForm((p: any) => ({ ...p, lease_end_date: e.target.value }))}
                      className="h-7 text-xs mt-0.5" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Lease Status</Label>
                  <select
                    value={(editForm as any).lease_status ?? ''}
                    onChange={e => setEditForm((p: any) => ({ ...p, lease_status: e.target.value || null }))}
                    className="w-full h-7 text-xs mt-0.5 rounded-md border border-input bg-background px-2"
                  >
                    <option value="">— not set —</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {/* Status badge */}
                {(org as any).lease_status && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', {
                      active:     'bg-green-100 text-green-700',
                      pending:    'bg-amber-100 text-amber-700',
                      expired:    'bg-red-100 text-red-700',
                      terminated: 'bg-slate-100 text-slate-600',
                    }[(org as any).lease_status as string] ?? 'bg-muted text-muted-foreground')}>
                      {(org as any).lease_status}
                    </span>
                  </div>
                )}
                {(org as any).lease_contract_number ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono font-medium">{(org as any).lease_contract_number}</span>
                    </div>
                    {(org as any).lease_rental_object && (
                      <div className="flex items-center gap-2">
                        <ActivityIcon2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono">{(org as any).lease_rental_object}</span>
                      </div>
                    )}
                    {((org as any).lease_start_date || (org as any).lease_end_date) && (
                      <div className="flex items-center gap-2">
                        <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>
                          {(org as any).lease_start_date
                            ? format(new Date((org as any).lease_start_date), 'd MMM yyyy')
                            : '—'}
                          {' → '}
                          {(org as any).lease_end_date
                            ? format(new Date((org as any).lease_end_date), 'd MMM yyyy')
                            : '—'}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground italic">
                    No lease data yet · click Edit to add
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: tabs ───────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex border-b mb-4 gap-0">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}>
                {t}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {t === 'contacts' ? contacts.length : t === 'cases' ? cases.length : t === 'activities' ? activities.length : t === 'timeline' ? timeline.length : ''}
                </span>
              </button>
            ))}
          </div>

          {/* ── TIMELINE ──────────────────────────────────── */}
          {tab === 'timeline' && (
            <div className="space-y-0">
              {timeline.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Log first activity
                  </Button>
                </div>
              ) : timeline.map(a => <TimelineItem key={a.id} activity={a as Activity} />)}
            </div>
          )}

          {/* ── CONTACTS ──────────────────────────────────── */}
          {tab === 'contacts' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-muted-foreground">{contacts.length} people linked to this organization</p>
                <Button size="sm" variant="outline" onClick={() => { setAddMemberOpen(true); setMemberMode('search'); setMemberQuery(''); }}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add member
                </Button>
              </div>

              {/* ── Inline add-member panel ───────────────── */}
              {addMemberOpen && (
                <div className="rounded-xl border bg-card shadow-sm mb-4 overflow-hidden">
                  {/* Header tabs */}
                  <div className="flex border-b">
                    <button onClick={() => setMemberMode('search')}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                        memberMode === 'search' ? 'bg-primary/8 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/30')}>
                      <Search className="h-3.5 w-3.5" /> Link existing contact
                    </button>
                    <button onClick={() => setMemberMode('create')}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                        memberMode === 'create' ? 'bg-primary/8 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/30')}>
                      <UserPlus className="h-3.5 w-3.5" /> Create new contact
                    </button>
                    <button onClick={() => { setAddMemberOpen(false); setMemberQuery(''); }}
                      className="px-3 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Search mode */}
                  {memberMode === 'search' && (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 focus-within:border-primary transition-colors">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)}
                          placeholder="Search by name, phone or email…"
                          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
                          autoFocus />
                        {memberQuery && <button onClick={() => setMemberQuery('')}><X className="h-3 w-3 text-muted-foreground" /></button>}
                      </div>
                      {memberQuery.trim().length >= 2 && (
                        <div className="space-y-1">
                          {searchResults.length === 0 && (
                            <p className="text-xs text-center text-muted-foreground py-3">
                              No contacts found — try a different name or <button className="text-primary underline" onClick={() => setMemberMode('create')}>create new</button>
                            </p>
                          )}
                          {searchResults.map(r => (
                            <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/20 transition-colors">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                                {r.name.slice(0,2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[r.phone, r.email, (r as any).job_title].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <Button size="sm" variant="outline" className="shrink-0 gap-1 h-7 px-2 text-xs"
                                disabled={linkContact.isPending}
                                onClick={() => linkContact.mutate(r.id)}>
                                <Plus className="h-3 w-3" /> Add
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {memberQuery.trim().length < 2 && (
                        <p className="text-xs text-center text-muted-foreground py-2">Type at least 2 characters to search</p>
                      )}
                    </div>
                  )}

                  {/* Create mode */}
                  {memberMode === 'create' && (
                    <div className="p-3 space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Full name *</label>
                        <Input value={newMemberForm.name} onChange={e => setNewMemberForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Mohammed Al-Rashid" className="h-8 text-xs" autoFocus />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Phone</label>
                          <Input value={newMemberForm.phone} onChange={e => setNewMemberForm(p => ({ ...p, phone: e.target.value }))}
                            placeholder="+965 9XXX XXXX" className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Email</label>
                          <Input value={newMemberForm.email} onChange={e => setNewMemberForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="m@company.com" className="h-8 text-xs" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Job title</label>
                        <Input value={newMemberForm.job_title} onChange={e => setNewMemberForm(p => ({ ...p, job_title: e.target.value }))}
                          placeholder="FM Manager, CEO…" className="h-8 text-xs" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMemberMode('search')}>Back to search</Button>
                        <Button size="sm" className="h-7 text-xs" disabled={!newMemberForm.name.trim() || createAndLinkContact.isPending}
                          onClick={() => createAndLinkContact.mutate()}>
                          {createAndLinkContact.isPending ? 'Creating…' : 'Create & link'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {contacts.map(c => (
                <div key={c.id} onClick={() => nav(`/contacts/${c.id}`)}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                    {c.name.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{c.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {(c as any).job_title && <span>{(c as any).job_title}</span>}
                      {c.phone && <span>{c.phone}</span>}
                      {c.email && <span>{c.email}</span>}
                    </div>
                  </div>
                  {c.client_type && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">
                      {c.client_type.replace('_',' ')}
                    </span>
                  )}
                </div>
              ))}
              {contacts.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No contacts linked yet</div>
              )}
            </div>
          )}

          {/* ── CASES ─────────────────────────────────────── */}
          {tab === 'cases' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">{cases.length} cases across all contacts</p>
              {cases.map((c: any) => (
                <div key={c.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.subject}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{c.contacts?.name}</span>
                        <span>·</span>
                        <span>{c.departments?.name}</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                        c.priority === 'urgent' ? 'bg-red-50 text-red-700' : c.priority === 'low' ? 'bg-slate-50 text-slate-700' : 'bg-blue-50 text-blue-700'
                      )}>{c.priority}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', STATUS_COLOR[c.status])}>
                        {c.status === 'inprogress' ? 'Active' : c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {cases.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No cases yet</div>}
            </div>
          )}

          {/* ── ACTIVITIES ────────────────────────────────── */}
          {tab === 'activities' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-muted-foreground">{activities.length} logged activities</p>
                <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Log activity
                </Button>
              </div>
              {activities.map(a => {
                const isWa = a.type === 'whatsapp';
                const waConvId = isWa && a.outcome?.startsWith('wa:') ? a.outcome.slice(3) : null;
                const displayOutcome = !isWa && a.outcome ? a.outcome : null;
                return (
                  <div key={a.id} className="flex gap-3 rounded-lg border bg-card p-3">
                    <ActivityIcon type={a.type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{a.subject}</p>
                            {waConvId && (
                              <button onClick={() => nav('/whatsapp')}
                                className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors font-medium shrink-0">
                                View conversation →
                              </button>
                            )}
                          </div>
                          {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                          {displayOutcome && <p className="text-xs text-green-700 mt-1">→ {displayOutcome}</p>}
                          {waConvId && (
                            <WaThreadPreview
                              conversationId={waConvId}
                              contactName={(a.contacts as any)?.name}
                            />
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground ml-4 shrink-0">
                          <p>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                          <p>{isWa ? 'WhatsApp' : a.profiles?.full_name}</p>
                          {a.done && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Done</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No activities yet</div>}
            </div>
          )}

          {/* ── NOTES tab ─────────────────────────────────── */}
          {tab === 'notes' && (
            <div className="space-y-2">
              {activities.filter(a => a.type === 'note').map(a => (
                <div key={a.id} className="rounded-lg border bg-card p-4">
                  <p className="text-sm">{a.body ?? a.subject}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {a.profiles?.full_name} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
              {activities.filter(a => a.type === 'note').length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notes yet</p>
                  <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add note
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'whatsapp' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {contacts.length} contacts — WhatsApp history shown below
              </p>
              {contacts.length === 0 && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No contacts linked to this organization yet
                </div>
              )}
              {contacts.map(c => (
                <div key={c.id} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {c.name}
                  </p>
                  <WaContactThread
                    contactId={c.id}
                    phone={c.phone}
                    contactName={c.name}
                    height={420}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} organizationId={id} />
    </div>
  );
};

const STATUS_COLOR: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', inprogress: 'bg-amber-50 text-amber-700', done: 'bg-green-50 text-green-700',
};

export default OrganizationDetail;
