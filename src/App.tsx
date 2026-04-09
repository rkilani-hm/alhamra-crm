import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';

import Login           from '@/pages/Login';
import CaseNew         from '@/pages/CaseNew';
import Tasks           from '@/pages/Tasks';
import FollowUp        from '@/pages/FollowUp';
import WhatsAppInbox   from '@/pages/whatsapp/WhatsAppInbox';
import Reports         from '@/pages/reports/Reports';
import AdminOverview   from '@/pages/admin/AdminOverview';
import AdminUsers      from '@/pages/admin/AdminUsers';
import AdminDepartments from '@/pages/admin/AdminDepartments';
import AdminCategories from '@/pages/admin/AdminCategories';
import NotFound        from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner richColors position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* ── Public ──────────────────────────────────────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/"      element={<Navigate to="/login" replace />} />

            {/* ── Protected app ───────────────────────────────── */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

              {/* Front desk + manager */}
              <Route path="/cases/new"  element={<ProtectedRoute allowedRoles={['frontdesk','manager']}><CaseNew /></ProtectedRoute>} />
              <Route path="/cases"      element={<Navigate to="/follow-up" replace />} />
              <Route path="/follow-up"  element={<ProtectedRoute allowedRoles={['frontdesk','manager']}><FollowUp /></ProtectedRoute>} />
              <Route path="/whatsapp"   element={<ProtectedRoute allowedRoles={['frontdesk','manager']}><WhatsAppInbox /></ProtectedRoute>} />

              {/* All roles */}
              <Route path="/tasks"      element={<Tasks />} />

              {/* Manager */}
              <Route path="/reports"    element={<ProtectedRoute allowedRoles={['manager']}><Reports /></ProtectedRoute>} />
              <Route path="/admin"      element={<ProtectedRoute allowedRoles={['manager']}><AdminOverview /></ProtectedRoute>} />
              <Route path="/admin/users"       element={<ProtectedRoute allowedRoles={['manager']}><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={['manager']}><AdminDepartments /></ProtectedRoute>} />
              <Route path="/admin/categories"  element={<ProtectedRoute allowedRoles={['manager']}><AdminCategories /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
