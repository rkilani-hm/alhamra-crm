import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { subDays, format, startOfDay, eachDayOfInterval } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FileText, Clock, CheckCircle2, AlertCircle,
  TrendingUp, TrendingDown, Users, MessageSquare,
} from 'lucide-react';

// ── Colour palette matching Alhamra brand ───────────────────
const COLORS = {
  navy:   'hsl(213,60%,22%)',
  blue:   'hsl(213,50%,45%)',
  bronze: 'hsl(38,55%,62%)',
  green:  'hsl(152,55%,40%)',
  amber:  'hsl(38,90%,50%)',
  red:    'hsl(0,72%,51%)',
  muted:  'hsl(213,20%,75%)',
};

const STATUS_COLORS: Record<string, string> = {
  new:        COLORS.blue,
  inprogress: COLORS.amber,
  done:       COLORS.green,
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: COLORS.red,
  normal: COLORS.navy,
  low:    COLORS.muted,
};

// ── KPI card ────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, trend, color = COLORS.navy }: any) => (
  <div className="stat-card rounded-xl border bg-card p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl font-light" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className="rounded-lg p-2.5" style={{ background: `${color}18`, color }}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-destructive'}`}>
        {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        {Math.abs(trend)}% vs last 7 days
      </div>
    )}
  </div>
);

// ── Chart section wrapper ────────────────────────────────────
const ChartCard = ({ title, sub, children }: any) => (
  <div className="rounded-xl border bg-card p-5">
    <div className="mb-4">
      <h3 className="font-medium text-sm">{title}</h3>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
    {children}
  </div>
);

