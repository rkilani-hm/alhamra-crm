import { NavLink as RRNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AlhamraLogo from '@/components/AlhamraLogo';
import {
  PhoneIncoming, ClipboardList, CheckSquare, LogOut,
  Layers, LayoutDashboard, Users, Building2, Tag,
} from 'lucide-react';

const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isFrontdesk = profile?.role === 'frontdesk' || profile?.role === 'manager';
  const isManager = profile?.role === 'manager';
  const isDepartment = profile?.role === 'department';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'nav-active bg-[hsl(213_50%_16%)] text-white'
        : 'text-[hsl(213_20%_65%)] hover:text-[hsl(213_20%_85%)] hover:bg-[hsl(213_50%_14%)]'
    );

  const sectionLabel = "text-[10px] uppercase tracking-widest text-brand-bronze font-semibold px-4 mb-1 mt-4";

  const initials = profile?.full_name
    ?.split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="sidebar-texture flex w-56 flex-col bg-[hsl(var(--sidebar-background))] px-0 py-4">
        <div className="mb-6 px-4">
          <AlhamraLogo size={36} variant="light" showText />
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 scrollbar-thin overflow-y-auto">
          {/* Workspace section */}
          {(isFrontdesk || isDepartment) && (
            <>
              <p className={sectionLabel}>Workspace</p>
              {isFrontdesk && (
                <>
                  <RRNavLink to="/cases/new" className={navClass}>
                    <PhoneIncoming className="h-4 w-4" /> New Case
                  </RRNavLink>
                  <RRNavLink to="/follow-up" className={navClass}>
                    <ClipboardList className="h-4 w-4" /> Follow-up
                  </RRNavLink>
                </>
              )}
              {isDepartment && (
                <RRNavLink to="/tasks" className={navClass}>
                  <CheckSquare className="h-4 w-4" /> My Tasks
                </RRNavLink>
              )}
              {isManager && (
                <RRNavLink to="/tasks" className={navClass}>
                  <Layers className="h-4 w-4" /> All Tasks
                </RRNavLink>
              )}
            </>
          )}

          {/* Admin section — manager only */}
          {isManager && (
            <>
              <p className={cn(sectionLabel, 'mt-6')}>Admin</p>
              <RRNavLink to="/admin" end className={navClass}>
                <LayoutDashboard className="h-4 w-4" /> Overview
              </RRNavLink>
              <RRNavLink to="/admin/users" className={navClass}>
                <Users className="h-4 w-4" /> Users
              </RRNavLink>
              <RRNavLink to="/admin/departments" className={navClass}>
                <Building2 className="h-4 w-4" /> Departments
              </RRNavLink>
              <RRNavLink to="/admin/categories" className={navClass}>
                <Tag className="h-4 w-4" /> Categories
              </RRNavLink>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-[hsl(213_50%_16%)] pt-3 px-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-bronze/20 text-brand-bronze text-xs font-semibold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-white">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="text-[10px] capitalize text-[hsl(213_20%_55%)]">
                {profile?.role}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[hsl(213_20%_55%)] hover:text-white hover:bg-[hsl(213_50%_14%)]"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8 scrollbar-thin">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
