import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import useIdleTimeout from '@/hooks/useIdleTimeout';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import GlobalSearch from '@/components/GlobalSearch';
import NotificationBell from '@/components/NotificationBell';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut, Layers,
  LayoutDashboard, Users, Building2, Tag,
  ChevronLeft, ChevronRight, MessageSquare, BarChart2, Calendar,
} from 'lucide-react';

/* ─── Official Al Hamra brand tokens ──────────────────────── */
const AH = {
  RED:    '#CD1719',
  DARK:   '#1D1D1B',
  GRAY:   '#B2B2B2',
  LIGHT:  '#EDEDED',
  DIM:    '#252522',     // hover bg
  ACTIVE: '#2C2C29',     // active item bg
  BORDER: '#2A2A27',     // sidebar dividers
  WHITE:  '#FFFFFF',
} as const;

/* ─── Nav config ──────────────────────────────────────────── */
type NavRole = 'frontdesk' | 'manager' | 'department';
interface NavItem {
  to:     string;
  label:  string;
  icon:   React.ElementType;
  roles:  NavRole[];
  end?:   boolean;
  badge?: 'urgent' | 'wa';
}

const SECTIONS: { section: string; roles: NavRole[]; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    roles:   ['frontdesk', 'manager', 'department'],
    items:   [
      { to: '/cases/new', label: 'New Case',  icon: PhoneIncoming, roles: ['frontdesk','manager'], end: true  },
      { to: '/follow-up', label: 'Follow-up', icon: ClipboardList, roles: ['frontdesk','manager'], badge: 'urgent' },
      { to: '/tasks',     label: 'My Tasks',  icon: CheckSquare,   roles: ['department'],          end: true  },
      { to: '/tasks',     label: 'All Tasks', icon: Layers,        roles: ['manager'],             end: true  },
    ],
  },
  {
    section: 'CRM',
    roles:   ['frontdesk', 'manager'],
    items:   [
      { to: '/organizations', label: 'Organizations', icon: Building2,     roles: ['frontdesk','manager'] },
      { to: '/contacts',      label: 'Contacts',      icon: Users,         roles: ['frontdesk','manager'] },
      { to: '/activities',    label: 'Activities',    icon: Calendar,    roles: ['frontdesk','manager'] },
    ],
  },
  {
    section: 'Channels',
    roles:   ['frontdesk', 'manager'],
    items:   [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['frontdesk','manager'], badge: 'wa' },
    ],
  },
  {
    section: 'Insights',
    roles:   ['manager'],
    items:   [
      { to: '/reports',   label: 'Reports',  icon: BarChart2, roles: ['manager']                        },
      { to: '/admin/kpi', label: 'My KPIs',   icon: Target,    roles: ['frontdesk','department','manager']  },
    ],
  },
  {
    section: 'Admin',
    roles:   ['manager'],
    items:   [
      { to: '/admin',             label: 'Overview',    icon: LayoutDashboard, roles: ['manager'], end: true },
      { to: '/admin/users',       label: 'Users',       icon: Users,           roles: ['manager']           },
      { to: '/admin/departments', label: 'Departments', icon: Building2,       roles: ['manager']           },
      { to: '/admin/categories',  label: 'Categories',  icon: Tag,             roles: ['manager']           },
      { to: '/admin/permissions', label: 'Authorities',  icon: Shield,          roles: ['manager']           },
      { to: '/admin/kpi',         label: 'KPI Targets',  icon: Target,          roles: ['manager']           },
    ],
  },
];

/* ─── Live urgent badge count ─────────────────────────────── */
const useUrgentCount = (role: string) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!['frontdesk', 'manager'].includes(role)) return;
    const load = async () => {
      const { count: c } = await supabase
        .from('cases').select('id', { count: 'exact', head: true })
        .eq('priority', 'urgent').neq('status', 'done');
      setCount(c ?? 0);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [role]);
  return count;
};

/* ─── Live WA unread count ────────────────────────────────── */
const useWaUnreadCount = (role: string) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!['frontdesk', 'manager'].includes(role)) return;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('wa_conversations').select('unread_count').gt('unread_count', 0);
      setCount((data ?? []).reduce((s: number, r: any) => s + (r.unread_count ?? 0), 0));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [role]);
  return count;
};

