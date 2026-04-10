import { Phone, Users, MessageSquare, Mail, Building2, CheckSquare, FileText, Briefcase } from 'lucide-react';
import { ActivityType } from '@/types';
import { cn } from '@/lib/utils';

const CONFIG: Record<ActivityType, { icon: any; color: string; bg: string; label: string }> = {
  call:      { icon: Phone,         color: 'text-green-700',  bg: 'bg-green-100',  label: 'Call'      },
  meeting:   { icon: Users,         color: 'text-blue-700',   bg: 'bg-blue-100',   label: 'Meeting'   },
  whatsapp:  { icon: MessageSquare, color: 'text-emerald-700',bg: 'bg-emerald-100',label: 'WhatsApp'  },
  email:     { icon: Mail,          color: 'text-purple-700', bg: 'bg-purple-100', label: 'Email'     },
  visit:     { icon: Building2,     color: 'text-orange-700', bg: 'bg-orange-100', label: 'Visit'     },
  task:      { icon: CheckSquare,   color: 'text-amber-700',  bg: 'bg-amber-100',  label: 'Task'      },
  note:      { icon: FileText,      color: 'text-slate-700',  bg: 'bg-slate-100',  label: 'Note'      },
  case:      { icon: Briefcase,     color: 'text-red-700',    bg: 'bg-red-100',    label: 'Case'      },
};

export const ACTIVITY_CONFIG = CONFIG;

export const ActivityIcon = ({ type, size = 'md' }: { type: ActivityType; size?: 'sm' | 'md' | 'lg' }) => {
  const { icon: Icon, color, bg } = CONFIG[type] ?? CONFIG.note;
  const dims = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const icon = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full', dims, bg)}>
      <Icon className={cn(icon, color)} />
    </div>
  );
};

export default ActivityIcon;
