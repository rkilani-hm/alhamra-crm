import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Role } from '@/types';

interface Props {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

// Shown only on the very first cold load while auth is resolving
const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { user, profile, loading } = useAuth();

  // Cold-start: wait for getSession() to resolve
  if (loading) return <LoadingScreen />;

  // Not authenticated
  if (!user) return <Navigate to="/login" replace />;

  // Role guard — wait for profile if we need it
  if (allowedRoles) {
    if (!profile) return <LoadingScreen />;
    if (!allowedRoles.includes(profile.role)) {
      const fallback = profile.role === 'department' ? '/tasks'
                     : profile.role === 'manager'    ? '/admin'
                     : '/cases/new';
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
