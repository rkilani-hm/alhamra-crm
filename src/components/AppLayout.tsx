import { useState } from 'react';
import { NavLink as RRNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut,
  LayoutDashboard, Users, Building2, Tag, MessageSquare,
  BarChart2, ChevronLeft, ChevronRight, Layers,
} from 'lucide-react';

/* ── Brand constants ─────────────────────────────────────── */
const RED   = '#CD1719';
const BLACK = '#1D1D1B';
const MUTED = 'rgba(178,178,178,0.75)';
const HOVER = 'rgba(205,23,25,0.10)';
const ACTIVE_BG = 'rgba(205,23,25,0.14)';

/* ── Nav structure ───────────────────────────────────────── */
const SECTIONS = [
  {
    key: 'workspace', label: 'Workspace',
    roles: ['frontdesk','manager','department'],
    items: [
      { to: '/cases/new', label: 'New Case',   icon: PhoneIncoming, roles: ['frontdesk','manager'], end: true },
      { to: '/follow-up', label: 'Follow-up',  icon: ClipboardList, roles: ['frontdesk','manager'] },
      { to: '/tasks',     label: 'My Tasks',   icon: CheckSquare,   roles: ['department'], end: true },
      { to: '/tasks',     label: 'All Tasks',  icon: Layers,        roles: ['manager'],    end: true },
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
      { to: '/admin',              label: 'Overview',    icon: LayoutDashboard, roles: ['manager'], end: true },
      { to: '/admin/users',        label: 'Users',       icon: Users,           roles: ['manager'] },
      { to: '/admin/departments',  label: 'Departments', icon: Building2,       roles: ['manager'] },
      { to: '/admin/categories',   label: 'Categories',  icon: Tag,             roles: ['manager'] },
    ],
  },
];

const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const role = profile?.role ?? '';

  const initials = (profile?.full_name ?? 'U')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  /* ── Nav item builder ──────────────────────────────────── */
  const NavItem = ({ to, label, icon: Icon, end }: any) => {
    const inner = ({ isActive }: { isActive: boolean }) => (
      <span
        className={cn(
          'relative flex items-center rounded-lg transition-all duration-150',
          collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5 mx-2',
        )}
        style={{
          background: isActive ? ACTIVE_BG : 'transparent',
          color: isActive ? RED : MUTED,
          ...(isActive ? { boxShadow: `inset 3px 0 0 ${RED}` } : {}),
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = HOVER; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
            style={{ height: '60%', background: RED }} />
        )}
        <Icon style={{ width: 17, height: 17, flexShrink: 0, color: isActive ? RED : MUTED }} />
        {!collapsed && (
          <span className="text-sm font-600 truncate" style={{ color: isActive ? '#fff' : MUTED, fontWeight: isActive ? 700 : 400 }}>
            {label}
          </span>
        )}
      </span>
    );

    const link = (
      <RRNavLink to={to} end={end} className={() => 'block'}>
        {inner}
      </RRNavLink>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            <span className="text-xs font-semibold">{label}</span>
          </TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside
        className="sidebar-texture relative flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? 64 : 232,
          background: BLACK,
          borderRight: `1px solid rgba(255,255,255,0.06)`,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center border-b transition-all duration-300"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            minHeight: 64,
            padding: collapsed ? '0' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          {collapsed
            ? (
              /* Collapsed: just the red tower */
              <svg width="22" height="38" viewBox="0 0 26 50" fill="none">
                <path d="M13 0 L13.8 5 L12.2 5 Z" fill={RED} />
                <path d="M10 5 L16 5 L17 10 L17 48 L9 48 L9 10 Z" fill="white" opacity="0.9" />
                <path d="M9 16 L9 40 L12.5 40 L12.5 36 L11.5 34 L11.5 22 L12.5 20 L12.5 16 Z" fill={BLACK} opacity="0.5" />
              </svg>
            )
            : <AlhamraLogo size={34} variant="light" showText />
          }
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-[50px] z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-colors hover:opacity-90"
          style={{ background: RED, border: `2px solid ${BLACK}` }}
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3 text-white" />
            : <ChevronLeft  className="h-3 w-3 text-white" />
          }
        </button>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 space-y-1">
          {SECTIONS.map(({ key, label, roles: sRoles, items }) => {
            if (!sRoles.includes(role)) return null;
            const visible = items.filter(i => i.roles.includes(role));
            if (!visible.length) return null;

            return (
              <div key={key}>
                {/* Section label */}
                {!collapsed ? (
                  <p className="px-5 pt-4 pb-1 text-[9px] uppercase tracking-[0.2em] font-bold"
                    style={{ color: RED, opacity: 0.7 }}>
                    {label}
                  </p>
                ) : (
                  key !== SECTIONS[0].key && (
                    <div className="mx-4 my-2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  )
                )}

                <div className="flex flex-col gap-0.5">
                  {visible.map(item => (
                    <NavItem key={item.to + item.label} {...item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t pb-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center py-3 transition-colors"
                  style={{ color: MUTED }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
                >
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ background: `${RED}25`, color: RED }}>
                    {initials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                <p className="font-semibold text-xs">{profile?.full_name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{role} · Sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="mx-3 mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: `${RED}25`, color: RED }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate text-white">
                    {profile?.full_name ?? 'User'}
                  </p>
                  <p className="text-[10px] capitalize" style={{ color: MUTED }}>
                    {role === 'frontdesk' ? 'Front Desk' : role}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: MUTED }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.background = HOVER; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        <div className="page-enter min-h-full p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
