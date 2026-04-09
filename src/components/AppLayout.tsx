import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PhoneIncoming, Users, ClipboardList, CheckSquare, LogOut, BarChart2,
} from 'lucide-react';

const AppLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isFrontdesk = profile?.role === 'frontdesk' || profile?.role === 'manager';
  const isDepartment = profile?.role === 'department';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-card px-3 py-4">
        <div className="mb-6 px-3">
          <h1 className="text-lg font-bold tracking-tight">Alhamra CRM</h1>
          <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {isFrontdesk && (
            <>
              <NavLink to="/cases/new" className={navClass}>
                <PhoneIncoming className="h-4 w-4" /> New Case
              </NavLink>
              <NavLink to="/cases" className={navClass}>
                <Users className="h-4 w-4" /> All Cases
              </NavLink>
              <NavLink to="/follow-up" className={navClass}>
                <ClipboardList className="h-4 w-4" /> Follow-up
              </NavLink>
            </>
          )}
          {isDepartment && (
            <NavLink to="/tasks" className={navClass}>
              <CheckSquare className="h-4 w-4" /> My Tasks
            </NavLink>
          )}
          {profile?.role === 'manager' && (
            <NavLink to="/tasks" className={navClass}>
              <BarChart2 className="h-4 w-4" /> All Tasks
            </NavLink>
          )}
        </nav>

        <div className="border-t pt-3">
          <p className="truncate px-3 text-xs font-medium text-foreground mb-1">
            {profile?.full_name ?? 'User'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
