import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  subDays, format, startOfDay, eachDayOfInterval, startOfMonth, endOfMonth,
  differenceInHours, parseISO
} from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FileText, Clock, CheckCircle2, AlertCircle, TrendingUp, TrendingDown,
  Users, MessageSquare, Download, Building2, Activity, Timer, BarChart2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AH = { RED: '#CD1719', DARK: '#1D1D1B', NAVY: '#1e3a5f' };
const C  = {
  red:    AH.RED,    navy: AH.NAVY,
  green:  '#2d8653', amber:  '#e09c1a',
  blue:   '#2563eb', purple: '#7c3aed',
  muted:  '#94a3b8',
};

/* ── Shared components ─────────────────────────────────────── */
const KpiCard = ({ label, value, sub, icon: Icon, trend, color = C.navy }: any) => (
  <div className="rounded-xl border bg-card p-5">
    <div className="flex items-start justify-between mb-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: color + '15' }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      {trend !== undefined && (
        <span className={cn('flex items-center gap-1 text-xs font-medium', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
          {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <p className="text-2xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{value}</p>
    <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

const ChartCard = ({ title, sub, children, onExport }: any) => (
  <div className="rounded-xl border bg-card p-5">
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {onExport && (
        <button onClick={onExport} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors border rounded px-2 py-1">
          <Download className="h-3 w-3" /> CSV
        </button>
      )}
    </div>
    {children}
  </div>
);

const CTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg text-xs space-y-1">
      {label && <p className="font-medium text-muted-foreground">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name ?? p.dataKey}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// CSV export helper
const exportCsv = (rows: any[], filename: string) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).join(',');
  const body    = rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const blob    = new Blob([headers + '\n' + body], { type: 'text/csv' });
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(blob);
  a.download    = filename;
  a.click();
};

/* ── Main Reports page ─────────────────────────────────────── */
const RANGES = ['7d', '30d', 'MTD', '90d'] as const;
type Range = typeof RANGES[number];

const Reports = () => {
  const [range, setRange] = useState<Range>('30d');
  const today    = new Date();
  const rangeMap: Record<Range, Date> = {
    '7d':  subDays(today, 7),
    '30d': subDays(today, 30),
    'MTD': startOfMonth(today),
    '90d': subDays(today, 90),
  };
  const since   = rangeMap[range];
  const sinceIso = since.toISOString();

  // ── Queries ───────────────────────────────────────────────
  const { data: cases = [] } = useQuery({
    queryKey: ['rep-cases', range],
    queryFn: async () => {
      const { data } = await (supabase as any).from('cases')
        .select('id,status,priority,created_at,updated_at,channel,inquiry_type,department_id,created_by,departments(name),profiles:created_by(full_name)')
        .gte('created_at', sinceIso);
      return data ?? [];
    },
  });

  const { data: prevCases = [] } = useQuery({
    queryKey: ['rep-cases-prev', range],
    queryFn: async () => {
      const prevEnd   = since.toISOString();
      const prevStart = subDays(since, differenceInHours(today, since) / 24).toISOString();
      const { data }  = await (supabase as any).from('cases').select('id')
        .gte('created_at', prevStart).lt('created_at', prevEnd);
      return data ?? [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['rep-contacts', range],
    queryFn: async () => {
      const { data } = await (supabase as any).from('contacts').select('id,source,client_type,created_at').gte('created_at', sinceIso);
      return data ?? [];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['rep-activities', range],
    queryFn: async () => {
      const { data } = await (supabase as any).from('activities').select('id,type,created_at,created_by,profiles:created_by(full_name)').gte('created_at', sinceIso);
      return data ?? [];
    },
  });

  const { data: waMessages = [] } = useQuery({
    queryKey: ['rep-wa', range],
    queryFn: async () => {
      const { data } = await (supabase as any).from('wa_messages').select('id,direction,sent_at').gte('sent_at', sinceIso);
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['rep-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id,full_name,role,department_id,departments(name)');
      return (data ?? []) as any[];
    },
  });

  // ── Computed metrics ──────────────────────────────────────
  const totalCases  = cases.length;
  const openCases   = cases.filter((c: any) => c.status !== 'done').length;
  const doneCases   = cases.filter((c: any) => c.status === 'done').length;
  const urgent      = cases.filter((c: any) => c.priority === 'urgent' && c.status !== 'done').length;
  const prevTotal   = prevCases.length;
  const trend       = prevTotal > 0 ? Math.round(((totalCases - prevTotal) / prevTotal) * 100) : 0;

  // Avg resolution time (done cases)
  const doneCasesWithTime = cases.filter((c: any) => c.status === 'done' && c.updated_at);
  const avgResolutionH    = doneCasesWithTime.length > 0
    ? Math.round(doneCasesWithTime.reduce((s: number, c: any) =>
        s + differenceInHours(parseISO(c.updated_at), parseISO(c.created_at)), 0) / doneCasesWithTime.length)
    : null;

  const waOutbound = waMessages.filter((m: any) => m.direction === 'outbound').length;
  const waInbound  = waMessages.filter((m: any) => m.direction === 'inbound').length;

  // ── Daily trend ───────────────────────────────────────────
  const numDays = Math.min(30, Math.round(differenceInHours(today, since) / 24));
  const days    = eachDayOfInterval({ start: subDays(today, numDays - 1), end: today });
  const dailyData = days.map(day => {
    const s = startOfDay(day); const e = new Date(s.getTime() + 86400000);
    return {
      day:      format(day, numDays > 14 ? 'd/M' : 'dd MMM'),
      created:  cases.filter((c: any) => { const d = parseISO(c.created_at); return d >= s && d < e; }).length,
      resolved: cases.filter((c: any) => c.status === 'done' && c.updated_at && (() => { const d = parseISO(c.updated_at); return d >= s && d < e; })()).length,
    };
  });

  // ── By department ─────────────────────────────────────────
  const deptMap: Record<string, { name: string; created: number; done: number; urgent: number }> = {};
  cases.forEach((c: any) => {
    const name = c.departments?.name ?? 'Unassigned';
    if (!deptMap[name]) deptMap[name] = { name, created: 0, done: 0, urgent: 0 };
    deptMap[name].created++;
    if (c.status === 'done') deptMap[name].done++;
    if (c.priority === 'urgent') deptMap[name].urgent++;
  });
  const deptData = Object.values(deptMap).sort((a, b) => b.created - a.created);

  // ── By channel ────────────────────────────────────────────
  const channelMap: Record<string, number> = {};
  cases.forEach((c: any) => { const ch = c.channel ?? 'unknown'; channelMap[ch] = (channelMap[ch] ?? 0) + 1; });
  const channelData = Object.entries(channelMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  const PIE_COLORS = [C.red, C.navy, C.green, C.amber, C.purple, C.blue];

  // ── SLA compliance (resolved within 24h = compliant) ─────
  const slaTarget = 24;
  const slaPassed = doneCasesWithTime.filter((c: any) =>
    differenceInHours(parseISO(c.updated_at), parseISO(c.created_at)) <= slaTarget
  ).length;
  const slaPct = doneCasesWithTime.length > 0
    ? Math.round((slaPassed / doneCasesWithTime.length) * 100) : null;

  // ── Agent workload ────────────────────────────────────────
  const agentMap: Record<string, { name: string; open: number; done: number; activities: number }> = {};
  profiles.filter((p: any) => p.role !== 'department').forEach((p: any) => {
    agentMap[p.id] = { name: p.full_name ?? 'Unknown', open: 0, done: 0, activities: 0 };
  });
  cases.forEach((c: any) => {
    if (c.created_by && agentMap[c.created_by]) {
      if (c.status !== 'done') agentMap[c.created_by].open++;
      else agentMap[c.created_by].done++;
    }
  });
  activities.forEach((a: any) => {
    if (a.created_by && agentMap[a.created_by]) agentMap[a.created_by].activities++;
  });
  const agentData = Object.values(agentMap).filter(a => a.open + a.done + a.activities > 0)
    .sort((a, b) => (b.open + b.done) - (a.open + a.done));

  // ── Inquiry type distribution ─────────────────────────────
  const typeMap: Record<string, number> = {};
  cases.forEach((c: any) => { const t = c.inquiry_type ?? 'general'; typeMap[t] = (typeMap[t] ?? 0) + 1; });
  const typeData = Object.entries(typeMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase()+name.slice(1), value }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Reports</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Analytics dashboard · Al Hamra Real Estate</p>
        </div>
        {/* Range selector */}
        <div className="flex rounded-lg border overflow-hidden bg-muted/30">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('px-4 py-1.5 text-xs font-medium transition-colors',
                range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Cases" value={totalCases} trend={trend} icon={FileText}   color={C.navy} sub={`${prevTotal} prev period`} />
        <KpiCard label="Open"        value={openCases}                 icon={Clock}      color={C.amber} />
        <KpiCard label="Resolved"    value={doneCases}                 icon={CheckCircle2} color={C.green} />
        <KpiCard label="Urgent Open" value={urgent}                    icon={AlertCircle} color={C.red} />
        <KpiCard label="Avg Resolution" value={avgResolutionH != null ? `${avgResolutionH}h` : '—'} icon={Timer} color={C.blue} sub="resolved cases" />
        <KpiCard label="SLA ≤24h"    value={slaPct != null ? `${slaPct}%` : '—'}         icon={BarChart2} color={C.purple} sub={`${slaPassed}/${doneCasesWithTime.length} on time`} />
      </div>

      {/* WhatsApp metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="WA Inbound"  value={waInbound}            icon={MessageSquare} color={C.green} />
        <KpiCard label="WA Outbound" value={waOutbound}           icon={MessageSquare} color={C.navy} />
        <KpiCard label="New Contacts" value={contacts.length}     icon={Users}         color={C.blue} />
        <KpiCard label="Activities"  value={activities.length}    icon={Activity}      color={C.purple} />
      </div>

      {/* Daily trend chart */}
      <ChartCard title="Daily case volume" sub={`Created vs resolved · last ${numDays} days`}
        onExport={() => exportCsv(dailyData, `cases-daily-${range}.csv`)}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={numDays > 14 ? 3 : 1} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
            <Tooltip content={<CTip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="created"  name="Created"  stroke={C.navy}  strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="resolved" name="Resolved" stroke={C.green} strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Two column: dept + channel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Cases by department" sub="Created in period"
          onExport={() => exportCsv(deptData, `cases-by-dept-${range}.csv`)}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
              <Tooltip content={<CTip />} />
              <Bar dataKey="created" name="Created" fill={C.navy}  radius={[0,4,4,0]} />
              <Bar dataKey="done"    name="Resolved" fill={C.green} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cases by channel" sub="Distribution">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  labelLine={false} fontSize={10}>
                  {channelData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CTip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>
      </div>

      {/* Agent workload table */}
      {agentData.length > 0 && (
        <ChartCard title="Agent workload" sub="Cases + activities in period"
          onExport={() => exportCsv(agentData, `agent-workload-${range}.csv`)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>{['Agent','Open cases','Resolved','Activities','Total load'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {agentData.map((a, i) => {
                  const total = a.open + a.done + a.activities;
                  const maxTotal = Math.max(...agentData.map(x => x.open + x.done + x.activities));
                  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-medium text-sm">{a.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('text-xs font-semibold', a.open > 5 ? 'text-amber-600' : 'text-foreground')}>{a.open}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-green-600 font-semibold">{a.done}</td>
                      <td className="px-3 py-2.5 text-xs">{a.activities}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.navy }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{total}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* Two column: inquiry types + WA trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Inquiry types" sub="Case classification">
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={typeData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                <Tooltip content={<CTip />} />
                <Bar dataKey="value" name="Cases" radius={[4,4,0,0]}>
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>

        <ChartCard title="WhatsApp volume" sub="Inbound vs outbound messages"
          onExport={() => exportCsv([{ period: range, inbound: waInbound, outbound: waOutbound }], `wa-volume-${range}.csv`)}>
          <div className="flex items-center gap-6 mt-6 justify-center">
            {[
              { label: 'Inbound',  val: waInbound,  color: C.green },
              { label: 'Outbound', val: waOutbound, color: C.navy },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <p className="text-4xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif', color }}>{val}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
            <div className="text-center">
              <p className="text-4xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif', color: C.amber }}>
                {waInbound + waOutbound > 0 ? Math.round((waOutbound / (waInbound + waOutbound)) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Response rate</p>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

export default Reports;
