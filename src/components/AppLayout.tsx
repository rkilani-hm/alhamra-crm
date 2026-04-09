import { useState, useEffect } from 'react';
import { NavLink as RRNavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut, Layers,
  LayoutDashboard, Users, Building2, Tag, ChevronLeft, ChevronRight,
  AlertCircle, MessageSquare, BarChart2, Settings, Bell,
} from 'lucide-react';

/* ─── Brand tokens ─────────────────────────────────────────── */
const S = {
  bg:     'hsl(213,58%,9%)',
  border: 'hsl(213,50%,14%)',
  hover:  'hsl(213,50%,14%)',
  active: 'hsl(213,50%,18%)',
  muted:  'hsl(213,20%,52%)',
  text:   'hsl(213,15%,78%)',
  white:  '#fff',
  bronze: 'hsl(38,55%,62%)',
  bronzeAlpha: 'hsl(38,55%,62%,0.18)',
};

/* ─── Nav structure ─────────────────────────────────────────── */
const SECTIONS = [
  {
    key: 'workspace',
    label: 'Workspace',
    roles: ['frontdesk','manager','department'],
    items: [
      {
        to: '/cases/new', label: 'New Case', icon: PhoneIncoming,
        roles: ['frontdesk','manager'], badge: null, accent: true,
      },
      {
        to: '/follow-up', label: 'Follow-up', icon: ClipboardList,
        roles: ['frontdesk','manager'], badge: 'urgent', end: false,
      },
      {
        to: '/tasks', label: 'My Tasks', icon: CheckSquare,
        roles: ['department'], badge: 'open', end: true,
      },
      {
        to: '/tasks', label: 'All Tasks', icon: Layers,
        roles: ['manager'], badge: 'open', end: true,
      },
    ],
  },
  {
    key: 'channels',
    label: 'Channels',
    roles: ['frontdesk','manager'],
    items: [
      {
        to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare,
        roles: ['frontdesk','manager'], badge: null, soon: true,
      },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    roles: ['manager'],
    items: [
      {
        to: '/reports', label: 'Reports', icon: BarChart2,
        roles: ['manager'], badge: null, soon: true,
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    roles: ['manager'],
    items: [
      { to: '/admin',             label: 'Overview',    icon: LayoutDashboard, roles: ['manager'], end: true },
      { to: '/admin/users',       label: 'Users',       icon: Users,           roles: ['manager'] },
      { to: '/admin/departments', label: 'Departments', icon: Building2,       roles: ['manager'] },
      { to: '/admin/categories',  label: 'Categories',  icon: Tag,             roles: ['manager'] },
    ],
  },
];

/* ─── Component ─────────────────────────────────────────────── */
const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [counts, setCounts]       = useState({ urgent: 0, open: 0 });
  const role = profile?.role ?? '';

  const initials = profile?.full_name
    ?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '??';

  /* Live badge counts */
  useEffect(() => {
    const fetchCounts = async () => {
      const [urgentRes, openRes] = await Promise.all([
        supabase.from('cases').select('id', { count: 'exact', head: true })
          .eq('priority','urgent').neq('status','done'),
        supabase.from('cases').select('id', { count: 'exact', head: true })
          .neq('status','done'),
      ]);
      setCounts({ urgent: urgentRes.count ?? 0, open: openRes.count ?? 0 });
    };
    if (profile) { fetchCounts(); const t = setInterval(fetchCounts, 60_000); return () => clearInterval(t); }
  }, [profile]);

  const getBadgeCount = (badge: string | null | undefined) => {
    if (badge === 'urgent') return counts.urgent;
    if (badge === 'open')   return counts.open;
    return 0;
  };

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  /* Nav item class */
  const navCls = (isActive: boolean, accent = false) => cn(
    'relative flex items-center rounded-lg transition-all duration-150 select-none',
    collapsed ? 'justify-center py-2.5 mx-1.5' : 'gap-3 px-3 py-2.5 mx-2',
    isActive
      ? 'text-white font-medium'
      : accent
        ? 'font-medium'
        : 'font-normal',
  );

  const navStyle = (isActive: boolean, accent = false): React.CSSProperties => ({
    background: isActive
      ? S.active
      : 'transparent',
    color: isActive ? S.white : accent ? S.bronze : S.text,
    ...(isActive ? { boxShadow: `inset 3px 0 0 ${S.bronze}` } : {}),
  });

  /* Reusable nav item */
  const NavItem = ({ to, label, icon: Icon, end, badge, accent, soon }: any) => {
    const count = getBadgeCount(badge);
    const isActive = end
      ? location.pathname === to
      : location.pathname.startsWith(to);

    const inner = (
      <RRNavLink
        to={soon ? '#' : to}
        end={end}
        onClick={soon ? (e) => e.preventDefault() : undefined}
        className={() => navCls(isActive, accent)}
        style={() => navStyle(isActive, accent)}
      >
        {/* Active left bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
            style={{ height: '60%', background: S.bronze }} />
        )}

        <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />

        {!collapsed && (
          <>
            <span className="flex-1 text-sm truncate">{label}</span>

            {/* Coming soon pill */}
            {soon && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: 'hsl(213,50%,20%)', color: S.muted }}>
                Soon
              </span>
            )}

            {/* Live count badge */}
            {!soon && count > 0 && (
              <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1"
                style={{
                  background: badge === 'urgent' ? 'hsl(0,72%,51%)' : S.bronze,
                  color: '#fff',
                }}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </>
        )}
      </RRNavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={to + label} delayDuration={0}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <span className="font-medium">{label}</span>
            {soon && <span className="ml-1 text-muted-foreground">· Soon</span>}
            {!soon && count > 0 && (
              <span className="ml-1.5 font-bold" style={{ color: badge === 'urgent' ? 'hsl(0,72%,51%)' : S.bronze }}>
                {count}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }
    return inner;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className="sidebar-texture relative flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: collapsed ? 60 : 232, background: S.bg, borderRight: `1px solid ${S.border}` }}
      >

        {/* Logo header */}
        <div
          className="flex items-center border-b transition-all duration-300"
          style={{
            borderColor: S.border,
            padding: collapsed ? '18px 0' : '18px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            minHeight: 64,
          }}
        >
          {collapsed
            ? <AlhamraLogo size={26} variant="light" showText={false} />
            : <AlhamraLogo size={30} variant="light" showText />
          }
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-[52px] z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-lg transition-opacity hover:opacity-90"
          style={{ background: S.bronze, border: `2px solid ${S.bg}` }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3 text-white" />
            : <ChevronLeft  className="h-3 w-3 text-white" />
          }
        </button>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {SECTIONS.map(({ key, label, roles: sRoles, items }) => {
            if (!sRoles.includes(role)) return null;
            const visible = items.filter(i => i.roles.includes(role));
            if (!visible.length) return null;

            return (
              <div key={key} className="mb-1">
                {/* Section label */}
                {!collapsed ? (
                  <p className="px-5 pt-4 pb-1.5 text-[9px] uppercase tracking-[0.16em] font-bold"
                    style={{ color: S.bronze, opacity: 0.75 }}>
                    {label}
                  </p>
                ) : (
                  <div className="mx-3 my-2 h-px" style={{ background: S.border }} />
                )}

                {/* Items */}
                <div className="flex flex-col gap-0.5">
                  {visible.map(item => (
                    <NavItem key={item.to + item.label} {...item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── User footer ──────────────────────────────────────── */}
        <div className="border-t" style={{ borderColor: S.border }}>

          {/* Notification row — expanded only */}
          {!collapsed && (
            <div className="flex items-center gap-1 px-3 pt-2 pb-1">
              <button
                className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[hsl(213,50%,14%)]"
                style={{ color: S.muted }}
                title="Notifications"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Notifications</span>
              </button>
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[hsl(213,50%,14%)]"
                style={{ color: S.muted }}
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Profile row */}
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex w-full flex-col items-center gap-1 py-3 transition-colors hover:bg-[hsl(213,50%,14%)]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: `${S.bronze}30`, color: S.bronze }}>
                    {initials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{profile?.full_name}</p>
                <p className="text-xs capitalize text-muted-foreground">{role} · Click to sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="px-3 py-3">
              <div className="flex items-center gap-2.5 rounded-xl p-2"
                style={{ background: 'hsl(213,50%,12%)' }}>
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: `${S.bronze}30`, color: S.bronze }}>
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-medium" style={{ color: S.white }}>
                    {profile?.full_name ?? 'User'}
                  </p>
                  <p className="text-[10px] capitalize" style={{ color: S.muted }}>
                    {role === 'frontdesk' ? 'Front Desk' : role}
                  </p>
                </div>

                {/* Sign out */}
                <button
                  onClick={handleSignOut}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(213,50%,22%)]"
                  style={{ color: S.muted }}
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        <div className="page-enter min-h-full p-8">
          <Outlet />
        </div>
      </main>

    </div>
  );
};

export default AppLayout;
