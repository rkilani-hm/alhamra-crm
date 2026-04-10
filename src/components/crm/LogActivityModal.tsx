import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityType, Organization, Contact } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_CONFIG } from './ActivityIcon';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TYPES: ActivityType[] = ['call','meeting','whatsapp','email','visit','task','note'];

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId?: string;
  contactId?: string;
  caseId?: string;
  defaultType?: ActivityType;
}

const LogActivityModal = ({ open, onClose, organizationId, contactId, caseId, defaultType = 'call' }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType]       = useState<ActivityType>(defaultType);
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [outcome, setOutcome] = useState('');
  const [orgId, setOrgId]     = useState(organizationId ?? '');
  const [contId, setContId]   = useState(contactId ?? '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState('');

  const { data: orgs = [] } = useQuery<Organization[]>({
    queryKey: ['orgs-select'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('organizations').select('id,name').order('name');
      return data ?? [];
    },
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['contacts-select', orgId],
    queryFn: async () => {
      let q = (supabase as any).from('contacts').select('id,name,organization_id').order('name');
      if (orgId) q = q.eq('organization_id', orgId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error('Subject is required');
      const { error } = await (supabase as any).from('activities').insert({
        type,
        subject:         subject.trim(),
        body:            body || null,
        outcome:         outcome || null,
        organization_id: orgId   || organizationId || null,
        contact_id:      contId  || contactId      || null,
        case_id:         caseId  || null,
        scheduled_at:    scheduledAt || null,
        duration_min:    durationMin ? parseInt(durationMin) : null,
        created_by:      user?.id,
        done:            true,
        done_at:         new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      toast.success('Activity logged');
      onClose();
      setSubject(''); setBody(''); setOutcome(''); setScheduledAt(''); setDurationMin('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>

        {/* Type selector */}
        <div className="flex flex-wrap gap-2">
          {TYPES.map(t => {
            const cfg = ACTIVITY_CONFIG[t];
            const Icon = cfg.icon;
            return (
              <button key={t}
                onClick={() => setType(t)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  type === t ? `${cfg.bg} ${cfg.color} border-current` : 'text-muted-foreground hover:bg-muted'
                )}>
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Subject *</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder={`e.g. Called about renewal, Meeting with FM team`}
              className="h-9 text-sm mt-1" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Organization */}
            {!organizationId && (
              <div>
                <Label className="text-xs">Organization</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select org…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Contact */}
            {!contactId && (
              <div>
                <Label className="text-xs">Contact person</Label>
                <Select value={contId} onValueChange={setContId}>
                  <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select contact…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {(type === 'call' || type === 'meeting' || type === 'visit') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date & time</Label>
                <Input type="datetime-local" value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)} className="h-9 mt-1 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" placeholder="30" value={durationMin}
                  onChange={e => setDurationMin(e.target.value)} className="h-9 mt-1 text-xs" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Notes / Details</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="What was discussed…" rows={3} className="text-sm mt-1 resize-none" />
          </div>

          {type === 'call' || type === 'meeting' ? (
            <div>
              <Label className="text-xs">Outcome</Label>
              <Input value={outcome} onChange={e => setOutcome(e.target.value)}
                placeholder="Follow-up required, Agreed on X, Sent proposal…"
                className="h-9 text-sm mt-1" />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !subject.trim()}>
            {save.isPending ? 'Saving…' : 'Log activity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogActivityModal;
