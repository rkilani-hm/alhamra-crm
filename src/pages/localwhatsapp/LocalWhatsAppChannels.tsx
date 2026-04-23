// LocalWhatsAppChannels — Manage WhatsApp numbers connected via Railway + Evolution API.
// Shows instance cards with QR codes for scanning, connection status, and message counts.
// Completely separate from Wazzup24 — reads from local_wa_instances + wa_channels source='local'.

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, RefreshCw, Smartphone, Wifi, WifiOff, Loader2,
  QrCode, Trash2, LogOut, CheckCircle2, AlertCircle, Clock,
  Info, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface WaInstance {
  id:            string;
  instance_name: string;
  label:         string;
  phone:         string | null;
  state:         'disconnected' | 'connecting' | 'qr' | 'connected' | 'refused' | 'error';
  qr_code:       string | null;
  qr_updated_at: string | null;
  connected_at:  string | null;
  channel_id:    string | null;
  created_at:    string;
}

const StateBadge = ({ state }: { state: WaInstance['state'] }) => {
  const cfg: Record<string, { label: string; icon: any; cls: string }> = {
    connected:    { label: 'Connected',    icon: CheckCircle2, cls: 'text-green-700 bg-green-100 border-green-200' },
    qr:           { label: 'Scan QR',      icon: QrCode,       cls: 'text-blue-700 bg-blue-100 border-blue-200'   },
    connecting:   { label: 'Connecting…',  icon: Loader2,      cls: 'text-amber-700 bg-amber-100 border-amber-200' },
    disconnected: { label: 'Disconnected', icon: WifiOff,      cls: 'text-gray-600 bg-gray-100 border-gray-200'   },
    refused:      { label: 'Refused',      icon: AlertCircle,  cls: 'text-red-700 bg-red-100 border-red-200'       },
    error:        { label: 'Error',        icon: AlertCircle,  cls: 'text-red-700 bg-red-100 border-red-200'       },
  };
  const { label, icon: Icon, cls } = cfg[state] ?? { label: state, icon: Clock, cls: 'text-gray-600 bg-gray-100 border-gray-200' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls)}>
      <Icon className={cn('h-3 w-3', state === 'connecting' && 'animate-spin')} />{label}
    </span>
  );
};

