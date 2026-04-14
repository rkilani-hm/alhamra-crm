// EventWorkflow — Photo shoot / Event case workflow panel.
// Appears inside CasePanel when inquiry_type === 'event'.
// Parses the structured intake notes and shows a checklist.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Camera, CheckSquare, Square, CalendarDays, Clock, Users, MapPin, Wrench, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Parse the structured notes from the edge function
const parseEventNotes = (notes: string) => {
  const lines = notes.split('\n');
  const get = (key: string) => {
    const line = lines.find(l => l.toLowerCase().startsWith(key.toLowerCase() + ':'));
    return line ? line.slice(line.indexOf(':') + 1).trim() : null;
  };
  return {
    eventType:       get('Event type'),
    requestedDate:   get('Requested date'),
    startTime:       get('Start time'),
    duration:        get('Duration'),
    crewSize:        get('Crew / Team size'),
    location:        get('Location in tower'),
    equipment:       get('Equipment'),
    purpose:         get('Brief / Purpose') || get('Purpose / Brief'),
    permitProvided:  notes.includes('Permit / NOC: Yes') || notes.includes('Permit needed: Yes'),
    hasInsurance:    notes.includes('Insurance: Yes'),
    company:         get('Company'),
    contact:         get('Name'),
    phone:           get('Phone'),
  };
};

const CHECKLIST = [
  { key: 'review',    label: 'Initial request reviewed',      icon: CheckSquare,  group: 'approval' },
  { key: 'mgmt_ok',  label: 'Management approval obtained',   icon: Shield,       group: 'approval' },
  { key: 'noc',      label: 'NOC / Permit letter received',   icon: Shield,       group: 'approval' },
  { key: 'insurance',label: 'Insurance certificate verified', icon: Shield,       group: 'approval' },
  { key: 'security', label: 'Security team briefed',          icon: Users,        group: 'logistics' },
  { key: 'access',   label: 'Access passes issued',           icon: CheckSquare,  group: 'logistics' },
  { key: 'escort',   label: 'Escort assigned',                icon: Users,        group: 'logistics' },
  { key: 'done',     label: 'Shoot / event completed',        icon: Camera,       group: 'complete' },
];

interface Props {
  caseId: string;
  notes:  string;
}

const EventWorkflow = ({ caseId, notes }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ev = parseEventNotes(notes);
  const [collapsed, setCollapsed] = useState(false);

  // Store checklist in case_notes as structured JSON
  const { data: checkNote } = useQuery({
    queryKey: ['event-checklist', caseId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('case_notes').select('id, body')
        .eq('case_id', caseId).ilike('body', 'CHECKLIST:%').maybeSingle();
      return data;
    },
  });

  const checked: Set<string> = new Set(
    checkNote?.body ? JSON.parse(checkNote.body.replace('CHECKLIST:', '')) : []
  );

  const toggle = useMutation({
    mutationFn: async (key: string) => {
      const next = new Set(checked);
      next.has(key) ? next.delete(key) : next.add(key);
      const json = JSON.stringify([...next]);

      if (checkNote?.id) {
        await (supabase as any).from('case_notes').update({ body: 'CHECKLIST:' + json }).eq('id', checkNote.id);
      } else {
        await (supabase as any).from('case_notes').insert({
          case_id: caseId, created_by: user?.id, body: 'CHECKLIST:' + json,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-checklist', caseId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const totalChecked = [...checked].length;
  const pct = CHECKLIST.length > 0 ? Math.round((totalChecked / CHECKLIST.length) * 100) : 0;

  const groups = [
    { key: 'approval',  label: 'Approvals', items: CHECKLIST.filter(c => c.group === 'approval') },
    { key: 'logistics', label: 'Logistics', items: CHECKLIST.filter(c => c.group === 'logistics') },
    { key: 'complete',  label: 'Completion', items: CHECKLIST.filter(c => c.group === 'complete') },
  ];

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 overflow-hidden">
      {/* Header */}
      <button onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-rose-50 transition-colors">
        <Camera className="h-4 w-4 text-rose-600 shrink-0" />
        <span className="text-xs font-bold text-rose-700 uppercase tracking-wide flex-1">
          {ev.eventType || 'Event / Photo Shoot'} — Workflow
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-rose-600 font-medium">{totalChecked}/{CHECKLIST.length}</span>
          <div className="w-16 h-1.5 rounded-full bg-rose-200 overflow-hidden">
            <div className="h-full rounded-full bg-rose-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* Shoot details grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {ev.requestedDate && (
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3 text-rose-500 shrink-0" />
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">{ev.requestedDate}</span>
              </div>
            )}
            {ev.startTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-rose-500 shrink-0" />
                <span className="text-muted-foreground">Time:</span>
                <span className="font-medium">{ev.startTime} {ev.duration && `· ${ev.duration}`}</span>
              </div>
            )}
            {ev.crewSize && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-rose-500 shrink-0" />
                <span className="text-muted-foreground">Crew:</span>
                <span className="font-medium">{ev.crewSize} people</span>
              </div>
            )}
            {ev.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-rose-500 shrink-0" />
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium">{ev.location}</span>
              </div>
            )}
            {ev.equipment && (
              <div className="flex items-center gap-1.5 col-span-2">
                <Wrench className="h-3 w-3 text-rose-500 shrink-0" />
                <span className="text-muted-foreground">Equipment:</span>
                <span className="font-medium">{ev.equipment}</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          {(!ev.permitProvided || !ev.hasInsurance) && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-amber-800 space-y-0.5">
                {!ev.permitProvided && <p>⚠ Permit / NOC not yet confirmed by requester</p>}
                {!ev.hasInsurance  && <p>⚠ Insurance certificate not yet confirmed</p>}
              </div>
            </div>
          )}

          {/* Checklist by group */}
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{g.label}</p>
              <div className="space-y-1">
                {g.items.map(item => {
                  const done = checked.has(item.key);
                  return (
                    <button key={item.key} onClick={() => toggle.mutate(item.key)}
                      disabled={toggle.isPending}
                      className={cn(
                        'flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left transition-colors',
                        done ? 'bg-green-50 border border-green-200' : 'bg-card border border-border hover:bg-muted/40'
                      )}>
                      {done
                        ? <CheckSquare className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className={cn('text-xs', done ? 'line-through text-muted-foreground' : 'text-foreground')}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventWorkflow;
