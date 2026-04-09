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
import Tasks from '@/pages/Tasks';
import FollowUp from '@/pages/FollowUp';
import AdminOverview from '@/pages/admin/AdminOverview';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminDepartments from '@/pages/admin/AdminDepartments';
import AdminCategories from '@/pages/admin/AdminCategories';
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
            <Route path="/" element={<Navigate to="/login" replace />} />

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
              <Route path="/cases" element={<Navigate to="/follow-up" replace />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route
                path="/follow-up"
                element={
                  <ProtectedRoute allowedRoles={['frontdesk', 'manager']}>
                    <FollowUp />
                  </ProtectedRoute>
                }
              />
              {/* Admin routes — manager only */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['manager']}>
                    <AdminOverview />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute allowedRoles={['manager']}>
                    <AdminUsers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/departments"
                element={
                  <ProtectedRoute allowedRoles={['manager']}>
                    <AdminDepartments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <ProtectedRoute allowedRoles={['manager']}>
                    <AdminCategories />
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