const QrCard = ({ instance, onRefresh }: { instance: WaInstance; onRefresh: () => void }) => {
  const [sec, setSec] = useState(60);
  useEffect(() => {
    if (instance.state !== 'qr' || !instance.qr_updated_at) return;
    const elapsed = Math.floor((Date.now() - new Date(instance.qr_updated_at).getTime()) / 1000);
    setSec(Math.max(0, 60 - elapsed));
    const t = setInterval(() => setSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [instance.qr_updated_at, instance.state]);

  if (instance.state !== 'qr' || !instance.qr_code) return null;
  const src = instance.qr_code.startsWith('data:') ? instance.qr_code : `data:image/png;base64,${instance.qr_code}`;
  return (
    <div className="mt-3 mb-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-4 flex flex-col items-center gap-3">
      <p className="text-xs font-semibold text-blue-800 text-center">
        Open WhatsApp → Settings → Linked Devices → Link a device → Scan QR
      </p>
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <img src={src} alt="WhatsApp QR Code" className="h-44 w-44" />
      </div>
      <div className="flex items-center gap-3 text-xs text-blue-700">
        <span>Expires in {sec}s</span>
        {sec < 10 && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        )}
      </div>
    </div>
  );
};

const InstanceCard = ({ instance }: { instance: WaInstance }) => {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      const { data, error } = await supabase.functions.invoke('local-wa-api', {
        body: { action, instanceName: instance.instance_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      if (action === 'logout') toast.success('Disconnected');
      if (action === 'delete') toast.success('Instance deleted');
      if (action === 'connect') toast.success('Fetching QR code…');
    },
    onError: (e: any) => toast.error(e.message, { duration: 5000 }),
  });

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/20">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          instance.state === 'connected' ? 'bg-green-100' : 'bg-muted')}>
          <Smartphone className={cn('h-5 w-5', instance.state === 'connected' ? 'text-green-600' : 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{instance.label}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {instance.phone ? `+${instance.phone}` : instance.instance_name}
          </p>
        </div>
        <StateBadge state={instance.state} />
      </div>

      <div className="px-5">
        <QrCard instance={instance} onRefresh={() => act.mutate({ action: 'connect' })} />
      </div>

      {instance.connected_at && instance.state === 'connected' && (
        <div className="px-5 py-2 text-xs text-muted-foreground">
          <Wifi className="h-3 w-3 inline mr-1 text-green-500" />
          Connected {formatDistanceToNow(new Date(instance.connected_at), { addSuffix: true })}
        </div>
      )}

      <div className="flex items-center gap-2 px-5 py-3 border-t bg-muted/10">
        {(instance.state === 'disconnected' || instance.state === 'error' || instance.state === 'refused') && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={act.isPending}
            onClick={() => act.mutate({ action: 'connect' })}>
            <QrCode className="h-3.5 w-3.5" />{act.isPending ? 'Loading…' : 'Connect via QR'}
          </Button>
        )}
        {instance.state === 'connected' && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
            disabled={act.isPending} onClick={() => act.mutate({ action: 'logout' })}>
            <LogOut className="h-3.5 w-3.5" /> Disconnect
          </Button>
        )}
        {instance.state === 'qr' && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={act.isPending}
            onClick={() => act.mutate({ action: 'connect' })}>
            <RefreshCw className={cn('h-3.5 w-3.5', act.isPending && 'animate-spin')} /> Refresh QR
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-destructive hover:bg-red-50"
          disabled={act.isPending}
          onClick={() => { if (window.confirm(`Delete "${instance.label}"? This cannot be undone.`)) act.mutate({ action: 'delete' }); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

const AddInstanceModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [name,  setName]  = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const safeName = name.trim();
      if (!safeName || !label.trim()) throw new Error('Label and instance name are required');
      const { data, error } = await supabase.functions.invoke('local-wa-api', {
        body: { action: 'create_instance', instanceName: safeName, data: { label: label.trim() } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.setup ? '\n\n' + data.setup : ''));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      toast.success('Instance created — scan the QR code to connect your WhatsApp');
      setLabel(''); setName('');
      onClose();
    },
    onError: (e: any) => toast.error(e.message, { duration: 8000 }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add WhatsApp Number</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium">Display label *</label>
            <Input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Sales Line, Leasing Support" className="h-9 mt-1 text-sm" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium">Instance name * (letters, numbers, underscores only)</label>
            <Input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,''))}
              placeholder="e.g. sales_line_1" className="h-9 mt-1 text-sm font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">Cannot be changed after creation</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()}
            disabled={create.isPending || !label.trim() || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create & get QR'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SetupGuide = () => (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
    <div className="flex items-center gap-2">
      <Info className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-sm font-semibold text-amber-900">One-time Railway setup required</p>
    </div>
    <p className="text-sm text-amber-800">
      Local WhatsApp channels use <strong>Evolution API</strong> on Railway (QR-based, no Meta approval needed).
      Complete these steps once, then add numbers above.
    </p>
    <div className="space-y-2 text-xs text-amber-900">
      {[
        { n:'1', t:'Deploy Evolution API on Railway',        d:'In your Railway project → New Service → Template → search "Evolution API". Auto-provisions API + PostgreSQL + Redis.' },
        { n:'2', t:'Set Evolution API environment variables', d:'AUTHENTICATION_TYPE=apikey\nAUTHENTICATION_API_KEY=<strong-key>\nCORS_ORIGIN=https://alhamra-crm.lovable.app' },
        { n:'3', t:'Set Supabase Edge Function secrets',     d:'RAILWAY_WA_URL = https://your-service.up.railway.app\nRAILWAY_WA_API_KEY = <same-key>\nLOCAL_WA_WEBHOOK_SECRET = <any-random-string>' },
        { n:'4', t:'Deploy edge functions (tell Lovable)',    d:'local-wa-api\nlocal-wa-webhook  (--no-verify-jwt)\nRun migration: 20260423_local_whatsapp.sql' },
      ].map(({ n, t, d }) => (
        <div key={n} className="flex gap-3 rounded-lg bg-amber-100 border border-amber-200 p-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white font-bold text-[10px]">{n}</span>
          <div><p className="font-semibold">{t}</p><p className="opacity-80 mt-0.5 whitespace-pre-line font-mono text-[10px]">{d}</p></div>
        </div>
      ))}
    </div>
    <a href="https://railway.com/deploy/evolution-api-4" target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs text-amber-800 underline font-medium">
      <ExternalLink className="h-3 w-3" /> Open Evolution API Railway template
    </a>
  </div>
);

const LocalWhatsAppChannels = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const isManager = profile?.role === 'manager';

  const { data: instances = [], isLoading } = useQuery<WaInstance[]>({
    queryKey: ['local-wa-instances'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('local_wa_instances').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const sub = supabase.channel('local-wa-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_wa_instances' }, () => {
        qc.invalidateQueries({ queryKey: ['local-wa-instances'] });
      }).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [qc]);

  const connected = instances.filter(i => i.state === 'connected');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            Local WhatsApp Channels
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect WhatsApp numbers via QR code — Railway + Evolution API
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add number
          </Button>
        )}
      </div>

      {instances.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total numbers', value: instances.length,                       icon: Smartphone },
            { label: 'Connected',     value: connected.length,                       icon: Wifi       },
            { label: 'Offline',       value: instances.length - connected.length,    icon: WifiOff    },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            </div>
          ))}
        </div>
      )}

      <SetupGuide />

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && instances.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Smartphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No WhatsApp numbers connected yet</p>
          <p className="text-xs text-muted-foreground mt-1">Complete the setup above, then click "Add number"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {instances.map(inst => <InstanceCard key={inst.id} instance={inst} />)}
      </div>

      <AddInstanceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
};

export default LocalWhatsAppChannels;
