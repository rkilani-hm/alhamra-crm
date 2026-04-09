import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import CaseNew from '@/pages/CaseNew';
import Cases from '@/pages/Cases';
import Tasks from '@/pages/Tasks';
import FollowUp from '@/pages/FollowUp';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30 } },
});

const RootRedirect = () => {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'department' ? '/tasks' : '/cases/new'} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<RootRedirect />} />
              <Route
                path="/cases/new"
                element={
                  <ProtectedRoute allowedRoles={['frontdesk', 'manager']}>
                    <CaseNew />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases"
                element={
                  <ProtectedRoute allowedRoles={['frontdesk', 'manager']}>
                    <Cases />
                  </ProtectedRoute>
                }
              />
              <Route path="/tasks" element={<Tasks />} />
              <Route
                path="/follow-up"
                element={
                  <ProtectedRoute allowedRoles={['frontdesk', 'manager']}>
                    <FollowUp />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