// ── Tooltip styles ────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-2.5 text-xs shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────
const Reports = () => {
  const today   = new Date();
  const d30ago  = subDays(today, 30);
  const d7ago   = subDays(today, 7);
  const d14ago  = subDays(today, 14);

  // All cases for the last 30 days
  const { data: cases = [] } = useQuery({
    queryKey: ['reports-cases'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cases')
        .select('*, departments(name)')
        .gte('created_at', d30ago.toISOString())
        .order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  // Previous period for trends
  const { data: prevCases = [] } = useQuery({
    queryKey: ['reports-cases-prev'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cases')
        .select('id, status, priority, created_at')
        .gte('created_at', d14ago.toISOString())
        .lt('created_at', d7ago.toISOString());
      return data ?? [];
    },
  });

  // WhatsApp conversations count
  const { data: waCount } = useQuery({
    queryKey: ['reports-wa'],
    queryFn: async () => {
      const { count } = await supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', d30ago.toISOString());
      return count ?? 0;
    },
  });

  // ── Derived KPIs ─────────────────────────────────────────
  const thisWeek  = cases.filter(c => new Date(c.created_at) >= d7ago);
  const lastWeek  = prevCases;

  const totalOpen   = cases.filter(c => c.status !== 'done').length;
  const totalDone   = cases.filter(c => c.status === 'done').length;
  const urgent      = cases.filter(c => c.priority === 'urgent' && c.status !== 'done').length;
  const totalCases  = cases.length;

  const weekTrend = lastWeek.length > 0
    ? Math.round(((thisWeek.length - lastWeek.length) / lastWeek.length) * 100)
    : 0;

  // Avg resolution time (done cases, in hours)
  const doneCasesWithTime = cases.filter(c => c.status === 'done');
  const avgHours = doneCasesWithTime.length > 0
    ? Math.round(doneCasesWithTime.reduce((sum, c) => {
        const diff = (new Date().getTime() - new Date(c.created_at).getTime()) / 3600000;
        return sum + Math.min(diff, 720); // cap at 30 days
      }, 0) / doneCasesWithTime.length)
    : 0;

  // ── Chart data ────────────────────────────────────────────

  // Daily cases — last 14 days
  const days14 = eachDayOfInterval({ start: subDays(today, 13), end: today });
  const dailyData = days14.map(day => {
    const label = format(day, 'dd MMM');
    const dayStart = startOfDay(day);
    const dayEnd   = new Date(dayStart.getTime() + 86400000);
    const dayCases = cases.filter(c => {
      const d = new Date(c.created_at);
      return d >= dayStart && d < dayEnd;
    });
    return {
      date:   label,
      new:        dayCases.filter(c => c.status === 'new').length,
      inprogress: dayCases.filter(c => c.status === 'inprogress').length,
      done:       dayCases.filter(c => c.status === 'done').length,
      total:      dayCases.length,
    };
  });

  // By department
  const deptMap: Record<string, { name: string; open: number; done: number }> = {};
  cases.forEach((c: any) => {
    const name = c.departments?.name ?? 'Unassigned';
    if (!deptMap[name]) deptMap[name] = { name, open: 0, done: 0 };
    if (c.status === 'done') deptMap[name].done++;
    else                     deptMap[name].open++;
  });
  const deptData = Object.values(deptMap).sort((a, b) => (b.open + b.done) - (a.open + a.done));

  // By status (pie)
  const statusCounts = {
    new:        cases.filter(c => c.status === 'new').length,
    inprogress: cases.filter(c => c.status === 'inprogress').length,
    done:       totalDone,
  };
  const pieData = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k === 'inprogress' ? 'In Progress' : k, value: v, key: k }));

  // By priority
  const priorityData = [
    { name: 'Urgent', value: cases.filter(c => c.priority === 'urgent').length, color: COLORS.red },
    { name: 'Normal', value: cases.filter(c => c.priority === 'normal').length, color: COLORS.navy },
    { name: 'Low',    value: cases.filter(c => c.priority === 'low').length,    color: COLORS.muted },
  ].filter(d => d.value > 0);

  // By channel
  const channelMap: Record<string, number> = {};
  cases.forEach((c: any) => {
    channelMap[c.channel ?? 'unknown'] = (channelMap[c.channel ?? 'unknown'] ?? 0) + 1;
  });
  const channelData = Object.entries(channelMap).map(([name, value]) => ({ name, value }));

  // Weekly volume (last 4 weeks)
  const weeklyData = [3, 2, 1, 0].map(weeksAgo => {
    const start = subDays(today, (weeksAgo + 1) * 7);
    const end   = subDays(today, weeksAgo * 7);
    const wCases = cases.filter(c => {
      const d = new Date(c.created_at);
      return d >= start && d < end;
    });
    return {
      week:  `W-${weeksAgo === 0 ? 'curr' : weeksAgo}`,
      cases: wCases.length,
      done:  wCases.filter(c => c.status === 'done').length,
    };
  });

  const RADIAN = Math.PI / 180;
  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.06) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium text-foreground" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          Reports & KPIs
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Last 30 days · refreshes on load</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total cases"   value={totalCases}  sub="last 30 days"    icon={FileText}      trend={weekTrend}  color={COLORS.navy}   />
        <KpiCard label="Open cases"    value={totalOpen}   sub={`${urgent} urgent`} icon={Clock}       color={COLORS.amber}  />
        <KpiCard label="Resolved"      value={totalDone}   sub={`${avgHours}h avg`} icon={CheckCircle2} color={COLORS.green}  />
        <KpiCard label="Urgent open"   value={urgent}      sub="needs attention"  icon={AlertCircle}   color={COLORS.red}    />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="WhatsApp chats"  value={waCount ?? 0}     sub="last 30 days"  icon={MessageSquare} color={COLORS.blue}   />
        <KpiCard label="This week"       value={thisWeek.length}  sub="cases logged"  icon={TrendingUp}    color={COLORS.bronze} />
        <KpiCard label="Resolution rate" value={totalCases > 0 ? `${Math.round((totalDone/totalCases)*100)}%` : '—'} sub="cases resolved" icon={CheckCircle2} color={COLORS.green} />
        <KpiCard label="Avg resolution"  value={avgHours > 0 ? `${avgHours}h` : '—'} sub="per closed case" icon={Clock} color={COLORS.muted} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ChartCard title="Daily case volume" sub="Last 14 days — new, in-progress, done">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} barSize={6} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,20%,88%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="new"        fill={COLORS.blue}  name="New"         radius={[3,3,0,0]} />
                <Bar dataKey="inprogress" fill={COLORS.amber} name="In Progress" radius={[3,3,0,0]} />
                <Bar dataKey="done"       fill={COLORS.green} name="Done"        radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Status breakdown" sub="All 30-day cases">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                innerRadius={55} outerRadius={90}
                paddingAngle={3} dataKey="value"
                labelLine={false} label={renderPieLabel}
              >
                {pieData.map(d => (
                  <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? COLORS.muted} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ChartCard title="Cases by department" sub="Open vs resolved">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptData} layout="vertical" barSize={10} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,20%,88%)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="open" fill={COLORS.amber} name="Open"     radius={[0,3,3,0]} />
                <Bar dataKey="done" fill={COLORS.green} name="Resolved" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="flex flex-col gap-4">
          <ChartCard title="By priority">
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={priorityData} barSize={18}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Cases" radius={[4,4,0,0]}>
                  {priorityData.map(d => <Cell key={d.name} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="By channel">
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={channelData} barSize={18}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Cases" fill={COLORS.navy} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Weekly trend */}
      <ChartCard title="Weekly volume trend" sub="Cases opened vs resolved — last 4 weeks">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,20%,88%)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="cases" stroke={COLORS.navy}  strokeWidth={2} dot={{ r: 4, fill: COLORS.navy }}  name="Opened"   />
            <Line type="monotone" dataKey="done"  stroke={COLORS.green} strokeWidth={2} dot={{ r: 4, fill: COLORS.green }} name="Resolved" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Department table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="font-medium text-sm">Department performance</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {['Department','Total','Open','Resolved','% Done','Urgent'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {deptData.map(d => {
              const total = d.open + d.done;
              const pct   = total > 0 ? Math.round((d.done / total) * 100) : 0;
              const urg   = cases.filter((c: any) => c.departments?.name === d.name && c.priority === 'urgent' && c.status !== 'done').length;
              return (
                <tr key={d.name} className="table-row-hover">
                  <td className="px-5 py-3 font-medium">{d.name}</td>
                  <td className="px-5 py-3">{total}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">{d.open}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium">{d.done}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {urg > 0
                      ? <span className="rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium">{urg}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
