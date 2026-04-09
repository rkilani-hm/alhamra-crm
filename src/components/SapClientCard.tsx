import { SapClient } from '@/types';
import { Building2, Phone, Mail, FileText, Layers } from 'lucide-react';

const statusConfig = {
  active:  { label: 'Active contract',  className: 'bg-green-50 text-green-700 border border-green-200' },
  expired: { label: 'Expired contract', className: 'bg-red-50 text-red-700 border border-red-200' },
  pending: { label: 'Pending contract', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

const SapClientCard = ({ client }: { client: SapClient }) => {
  const status = statusConfig[client.contract_status] ?? statusConfig.pending;
  return (
    <div className="rounded-lg border-2 p-4 space-y-3"
      style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.04)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{client.name}</span>
        </div>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${status.className}`}>
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {client.unit && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span>Unit <strong className="text-foreground">{client.unit}</strong></span>
          </div>
        )}
        {client.floor && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span>Floor <strong className="text-foreground">{client.floor}</strong></span>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground">{client.phone}</span>
          </div>
        )}
        {client.email && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground truncate">{client.email}</span>
          </div>
        )}
        {client.contract_number && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span>Contract <strong className="text-foreground">{client.contract_number}</strong></span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground border-t pt-2">
        SAP BP# {client.bp_number} · synced from SAP S/4HANA
      </p>
    </div>
  );
};

export default SapClientCard;
