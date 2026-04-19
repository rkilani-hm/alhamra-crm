// AdminSap — SAP S/4HANA integration admin panel.
// Manages connection config, triggers syncs, shows sync history.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Server, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Building2, FileText, ArrowUpDown, Download, Info, Zap,
  ChevronRight, Clock, BarChart2, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────
interface SyncLog {
  id: string; sync_type: string; sap_id: string | null;
  entity_type: string; action: string; status: string;
  error_msg: string | null; notes: string | null; created_at: string;
}

interface ConnectionStatus {
  connected?: boolean; configured?: boolean; latency_ms?: number;
  message?: string; sap_url?: string; error?: string;
}

// ── Sub-components ────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => (
  <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
    status === 'success' ? 'bg-green-100 text-green-700' :
    status === 'error'   ? 'bg-red-100 text-red-700'    :
    'bg-amber-100 text-amber-700')}>
    {status}
  </span>
);

const ActionBadge = ({ action }: { action: string }) => (
  <span className={cn('text-[10px] font-medium rounded px-1.5 py-0.5',
    action === 'created' ? 'bg-blue-100 text-blue-700'  :
    action === 'updated' ? 'bg-purple-100 text-purple-700' :
    action === 'error'   ? 'bg-red-100 text-red-700'    :
    'bg-muted text-muted-foreground')}>
    {action}
  </span>
);

