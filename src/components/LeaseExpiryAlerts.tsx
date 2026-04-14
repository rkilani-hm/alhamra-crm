// LeaseExpiryAlerts — Shows organizations with leases expiring in ≤90 days
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, CalendarRange, Building2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  id: string; name: string; name_arabic: string | null;
  sap_bp_number: string | null; lease_contract_number: string | null;
  lease_end_date: string; days_remaining: number; alert_level: string;
  phone: string | null;
}

const LEVEL_META = {
  critical: { label: '≤30 days', bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    },
  warning:  { label: '≤60 days', bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500'  },
  upcoming: { label: '≤90 days', bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-400'   },
};

const LeaseExpiryAlerts = () => {
  const nav = useNavigate();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['lease-expiry-alerts'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lease_expiry_alerts').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return (
    <div className="rounded-xl border bg-card p-5">
      <div className="h-4 w-36 bg-muted rounded animate-pulse mb-3" />
      {[1,2,3].map(i => <div key={i} className="h-12 bg-muted/50 rounded-lg mb-2 animate-pulse" />)}
    </div>
  );

  if (alerts.length === 0) return (
    <div className="rounded-xl border bg-card p-5 flex items-center gap-3">
      <CalendarRange className="h-5 w-5 text-green-600" />
      <div>
        <p className="text-sm font-medium">No lease expiries in next 90 days</p>
        <p className="text-xs text-muted-foreground">All active leases are current</p>
      </div>
    </div>
  );

  const critical = alerts.filter(a => a.alert_level === 'critical').length;
  const warning  = alerts.filter(a => a.alert_level === 'warning').length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b">
        <AlertTriangle className={cn('h-4 w-4', critical > 0 ? 'text-red-600' : 'text-amber-500')} />
        <h3 className="font-semibold text-sm">Lease Expiry Alerts</h3>
        <div className="flex items-center gap-2 ml-auto">
          {critical > 0 && (
            <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-semibold animate-pulse">
              {critical} CRITICAL
            </span>
          )}
          {warning > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
              {warning} warning
            </span>
          )}
          <span className="text-xs text-muted-foreground">{alerts.length} total</span>
        </div>
      </div>

      <div className="divide-y max-h-[360px] overflow-y-auto scrollbar-thin">
        {alerts.map(a => {
          const meta = LEVEL_META[a.alert_level as keyof typeof LEVEL_META] ?? LEVEL_META.upcoming;
          return (
            <button key={a.id} onClick={() => nav(`/organizations/${a.id}`)}
              className={cn('flex items-center gap-3 w-full px-5 py-3.5 text-left hover:bg-muted/20 transition-colors', meta.bg)}>
              <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', meta.dot)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{a.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {a.sap_bp_number && (
                    <span className="text-[10px] text-muted-foreground font-mono">{a.sap_bp_number}</span>
                  )}
                  {a.lease_contract_number && (
                    <span className="text-[10px] text-muted-foreground">Contract: {a.lease_contract_number}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-bold', meta.badge)}>
                  {a.days_remaining}d left
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {format(new Date(a.lease_end_date), 'd MMM yyyy')}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LeaseExpiryAlerts;
