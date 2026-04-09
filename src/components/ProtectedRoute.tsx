import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Role } from '@/types';
import AlhamraLogo from '@/components/AlhamraLogo';

interface Props {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

const Spinner = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-4"
    style={{ background: 'hsl(var(--background))' }}
  >
    <AlhamraLogo size={38} variant="dark" showText />
    <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
    <p className="text-xs text-muted-foreground">Loading…</p>
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { user, profile, loading } = useAuth();

  // Always show spinner while auth is resolving
  if (loading) return <Spinner />;

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />;

  // Role check — only once profile is loaded
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'department' ? '/tasks' : '/cases/new'} replace />;
  }

  // Profile not yet loaded but user exists — show spinner briefly
  if (allowedRoles && !profile) return <Spinner />;

  return <>{children}</>;
};

export default ProtectedRoute;