// ── Connection panel ──────────────────────────────────────────
const ConnectionPanel = () => {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sap-test-connection');
      if (error) throw error;
      setStatus(data);
    } catch (e: any) {
      setStatus({ connected: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">SAP S/4HANA Connection</h3>
        <button onClick={test} disabled={testing}
          className="ml-auto flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-60">
          <RefreshCw className={cn('h-3.5 w-3.5', testing && 'animate-spin')} />
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {status && (
        <div className={cn('rounded-lg border p-4 space-y-3',
          status.connected ? 'border-green-200 bg-green-50' :
          status.configured ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50')}>
          <div className="flex items-center gap-2">
            {status.connected
              ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              : status.configured
              ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              : <XCircle className="h-5 w-5 text-red-600 shrink-0" />}
            <p className="text-sm font-medium">{status.message}</p>
          </div>
          {status.connected && status.latency_ms && (
            <p className="text-xs text-muted-foreground">
              Latency: {status.latency_ms}ms · {status.sap_url}
            </p>
          )}
          {!status.configured && (
            <div className="text-xs space-y-1 text-amber-800">
              <p className="font-semibold">Configure in Supabase Dashboard → Edge Functions → Secrets:</p>
              <div className="font-mono bg-white/60 rounded p-2 space-y-0.5">
                <p><strong>SAP_URL</strong>  — e.g. https://my-s4hana.sap.com</p>
                <p><strong>SAP_USER</strong> — technical user (e.g. CRM_SYNC)</p>
                <p><strong>SAP_PASS</strong> — password for the technical user</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!status && (
        <div className="rounded-lg bg-muted/30 border border-dashed p-4 text-center text-xs text-muted-foreground">
          Click "Test connection" to verify SAP S/4HANA connectivity
        </div>
      )}

      {/* API info */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          { label: 'Business Partner API',  path: '/API_BUSINESS_PARTNER', desc: 'Organizations & contacts' },
          { label: 'RE-FX Contract API',    path: '/API_RE_CONTRACT',      desc: 'Lease agreements' },
          { label: 'Authentication',        path: 'Basic Auth',            desc: 'Technical user credentials' },
          { label: 'Protocol',              path: 'OData v2',              desc: 'JSON over HTTPS' },
        ].map(({ label, path, desc }) => (
          <div key={label} className="rounded-lg bg-muted/20 border p-3">
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-muted-foreground font-mono text-[10px] mt-0.5">{path}</p>
            <p className="text-muted-foreground mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Sync actions panel ────────────────────────────────────────
const SyncPanel = () => {
  const qc = useQueryClient();
  const [results, setResults] = useState<Record<string, any>>({});

  const runSync = useMutation({
    mutationFn: async ({ fn, body }: { fn: string; body?: any }) => {
      const { data, error } = await supabase.functions.invoke(fn, { body: body ?? {} });
      if (error) throw error;
      return { fn, data };
    },
    onSuccess: ({ fn, data }) => {
      setResults(r => ({ ...r, [fn]: data }));
      qc.invalidateQueries({ queryKey: ['sap-sync-log'] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      toast.success(data.message ?? `${fn} completed`);
    },
    onError: (e: any, { fn }) => {
      setResults(r => ({ ...r, [fn]: { error: e.message } }));
      toast.error(`${fn} failed: ` + (e.message?.includes('non-2xx') ? 'Edge function not deployed yet' : e.message));
    },
  });

  const syncs = [
    {
      fn:    'sap-sync-bp',
      icon:  Building2,
      color: '#1e3a5f',
      label: 'Pull Business Partners',
      desc:  'Fetch all BP records from SAP → create/update organizations in CRM',
      body:  { limit: 200 },
    },
    {
      fn:    'sap-sync-leases',
      icon:  FileText,
      color: '#2d8653',
      label: 'Pull Lease Contracts',
      desc:  'Fetch RE-FX contracts → update lease dates and status on organizations',
      body:  { limit: 500 },
    },
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-sm">Sync actions</h3>
        <span className="ml-auto text-xs text-muted-foreground">Run individually or in sequence</span>
      </div>

      <div className="divide-y">
        {syncs.map(({ fn, icon: Icon, color, label, desc, body }) => {
          const result = results[fn];
          const running = runSync.isPending && (runSync.variables as any)?.fn === fn;
          return (
            <div key={fn} className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Button size="sm" variant="outline" disabled={running}
                  onClick={() => runSync.mutate({ fn, body })}
                  className="gap-1.5 shrink-0">
                  {running ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running…</>
                           : <><ArrowRight className="h-3.5 w-3.5" /> Run</>}
                </Button>
              </div>

              {result && (
                <div className={cn('mt-3 rounded-lg p-3 text-xs',
                  result.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200')}>
                  {result.error
                    ? <p className="text-red-700">❌ {result.error}</p>
                    : (
                      <div className="text-green-800 space-y-0.5">
                        <p className="font-semibold">✅ {result.message}</p>
                        {result.total !== undefined && (
                          <p>Total: {result.total} · Created: {result.created ?? 0} · Updated: {result.updated ?? 0}</p>
                        )}
                        {result.errors?.length > 0 && (
                          <p className="text-amber-700">⚠ {result.errors.length} errors — see sync log below</p>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Run all */}
      <div className="px-5 py-3 border-t bg-muted/10 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Run both syncs in sequence to fully refresh SAP data</p>
        <Button size="sm" variant="outline" className="gap-1.5"
          disabled={runSync.isPending}
          onClick={async () => {
            await runSync.mutateAsync({ fn: 'sap-sync-bp',     body: { limit: 200 } });
            await runSync.mutateAsync({ fn: 'sap-sync-leases', body: { limit: 500 } });
          }}>
          <Zap className="h-3.5 w-3.5 text-amber-500" /> Full sync
        </Button>
      </div>
    </div>
  );
};

// ── Sync log ──────────────────────────────────────────────────
const SyncLog = () => {
  const { data: logs = [], isLoading, refetch } = useQuery<SyncLog[]>({
    queryKey: ['sap-sync-log'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('sap_sync_log').select('*')
        .order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  // Stats
  const last24h = logs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000));
  const errors  = logs.filter(l => l.status === 'error').length;
  const created = logs.filter(l => l.action === 'created').length;
  const updated = logs.filter(l => l.action === 'updated').length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Sync history</h3>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{logs.length} entries</span>
          {errors > 0 && (
            <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-semibold">{errors} errors</span>
          )}
          <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats row */}
      {logs.length > 0 && (
        <div className="flex gap-4 px-5 py-3 border-b bg-muted/10 text-xs">
          <div><span className="text-muted-foreground">Last 24h: </span><strong>{last24h.length}</strong></div>
          <div><span className="text-muted-foreground">Created: </span><strong className="text-blue-600">{created}</strong></div>
          <div><span className="text-muted-foreground">Updated: </span><strong className="text-purple-600">{updated}</strong></div>
          <div><span className="text-muted-foreground">Errors: </span><strong className="text-red-600">{errors}</strong></div>
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!isLoading && logs.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No sync history yet — run a sync above to get started
          </div>
        )}
        {logs.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/30 border-b">
              <tr>
                {['Time', 'Type', 'SAP ID', 'Entity', 'Action', 'Status', 'Notes'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-muted/10">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono bg-muted rounded px-1.5 py-0.5">{log.sync_type}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{log.sap_id ?? '—'}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{log.entity_type}</td>
                  <td className="px-3 py-2"><ActionBadge action={log.action} /></td>
                  <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground" title={log.error_msg ?? log.notes ?? ''}>
                    {log.error_msg
                      ? <span className="text-red-600">{log.error_msg}</span>
                      : log.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── Field mapping ─────────────────────────────────────────────
const FieldMapping = () => {
  const mappings = [
    { sap: 'BusinessPartner',         crm: 'organizations.sap_bp_number',         dir: '→' },
    { sap: 'BusinessPartnerFullName', crm: 'organizations.name',                  dir: '→' },
    { sap: 'OrganizationBPName2',     crm: 'organizations.name_arabic',           dir: '→' },
    { sap: 'to_Address.PhoneNumber1', crm: 'organizations.phone',                 dir: '→' },
    { sap: 'to_Address.EmailAddress', crm: 'organizations.email',                 dir: '→' },
    { sap: 'to_Address.CityName',     crm: 'organizations.city',                  dir: '→' },
    { sap: 'ContractNumber',          crm: 'organizations.lease_contract_number', dir: '→' },
    { sap: 'RentalObjectNumber',      crm: 'organizations.lease_rental_object',   dir: '→' },
    { sap: 'ValidFrom',               crm: 'organizations.lease_start_date',      dir: '→' },
    { sap: 'ValidTo',                 crm: 'organizations.lease_end_date',        dir: '→' },
    { sap: 'ContractStatus',          crm: 'organizations.lease_status',          dir: '→' },
    { sap: 'BusinessPartner',         crm: 'organizations.sap_bp_number',         dir: '←' },
    { sap: 'BusinessPartnerFullName', crm: 'organizations.name',                  dir: '←' },
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Field mapping</h3>
      </div>
      <div className="divide-y max-h-72 overflow-y-auto scrollbar-thin">
        {mappings.map((m, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-xs hover:bg-muted/10">
            <code className="bg-muted rounded px-1.5 py-0.5 text-[10px] flex-1 truncate">{m.sap}</code>
            <span className={cn('shrink-0 font-bold text-sm', m.dir === '→' ? 'text-green-600' : 'text-blue-600')}>{m.dir}</span>
            <code className="bg-primary/8 text-primary rounded px-1.5 py-0.5 text-[10px] flex-1 truncate">{m.crm}</code>
            <span className="text-muted-foreground/60 text-[9px] shrink-0">
              {m.dir === '→' ? 'SAP→CRM' : 'CRM→SAP'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────
const AdminSap = () => (
  <div className="space-y-6 max-w-5xl mx-auto">
    <div>
      <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
        SAP S/4HANA Integration
      </h1>
      <p className="text-muted-foreground text-sm mt-1">
        On-premise sync agent — Al Hamra CRM
      </p>
    </div>

    {/* On-premise architecture notice */}
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Info className="h-5 w-5 text-blue-600 shrink-0" />
        <p className="text-sm font-semibold text-blue-900">On-premise SAP — agent-based sync</p>
      </div>
      <p className="text-sm text-blue-800">
        SAP S/4HANA runs on your internal network. Sync is handled by a lightweight Node.js agent
        installed on any machine inside your company that can reach SAP.
        The agent reads from SAP OData APIs and pushes to this CRM — all traffic is <strong>outbound only</strong>.
        No firewall ports need to be opened.
      </p>
      <div className="grid grid-cols-3 gap-3 text-xs">
        {[
          { step: '1', label: 'Install Node.js', desc: 'On any PC with SAP access' },
          { step: '2', label: 'Edit config.js',  desc: 'SAP host, user, Supabase key' },
          { step: '3', label: 'Schedule task',   desc: 'Windows Task Scheduler — daily' },
        ].map(({ step, label, desc }) => (
          <div key={step} className="rounded-lg bg-blue-100 border border-blue-200 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{step}</span>
              <p className="font-semibold text-blue-900">{label}</p>
            </div>
            <p className="text-blue-700">{desc}</p>
          </div>
        ))}
      </div>
    </div>

    <SyncLog />
  </div>
);

export default AdminSap;
