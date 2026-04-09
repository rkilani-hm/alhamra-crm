import { useState } from 'react';
import { NavLink as RRNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut,
  Layers, LayoutDashboard, Users, Building2, Tag,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const NAV_ITEMS = [
  {
    section: 'Workspace',
    items: [
      { to: '/cases/new', label: 'New Case',   icon: PhoneIncoming, roles: ['frontdesk','manager'] },
      { to: '/follow-up', label: 'Follow-up',  icon: ClipboardList, roles: ['frontdesk','manager'] },
      { to: '/tasks',     label: 'My Tasks',   icon: CheckSquare,   roles: ['department'],          end: true },
      { to: '/tasks',     label: 'All Tasks',  icon: Layers,        roles: ['manager'],             end: true },
    ],
  },
  {
    section: 'Admin',
    items: [
      { to: '/admin',             label: 'Overview',    icon: LayoutDashboard, roles: ['manager'], end: true },
      { to: '/admin/users',       label: 'Users',       icon: Users,           roles: ['manager'] },
      { to: '/admin/departments', label: 'Departments', icon: Building2,       roles: ['manager'] },
      { to: '/admin/categories',  label: 'Categories',  icon: Tag,             roles: ['manager'] },
    ],
  },
];

const SIDEBAR_BG     = 'hsl(213, 58%, 9%)';
const SIDEBAR_ACCENT = 'hsl(213, 50%, 16%)';
const SIDEBAR_MUTED  = 'hsl(213, 20%, 55%)';
const SIDEBAR_TEXT   = 'hsl(213, 20%, 75%)';
const BRONZE         = 'hsl(38, 55%, 62%)';

const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const role = profile?.role ?? '';
  const initials = profile?.full_name
    ?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '??';

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative flex items-center rounded-lg transition-all duration-150 group',
      collapsed ? 'justify-center px-0 py-2.5 mx-2' : 'gap-3 px-3 py-2.5 mx-2',
      isActive
        ? 'nav-active bg-[hsl(213,50%,16%)] text-white'
        : 'text-[hsl(213,20%,65%)] hover:text-white hover:bg-[hsl(213,50%,14%)]'
    );

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Sidebar */}
      <aside
        className="sidebar-texture relative flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? 64 : 224,
          background: SIDEBAR_BG,
          borderRight: `1px solid ${SIDEBAR_ACCENT}`,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center border-b py-5 transition-all duration-300"
          style={{
            borderColor: SIDEBAR_ACCENT,
            padding: collapsed ? '20px 0' : '20px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          {collapsed
            ? <AlhamraLogo size={28} variant="light" showText={false} />
            : <AlhamraLogo size={32} variant="light" showText={true} />
          }
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-md transition-colors hover:opacity-90"
          style={{ background: BRONZE, borderColor: BRONZE }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-white" />
            : <ChevronLeft  className="h-3.5 w-3.5 text-white" />
          }
        </button>

        {/* Nav */}
        <nav className="flex flex-col flex-1 gap-0.5 overflow-y-auto scrollbar-thin py-3">
          {NAV_ITEMS.map(({ section, items }) => {
            const visible = items.filter(i => i.roles.includes(role));
            if (!visible.length) return null;
            return (
              <div key={section}>
                {/* Section label — hidden when collapsed */}
                {!collapsed && (
                  <p
                    className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest font-semibold"
                    style={{ color: BRONZE }}
                  >
                    {section}
                  </p>
                )}
                {collapsed && <div className="my-2 mx-3 h-px" style={{ background: SIDEBAR_ACCENT }} />}

                {visible.map(({ to, label, icon: Icon, end }) =>
                  collapsed ? (
                    <Tooltip key={to + label} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <RRNavLink to={to} end={end} className={navCls}>
                          <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                        </RRNavLink>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <RRNavLink key={to + label} to={to} end={end} className={navCls}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium truncate">{label}</span>
                    </RRNavLink>
                  )
                )}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div
          className="border-t py-3 transition-all duration-300"
          style={{
            borderColor: SIDEBAR_ACCENT,
            padding: collapsed ? '12px 0' : '12px 12px',
          }}
        >
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center rounded-lg py-2 transition-colors hover:bg-[hsl(213,50%,14%)]"
                  title="Sign out"
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: `${BRONZE}33`, color: BRONZE }}
                  >
                    {initials}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {profile?.full_name} · Sign out
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-1 mb-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ background: `${BRONZE}33`, color: BRONZE }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-white">{profile?.full_name ?? 'User'}</p>
                  <p className="text-[10px] capitalize" style={{ color: SIDEBAR_MUTED }}>{role}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[hsl(213,50%,14%)] hover:text-white"
                style={{ color: SIDEBAR_MUTED }}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="page-enter min-h-full p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