/* ─── AppLayout ───────────────────────────────────────────── */
export default function AppLayout() {
  const { profile, signOut } = useAuth();
  useIdleTimeout(true); // L5: auto sign-out after 60 min idle
  const navigate   = useNavigate();
  const location   = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const role       = profile?.role ?? '';
  const urgent     = useUrgentCount(role);
  const waUnread   = useWaUnreadCount(role);
  const initials   = (profile?.full_name ?? 'U')
    .split(' ').map((w: string) => w[0] ?? '').join('').toUpperCase().slice(0, 2);

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to);

  /* ── Single nav link ────────────────────────────────────── */
  const NavItem = ({ to, label, icon: Icon, end, badge }: NavItem) => {
    const active     = isActive(to, end);
    const badgeCount = badge === 'urgent' ? urgent : badge === 'wa' ? waUnread : 0;

    const link = (
      <NavLink
        to={to}
        end={end}
        className="relative flex items-center w-full rounded-sm transition-colors duration-100"
        style={{
          height:          40,
          gap:             collapsed ? 0 : 10,
          padding:         collapsed ? '0 8px' : '0 12px',
          justifyContent:  collapsed ? 'center' : 'flex-start',
          background:      active ? AH.ACTIVE : 'transparent',
          color:           active ? AH.WHITE  : AH.GRAY,
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = AH.DIM; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Active indicator bar */}
        {active && (
          <span style={{
            position: 'absolute', left: 0, top: '50%',
            transform: 'translateY(-50%)',
            width: 3, height: '55%',
            background: AH.RED,
            borderRadius: '0 2px 2px 0',
          }} />
        )}

        {/* Icon */}
        <Icon style={{
          width: 18, height: 18, flexShrink: 0,
          color: active ? AH.RED : AH.GRAY,
          transition: 'color 0.12s',
        }} />

        {/* Label */}
        {!collapsed && (
          <span style={{
            flex: 1,
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {label}
          </span>
        )}

        {/* Badge (expanded) */}
        {!collapsed && badgeCount > 0 && (
          <span style={{
            background: AH.RED, color: AH.WHITE,
            fontSize: 9, fontWeight: 700,
            borderRadius: 10, padding: '2px 5px', lineHeight: 1,
          }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}

        {/* Badge dot (collapsed) */}
        {collapsed && badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: 7, right: 7,
            width: 6, height: 6, borderRadius: '50%',
            background: AH.RED,
            border: `1.5px solid ${AH.DARK}`,
          }} />
        )}
      </NavLink>
    );

    return collapsed ? (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} style={{ fontFamily: "'Josefin Sans',sans-serif" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {label}
          </span>
          {badgeCount > 0 && <span style={{ marginLeft: 6, color: AH.RED, fontWeight: 700 }}>{badgeCount}</span>}
        </TooltipContent>
      </Tooltip>
    ) : link;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ═══════════════ SIDEBAR ════════════════════════════ */}
      <aside
        className="relative flex flex-col flex-shrink-0"
        style={{
          width:       collapsed ? 56 : 224,
          background:  AH.DARK,
          borderRight: `1px solid ${AH.BORDER}`,
          transition:  'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          zIndex:      10,
        }}
      >
        {/* ── Logo header ─────────────────────────────────── */}
        <div style={{
          height: 64, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding:        collapsed ? '0' : '0 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom:   `1px solid ${AH.BORDER}`,
        }}>
          {collapsed
            ? <AlhamraLogo size={26} variant="light" showText={false} />
            : <AlhamraLogo size={30} variant="light" showText />
          }
        </div>

        {/* ── Collapse / expand toggle ─────────────────────── */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: 'absolute', right: -12, top: 52, zIndex: 20,
            width: 24, height: 24, borderRadius: '50%',
            background: AH.RED, border: `2px solid ${AH.DARK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {collapsed
            ? <ChevronRight style={{ width: 12, height: 12, color: AH.WHITE }} />
            : <ChevronLeft  style={{ width: 12, height: 12, color: AH.WHITE }} />
          }
        </button>

        {/* ── Navigation sections ──────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto scrollbar-thin"
          style={{ paddingTop: 6, paddingBottom: 8 }}
        >
          {SECTIONS.map(({ section, roles: sRoles, items }) => {
            if (!sRoles.includes(role as NavRole)) return null;
            const visible = items.filter(i => i.roles.includes(role as NavRole));
            if (!visible.length) return null;

            return (
              <div key={section}>
                {/* Section label */}
                {collapsed ? (
                  <div style={{ height: 1, margin: '8px 10px', background: AH.BORDER }} />
                ) : (
                  <p style={{
                    margin: 0, padding: '12px 14px 4px',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                    color: AH.RED, opacity: 0.8,
                  }}>
                    {section}
                  </p>
                )}

                {/* Items */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: `0 ${collapsed ? 6 : 8}px`,
                }}>
                  {visible.map(item => (
                    <NavItem key={item.to + item.label} {...item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── User footer ──────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${AH.BORDER}`, flexShrink: 0 }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { signOut(); navigate('/login'); }}
                  style={{
                    width: '100%', height: 52, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = AH.DIM)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `${AH.RED}1E`, border: `1.5px solid ${AH.RED}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: AH.RED, letterSpacing: '0.05em',
                  }}>
                    {initials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <p style={{ fontWeight: 700, fontSize: 11 }}>{profile?.full_name}</p>
                <p style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                  {role} · click to sign out
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div style={{ padding: '8px 10px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#242421', borderRadius: 6, padding: '8px 10px',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: `${AH.RED}1E`, border: `1.5px solid ${AH.RED}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: AH.RED, letterSpacing: '0.05em',
                }}>
                  {initials}
                </div>

                {/* Name + role */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 11, fontWeight: 700,
                    color: AH.WHITE, letterSpacing: '0.08em',
                    textTransform: 'uppercase', lineHeight: 1.2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {profile?.full_name ?? 'User'}
                  </p>
                  <p style={{
                    margin: 0, fontSize: 9, color: AH.GRAY,
                    letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3,
                  }}>
                    {role}
                  </p>
                </div>

                {/* Sign out */}
                <button
                  onClick={() => { signOut(); navigate('/login'); }}
                  title="Sign out"
                  style={{
                    width: 28, height: 28, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, cursor: 'pointer',
                    color: AH.GRAY, background: 'transparent', transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget.style.background = AH.DIM);
                    (e.currentTarget.style.color = AH.WHITE);
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget.style.background = 'transparent');
                    (e.currentTarget.style.color = AH.GRAY);
                  }}
                >
                  <LogOut style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════════════ */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background flex flex-col">
        {/* Top bar: search + notifications */}
        <div className="sticky top-0 z-20 flex items-center justify-end gap-2 px-6 py-2.5 border-b bg-background/80 backdrop-blur-sm">
          <GlobalSearch />
          <NotificationBell />
        </div>
        <div className="page-enter flex-1 p-6 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
