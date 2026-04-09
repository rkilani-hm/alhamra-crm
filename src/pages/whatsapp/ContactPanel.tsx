import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { WaConversation, Contact, Case, Department } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  User2, Phone, Mail, Link2, Plus, ExternalLink,
  Building2, ClipboardList, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  new:        'bg-blue-50 text-blue-700',
  inprogress: 'bg-amber-50 text-amber-700',
  done:       'bg-green-50 text-green-700',
};

interface Props { conversation: WaConversation; }

const ContactPanel = ({ conversation }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [caseForm, setCaseForm] = useState({ subject: '', department_id: '', priority: 'normal', notes: '' });
  const [linking, setLinking] = useState(false);

  // Fetch full contact details
  const { data: contact } = useQuery<Contact | null>({
    queryKey: ['contact', conversation.contact_id],
    enabled: !!conversation.contact_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts').select('*').eq('id', conversation.contact_id!).maybeSingle();
      return data as Contact | null;
    },
  });

  // Fetch cases linked to this contact
  const { data: cases = [] } = useQuery<Case[]>({
    queryKey: ['contact_cases', conversation.contact_id],
    enabled: !!conversation.contact_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cases')
        .select('*, departments(name)')
        .eq('contact_id', conversation.contact_id!)
        .order('created_at', { ascending: false })
        .limit(5);
      return (data ?? []) as Case[];
    },
  });

  // Departments for case form
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  // Create a new contact from this conversation
  const createContact = useMutation({
    mutationFn: async () => {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          name:   `+${conversation.chat_id}`,
          phone:  `+${conversation.chat_id}`,
          source: 'whatsapp',
        })
        .select().single();
      if (error) throw error;
      await supabase.from('wa_conversations').update({ contact_id: newContact.id }).eq('id', conversation.id);
      return newContact;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversations'] });
      qc.invalidateQueries({ queryKey: ['contact', conversation.contact_id] });
      toast.success('Contact created');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Create case from WhatsApp conversation
  const createCase = useMutation({
    mutationFn: async () => {
      if (!conversation.contact_id) throw new Error('Link a contact first');
      const { data: newCase, error } = await supabase
        .from('cases')
        .insert({
          contact_id:   conversation.contact_id,
          channel:      'whatsapp',
          inquiry_type: 'general',
          subject:      caseForm.subject,
          priority:     caseForm.priority,
          status:       'new',
          department_id: caseForm.department_id,
          created_by:   user?.id,
          notes:        caseForm.notes || null,
        })
        .select().single();
      if (error) throw error;
      // Link conversation to case
      await supabase.from('wa_conversations').update({ case_id: newCase.id }).eq('id', conversation.id);
      return newCase;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact_cases', conversation.contact_id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      setShowCaseForm(false);
      setCaseForm({ subject: '', department_id: '', priority: 'normal', notes: '' });
      toast.success('Case created and assigned');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex w-[280px] flex-shrink-0 flex-col border-l bg-card overflow-y-auto scrollbar-thin">

      {/* ── Contact section ──────────────────────────────────── */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
          {!conversation.contact_id && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
              onClick={() => createContact.mutate()} disabled={createContact.isPending}>
              {createContact.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              New
            </Button>
          )}
        </div>

        {conversation.contact_id && contact ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-sm text-primary">
                {contact.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{contact.name}</p>
                {contact.client_type && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {contact.client_type.replace('_', ' ')}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              {contact.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact.unit && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span>Unit {contact.unit}, Floor {contact.floor}</span>
                </div>
              )}
              {contact.contract_number && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3 shrink-0" />
                  <span>Contract {contact.contract_number}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <User2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {conversation.contact_id ? 'Loading…' : 'Unknown contact'}
            </p>
            {!conversation.contact_id && (
              <p className="text-[10px] text-muted-foreground mt-1">
                +{conversation.chat_id}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Create case section ─────────────────────────────── */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cases</p>
          {conversation.contact_id && (
            <Button
              size="sm"
              className="h-6 text-[10px] px-2 gap-1"
              onClick={() => setShowCaseForm(f => !f)}
            >
              {showCaseForm ? <ChevronUp className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {showCaseForm ? 'Cancel' : 'New case'}
            </Button>
          )}
        </div>

        {/* Case creation form */}
        {showCaseForm && (
          <div className="space-y-2.5 mb-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Subject *</Label>
              <Input
                autoFocus
                placeholder="e.g. Lease renewal inquiry"
                className="h-7 text-xs"
                value={caseForm.subject}
                onChange={e => setCaseForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Department *</Label>
              <Select value={caseForm.department_id} onValueChange={v => setCaseForm(f => ({ ...f, department_id: v }))}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Priority</Label>
              <div className="flex gap-1">
                {['low','normal','urgent'].map(p => (
                  <button key={p}
                    onClick={() => setCaseForm(f => ({ ...f, priority: p }))}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1 text-[10px] font-medium capitalize transition-colors',
                      caseForm.priority === p
                        ? p === 'urgent' ? 'border-destructive bg-destructive text-destructive-foreground'
                          : 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Notes</Label>
              <Input
                placeholder="Optional notes"
                className="h-7 text-xs"
                value={caseForm.notes}
                onChange={e => setCaseForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <Button
              size="sm" className="w-full h-7 text-xs"
              disabled={!caseForm.subject || !caseForm.department_id || createCase.isPending}
              onClick={() => createCase.mutate()}
            >
              {createCase.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              Create & assign
            </Button>
          </div>
        )}

        {/* Cases list */}
        <div className="space-y-2">
          {cases.length === 0 && !showCaseForm && (
            <p className="text-center text-xs text-muted-foreground py-2">No cases yet</p>
          )}
          {cases.map(c => (
            <div key={c.id} className="rounded-lg border bg-background p-2.5 text-xs">
              <div className="flex items-start justify-between gap-1 mb-1">
                <p className="font-medium leading-tight truncate">{c.subject}</p>
                <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLOR[c.status])}>
                  {c.status === 'inprogress' ? 'Active' : c.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{(c as any).departments?.name}</span>
                <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Linked conversation info ─────────────────────────── */}
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Channel</p>
        <div className="rounded-lg border bg-background p-2.5 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" />
            <span>+{conversation.chat_id}</span>
          </div>
          {conversation.wa_channels && (
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3 w-3" />
              <span>{conversation.wa_channels.label ?? conversation.wa_channels.phone}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactPanel;
