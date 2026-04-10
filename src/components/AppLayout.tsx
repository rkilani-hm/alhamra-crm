import { useState } from 'react';
import { NavLink as RRNavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut,
  Layers, LayoutDashboard, Users, Building2, Tag,
  ChevronLeft, ChevronRight, MessageSquare, BarChart2,
  Bell, Settings,
} from 'lucide-react';

/* ─── Brand tokens ─────────────────────────────── */
const C = {
  bg:      '#1D1D1B',
  hover:   '#2A2A27',
  active:  '#242420',
  border:  '#2E2E2A',
  text:    '#B2B2B2',
  white:   '#FFFFFF',
  red:     '#CD1719',
  light:   '#EDEDED',
};

/* ─── Nav structure ────────────────────────────── */
const SECTIONS = [
  {
    key: 'workspace', label: 'Workspace',
    roles: ['frontdesk','manager','department'],
    items: [
      { to: '/cases/new',  label: 'New Case',    icon: PhoneIncoming, roles: ['frontdesk','manager'], accent: true },
      { to: '/follow-up',  label: 'Follow-up',   icon: ClipboardList, roles: ['frontdesk','manager'], badge: 'urgent' },
      { to: '/tasks',      label: 'My Tasks',    icon: CheckSquare,   roles: ['department'], end: true },
      { to: '/tasks',      label: 'All Tasks',   icon: Layers,        roles: ['manager'],    end: true },
    ],
  },
  {
    key: 'channels', label: 'Channels',
    roles: ['frontdesk','manager'],
    items: [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['frontdesk','manager'] },
    ],
  },
  {
    key: 'insights', label: 'Insights',
    roles: ['manager'],
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart2, roles: ['manager'] },
    ],
  },
  {
    key: 'admin', label: 'Admin',
    roles: ['manager'],
    items: [
      { to: '/admin',             label: 'Overview',    icon: LayoutDashboard, roles: ['manager'], end: true },
      { to: '/admin/users',       label: 'Users',       icon: Users,           roles: ['manager'] },
      { to: '/admin/departments', label: 'Departments', icon: Building2,       roles: ['manager'] },
      { to: '/admin/categories',  label: 'Categories',  icon: Tag,             roles: ['manager'] },
    ],
  },
];

const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const role = profile?.role ?? '';
  const initials = (profile?.full_name ?? 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  // Check if a route is active
  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to);

  const NavItem = ({ to, label, icon: Icon, end, accent }: any) => {
    const active = isActive(to, end);

    const inner = (
      <RRNavLink
        to={to}
        end={end}
        className={cn(
          'relative flex items-center rounded-md transition-all duration-150 group',
          collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5 mx-2',
          active ? 'text-white' : 'hover:text-white',
        )}
        style={{
          background: active ? C.active : 'transparent',
          color: active ? C.white : C.text,
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = C.hover; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Red left bar on active */}
        {active && <span className="nav-active-indicator" />}

        {/* Icon — always visible */}
        <Icon
          style={{
            width: 18, height: 18, flexShrink: 0,
            color: active ? C.red : C.text,
            transition: 'color 0.15s',
          }}
        />

        {/* Label — hidden when collapsed */}
        {!collapsed && (
          <span className="text-[13px] font-semibold tracking-wide uppercase flex-1 truncate"
            style={{ letterSpacing: '0.06em' }}>
            {label}
          </span>
        )}
      </RRNavLink>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <span className="font-semibold text-xs uppercase tracking-wide">{label}</span>
          </TooltipContent>
        </Tooltip>
      );
    }
    return inner;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className="relative flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? 60 : 232,
          background: C.bg,
          borderRight: `1px solid ${C.border}`,
        }}
      >
        {/* Logo header */}
        <div
          className="flex items-center border-b"
          style={{
            borderColor: C.border,
            minHeight: 64,
            padding: collapsed ? '0' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          {collapsed
            ? <AlhamraLogo size={28} variant="light" showText={false} />
            : <AlhamraLogo size={32} variant="light" showText />
          }
        </div>

        {/* Collapse toggle — red button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-[52px] z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110"
          style={{ background: C.red, border: `2px solid ${C.bg}` }}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
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
                  <p className="px-5 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: C.red, opacity: 0.85 }}>
                    {label}
                  </p>
                ) : (
                  <div className="mx-3 my-2 h-px" style={{ background: C.border }} />
                )}

                <div className={cn('flex flex-col', collapsed ? 'gap-1 items-center px-0' : 'gap-0.5')}>
                  {visible.map(item => (
                    <NavItem key={item.to + item.label} {...item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── User footer ─────────────────────── */}
        <div className="border-t" style={{ borderColor: C.border }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center py-4 transition-colors"
                  style={{ color: C.text }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: `${C.red}25`, color: C.red, border: `1px solid ${C.red}40` }}>
                    {initials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-semibold text-xs">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{role} · Sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="p-3">
              <div className="flex items-center gap-2.5 rounded-md px-2 py-2.5"
                style={{ background: '#242420' }}>
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: `${C.red}25`, color: C.red, border: `1px solid ${C.red}40` }}>
                  {initials}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate uppercase tracking-wide"
                    style={{ color: C.white, letterSpacing: '0.04em' }}>
                    {profile?.full_name ?? 'User'}
                  </p>
                  <p className="text-[10px] capitalize tracking-wider"
                    style={{ color: C.text }}>
                    {role}
                  </p>
                </div>
                {/* Sign out */}
                <button
                  onClick={handleSignOut}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  style={{ color: C.text }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.hover; (e.currentTarget as HTMLElement).style.color = C.white; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.text; }}
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ──────────────────────── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        <div className="page-enter min-h-full p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
