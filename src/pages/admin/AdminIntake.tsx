import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Globe, Code2, Copy, Check, FileText, Camera, Users, Building2,
  Truck, Eye, RefreshCw, Settings, ExternalLink, CheckCircle2, Circle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const FORM_URL = `${window.location.origin}/intake.html`;
const IFRAME_CODE = `<iframe
  src="${FORM_URL}"
  width="100%"
  height="760"
  style="border:none; border-radius:12px; max-width:600px; display:block; margin:0 auto;"
  title="Al Hamra Enquiry Form"
  allow="forms"
></iframe>`;

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  leasing:  { icon: Building2,  color: 'text-blue-600',  label: 'Tenant'         },
  prospect: { icon: Eye,        color: 'text-purple-600', label: 'Prospect'      },
  vendor:   { icon: Truck,      color: 'text-amber-600', label: 'Vendor'         },
  visitor:  { icon: Users,      color: 'text-green-600', label: 'Visitor'        },
  event:    { icon: Camera,     color: 'text-rose-600',  label: 'Event/Shoot'   },
  general:  { icon: FileText,   color: 'text-slate-600', label: 'General'       },
};

// ── Embed code panel ─────────────────────────────────────────
const EmbedPanel = () => {
  const [copied, setCopied] = useState(false);
  const [tab,    setTab]    = useState<'iframe' | 'link'>('iframe');

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Embed on your website</h3>
      </div>

      {/* Tab */}
      <div className="flex rounded-lg border overflow-hidden bg-muted/30 w-fit">
        {(['iframe', 'link'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-1.5 text-xs font-medium transition-colors',
              tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'iframe' ? 'Embed (iFrame)' : 'Direct link'}
          </button>
        ))}
      </div>

      {tab === 'iframe' ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Paste this code in your website HTML where you want the form to appear:</p>
          <div className="relative">
            <pre className="bg-muted/40 rounded-lg p-4 text-xs font-mono overflow-x-auto border whitespace-pre-wrap break-all">
              {IFRAME_CODE}
            </pre>
            <button onClick={() => copy(IFRAME_CODE)}
              className="absolute top-2 right-2 flex items-center gap-1 text-[10px] bg-card border rounded-md px-2 py-1 hover:bg-muted transition-colors">
              {copied ? <><Check className="h-3 w-3 text-green-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>• Height auto-adjusts to content</span>
            <span>• Works on any website platform</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Share this link directly with clients:</p>
          <div className="flex items-center gap-2">
            <Input value={FORM_URL} readOnly className="font-mono text-xs h-9 flex-1" />
            <button onClick={() => copy(FORM_URL)}
              className="flex items-center gap-1 text-xs bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 transition-colors shrink-0">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={FORM_URL} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Routing config ────────────────────────────────────────────
const RoutingConfig = () => {
  const qc = useQueryClient();

  const { data: routing = [] } = useQuery({
    queryKey: ['intake-routing'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('intake_routing').select('*').order('inquiry_type');
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { const { data } = await supabase.from('departments').select('id,name').order('name'); return data ?? []; },
  });

  const update = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { error } = await (supabase as any).from('intake_routing').update({ [field]: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['intake-routing'] }); toast.success('Routing updated'); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Department routing</h3>
        <span className="ml-auto text-xs text-muted-foreground">Which department receives each enquiry type</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/20 border-b text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Enquiry type</th>
            <th className="px-4 py-2.5 text-left font-medium">Routes to department</th>
            <th className="px-4 py-2.5 text-left font-medium">Default priority</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {routing.map((r: any) => {
            const meta = TYPE_META[r.inquiry_type] ?? TYPE_META.general;
            const Icon = meta.icon;
            return (
              <tr key={r.id} className="hover:bg-muted/10">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', meta.color)} />
                    <span className="font-medium capitalize">{r.inquiry_type}</span>
                    <span className="text-xs text-muted-foreground">({meta.label})</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select value={r.department_name}
                    onChange={e => update.mutate({ id: r.id, field: 'department_name', value: e.target.value })}
                    className="h-8 rounded-lg border bg-background px-2 text-xs w-full max-w-[200px]">
                    {departments.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    <option value={r.department_name}>{r.department_name}</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select value={r.default_priority}
                    onChange={e => update.mutate({ id: r.id, field: 'default_priority', value: e.target.value })}
                    className="h-8 rounded-lg border bg-background px-2 text-xs w-48">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Submissions log ───────────────────────────────────────────
const SubmissionsLog = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: submissions = [], refetch, isFetching } = useQuery({
    queryKey: ['web-submissions'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('web_submissions')
        .select('*, cases(id,status,subject)')
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const total   = submissions.length;
  const pending = submissions.filter((s: any) => !s.case_id).length;

  const typeCounts: Record<string, number> = {};
  submissions.forEach((s: any) => { typeCounts[s.inquiry_type] = (typeCounts[s.inquiry_type] ?? 0) + 1; });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Recent submissions</h3>
        <div className="flex items-center gap-3 ml-auto">
          {pending > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
              {pending} unlinked
            </span>
          )}
          <span className="text-xs text-muted-foreground">{total} total</span>
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* Type summary badges */}
      {Object.entries(typeCounts).length > 0 && (
        <div className="flex gap-2 flex-wrap px-5 py-3 border-b bg-muted/10">
          {Object.entries(typeCounts).map(([type, count]) => {
            const meta = TYPE_META[type] ?? TYPE_META.general;
            const Icon = meta.icon;
            return (
              <div key={type} className="flex items-center gap-1.5 text-xs bg-card border rounded-lg px-2.5 py-1">
                <Icon className={cn('h-3 w-3', meta.color)} />
                <span className="font-medium">{count}</span>
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="divide-y max-h-[480px] overflow-y-auto scrollbar-thin">
        {submissions.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Globe className="h-6 w-6 mx-auto mb-2 opacity-30" />
            No submissions yet
          </div>
        )}
        {submissions.map((s: any) => {
          const meta = TYPE_META[s.inquiry_type] ?? TYPE_META.general;
          const Icon = meta.icon;
          const fd   = s.form_data ?? {};
          const isOpen = expanded === s.id;
          return (
            <div key={s.id}>
              <button onClick={() => setExpanded(isOpen ? null : s.id)}
                className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-muted/20 transition-colors">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted')}>
                  <Icon className={cn('h-4 w-4', meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{fd.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta.label} · {fd.company_name || fd.phone || ''}
                  </p>
                </div>
                <div className="text-right shrink-0 mr-2">
                  {s.cases ? (
                    <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Case created
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      <Circle className="h-2.5 w-2.5" /> No case
                    </span>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </p>
                </div>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                         : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-5 pb-4 bg-muted/10 border-t">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
                    {Object.entries(fd).filter(([k, v]) => v && k !== 'notes').map(([k, v]) => (
                      <div key={k}>
                        <p className="text-muted-foreground capitalize">{k.replace(/_/g,' ')}</p>
                        <p className="font-medium">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                  {fd.notes && (
                    <div className="mt-3 rounded-lg bg-card border p-3 text-xs">
                      <p className="text-muted-foreground mb-1 font-medium">Notes</p>
                      <p>{fd.notes}</p>
                    </div>
                  )}
                  {s.cases && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Case: {s.cases.subject} — status: {s.cases.status}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────
const AdminIntake = () => (
  <div className="space-y-6 max-w-5xl mx-auto">
    <div>
      <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Web Intake</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Public enquiry form · embed on alhamra.com.kw or share as a direct link
      </p>
    </div>

    {/* Form preview */}
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Form preview</p>
        <a href="/intake.html" target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          Open full screen <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe src="/intake.html" className="w-full rounded-lg border bg-white"
        style={{ height: 480, display: 'block' }} title="Intake form preview" />
    </div>

    <EmbedPanel />
    <RoutingConfig />
    <SubmissionsLog />
  </div>
);

export default AdminIntake;
