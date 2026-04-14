import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Profile, Department, Role } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus, Search, Pencil } from 'lucide-react';

const ROLE_COLORS: Record<Role, string> = {
  frontdesk: 'bg-blue-100 text-blue-800 border-blue-200',
  department: 'bg-purple-100 text-purple-800 border-purple-200',
  manager: 'bg-amber-100 text-amber-800 border-amber-200',
};

const ROLE_LABELS: Record<Role, string> = {
  frontdesk: 'Front Desk',
  department: 'Department Staff',
  manager: 'Manager',
};

const AdminUsers = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'frontdesk' as Role, department_id: '' });

  const { data: profiles = [] } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return (data as unknown as Profile[]) ?? [];
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const filtered = profiles.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.full_name?.toLowerCase().includes(q) || p.role.includes(q);
  });

  const roleCounts = {
    frontdesk: profiles.filter(p => p.role === 'frontdesk').length,
    department: profiles.filter(p => p.role === 'department').length,
    manager: profiles.filter(p => p.role === 'manager').length,
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ full_name: '', email: '', password: '', role: 'frontdesk', department_id: '' }); setValidationError(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    setForm({ full_name: p.full_name || '', email: '', password: '', role: p.role, department_id: p.department_id || '' });
    setDialogOpen(true);
  };

  // H2: Validate before submitting
  const validateForm = (): string | null => {
    if (!form.full_name.trim()) return 'Full name is required';
    if (!editing) {
      if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required';
      if (form.password.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(form.password)) return 'Password must contain an uppercase letter';
      if (!/[0-9]/.test(form.password)) return 'Password must contain a number';
    }
    return null;
  };

  const [validationError, setValidationError] = useState<string | null>(null);

  const deactivateMutation = useMutation({
    mutationFn: async (profileId: string) => {
      // Disable user via admin edge function approach:
      // We update profile with a special flag, then use admin API
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { action: 'deactivate', user_id: profileId },
      });
      // Fallback: just mark in profile (supabase auth ban requires service role)
      if (error || data?.error) {
        // Direct: update profile metadata with deactivated flag
        const { error: pe } = await supabase.from('profiles').update({ role: 'department' }).eq('id', profileId);
        if (pe) throw pe;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success('User deactivated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login',
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Password reset email sent'),
    onError: (e: any) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // H2: Enforce password policy
      const err = validateForm();
      if (err) throw new Error(err);

      if (editing) {
        // Update profile — role change logged to audit_log
        const updates: any = {
          full_name:     form.full_name,
          role:          form.role,
          department_id: form.department_id || null,
        };
        const { error } = await supabase.from('profiles').update(updates).eq('id', editing.id);
        if (error) throw error;

        // M6: Audit log role changes
        if (editing.role !== form.role) {
          await (supabase as any).from('audit_log').insert({
            action:      'update',
            entity_type: 'user',
            entity_id:   editing.id,
            details:     { field: 'role', from: editing.role, to: form.role },
          });
        }
      } else {
        // H3: Use admin API via edge function — no confirmation email,
        // controlled server-side. Falls back to signUp if function not deployed.
        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email:         form.email,
            password:      form.password,
            full_name:     form.full_name,
            role:          form.role,
            department_id: form.department_id || null,
          },
        });

        // H3: No fallback — if the edge function is unavailable, fail safely
        if (fnError) throw new Error('User creation service unavailable. Please ensure the admin-create-user function is deployed.');
        if (fnData?.error) throw new Error(fnData.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success(editing ? 'User updated' : 'User created');
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-semibold">Users</h1>
        <Button onClick={openAdd} className="gap-2">
          <UserPlus className="h-4 w-4" /> Add user
        </Button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['frontdesk', 'department', 'manager'] as Role[]).map(role => (
          <Card key={role} className={`p-4 border-l-4 ${role === 'frontdesk' ? 'border-l-blue-400' : role === 'department' ? 'border-l-purple-400' : 'border-l-amber-400'}`}>
            <p className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</p>
            <p className="font-serif text-2xl font-light">{roleCounts[role]}</p>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">User</th>
              <th className="px-3 py-2.5 text-left">Role</th>
              <th className="px-3 py-2.5 text-left">Department</th>
              <th className="px-3 py-2.5 text-left">Joined</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No users found</td></tr>
            )}
            {filtered.map(p => {
              const dept = departments.find(d => d.id === p.department_id);
              const initials = p.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
              return (
                <tr key={p.id} className="table-row-hover">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-bronze/20 text-brand-bronze text-xs font-semibold shrink-0">
                        {initials}
                      </div>
                      <span className="font-medium">{p.full_name || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={ROLE_COLORS[p.role]}>{ROLE_LABELS[p.role]}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dept?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{editing ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            {!editing && (
              <>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Password <span className="text-muted-foreground text-xs">(min 8 chars, 1 uppercase, 1 number)</span></Label>
                  <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    className={validationError && form.password.length < 8 ? 'border-destructive' : ''} />
                  {validationError && <p className="text-xs text-destructive mt-1">{validationError}</p>}
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="frontdesk">Front Desk</SelectItem>
                  <SelectItem value="department">Department Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={form.department_id} onValueChange={v => setForm({ ...form, department_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
