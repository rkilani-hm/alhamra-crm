import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Permission, PermissionKey, Profile, Department, UserPermission, DeptPermission } from '@/types';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Shield, Users, Building2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  workspace: '📋 Workspace', crm: '🏢 CRM', channels: '💬 Channels',
  insights: '📊 Insights', admin: '⚙️ Admin',
};
const CATEGORY_ORDER = ['workspace','crm','channels','insights','admin'];

// ── Permission toggle row ──────────────────────────────────────
const PermRow = ({
  perm, granted, onToggle, loading, inherited,
}: { perm: Permission; granted: boolean; onToggle: (g: boolean) => void; loading?: boolean; inherited?: boolean }) => (
  <div className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-muted/20 transition-colors">
    <div className="flex-1 min-w-0 mr-4">
      <p className="text-sm font-medium flex items-center gap-2">
        {perm.label}
        {inherited && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">inherited</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>
    </div>
    <Switch checked={granted} onCheckedChange={onToggle} disabled={loading} />
  </div>
);

// ── Main component ────────────────────────────────────────────
const AdminPermissions = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'users' | 'departments'>('users');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORY_ORDER));

  // Load data
  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ['all-permissions'],
    queryFn: async () => { const { data } = await (supabase as any).from('permissions').select('*').order('category').order('label'); return data ?? []; },
  });

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => { const { data } = await supabase.from('profiles').select('*, departments(name)').order('full_name'); return (data ?? []) as unknown as Profile[]; },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => { const { data } = await supabase.from('departments').select('*').order('name'); return data ?? []; },
  });

  const { data: userPerms = [] } = useQuery<UserPermission[]>({
    queryKey: ['user-perms', selectedUser],
    enabled: !!selectedUser,
    queryFn: async () => { const { data } = await (supabase as any).from('user_permissions').select('*').eq('user_id', selectedUser); return data ?? []; },
  });

  const { data: deptPerms = [] } = useQuery<DeptPermission[]>({
    queryKey: ['dept-perms', selectedDept],
    enabled: !!selectedDept,
    queryFn: async () => { const { data } = await (supabase as any).from('department_permissions').select('*').eq('department_id', selectedDept); return data ?? []; },
  });

  // Get the selected user's dept perms (for "inherited" display)
  const selectedProfile = profiles.find(p => p.id === selectedUser);
  const { data: userDeptPerms = [] } = useQuery<DeptPermission[]>({
    queryKey: ['dept-perms', selectedProfile?.department_id],
    enabled: !!selectedProfile?.department_id,
    queryFn: async () => { const { data } = await (supabase as any).from('department_permissions').select('*').eq('department_id', selectedProfile!.department_id); return data ?? []; },
  });

  // Toggle permission
  const toggle = useMutation({
    mutationFn: async ({ type, id, permission, granted }: { type: 'user'|'dept'; id: string; permission: PermissionKey; granted: boolean }) => {
      const table = type === 'user' ? 'user_permissions' : 'department_permissions';
      const field  = type === 'user' ? 'user_id' : 'department_id';
      const { error } = await (supabase as any).from(table).upsert(
        { [field]: id, permission, granted },
        { onConflict: `${field},permission` }
      );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [vars.type === 'user' ? 'user-perms' : 'dept-perms'] });
      qc.invalidateQueries({ queryKey: ['my-permissions'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getUserPerm = (key: PermissionKey) => userPerms.find(p => p.permission === key);
  const getDeptPerm = (key: PermissionKey) => deptPerms.find(p => p.permission === key);
  const getUserDeptPerm = (key: PermissionKey) => userDeptPerms.find(p => p.permission === key);

  const isGrantedForUser = (key: PermissionKey): boolean => {
    const up = getUserPerm(key);
    if (up) return up.granted;
    const dp = getUserDeptPerm(key);
    if (dp) return dp.granted;
    // Frontdesk defaults
    if (selectedProfile?.role === 'frontdesk') {
      return ['can_create_cases','can_edit_cases','can_view_all_cases','can_create_contacts','can_edit_contacts','can_import_data','can_use_whatsapp','can_start_conversations'].includes(key);
    }
    return false;
  };

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    perms: permissions.filter(p => p.category === cat),
  }));

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          User Authorities
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Control what each user and department can access — user settings override department defaults
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border p-1 bg-muted/30 w-fit">
        {(['users','departments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'users' ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Left: selector list */}
        <div className="w-64 shrink-0">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tab === 'users' ? 'Select User' : 'Select Department'}
              </p>
            </div>
            <div className="divide-y max-h-[520px] overflow-y-auto scrollbar-thin">
              {tab === 'users' ? profiles.filter(p => p.role !== 'manager').map(p => (
                <button key={p.id} onClick={() => setSelectedUser(p.id)}
                  className={cn('flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
                    selectedUser === p.id ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/30 border-l-2 border-l-transparent')}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {(p.full_name ?? 'U').slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.full_name ?? 'Unnamed'}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {p.role.replace('_',' ')}
                      {(p.departments as any)?.name && ` · ${(p.departments as any).name}`}
                    </p>
                  </div>
                </button>
              )) : departments.map(d => (
                <button key={d.id} onClick={() => setSelectedDept(d.id)}
                  className={cn('flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
                    selectedDept === d.id ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/30 border-l-2 border-l-transparent')}>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{d.name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: permission matrix */}
        <div className="flex-1 min-w-0">
          {(!selectedUser && tab === 'users') || (!selectedDept && tab === 'departments') ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">
                Select a {tab === 'users' ? 'user' : 'department'} to manage their permissions
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tab === 'users' && selectedProfile && (
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    User-level settings override department defaults.
                    <strong> Toggles without a user override</strong> show the effective value from their department.
                  </span>
                </div>
              )}

              {grouped.map(({ cat, perms: catPerms }) => {
                if (catPerms.length === 0) return null;
                const expanded = expandedCats.has(cat);
                return (
                  <div key={cat} className="rounded-xl border bg-card overflow-hidden">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="flex items-center justify-between w-full px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-sm font-semibold">{CATEGORY_LABELS[cat] ?? cat}</span>
                      {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {expanded && catPerms.map(perm => {
                      const key = perm.key as PermissionKey;
                      if (tab === 'users' && selectedUser) {
                        const userOverride = getUserPerm(key);
                        const inherited = !userOverride;
                        const granted = isGrantedForUser(key);
                        return (
                          <PermRow key={key} perm={perm} granted={granted} inherited={inherited}
                            onToggle={g => toggle.mutate({ type: 'user', id: selectedUser, permission: key, granted: g })}
                            loading={toggle.isPending} />
                        );
                      } else if (tab === 'departments' && selectedDept) {
                        const dp = getDeptPerm(key);
                        const granted = dp?.granted ?? false;
                        return (
                          <PermRow key={key} perm={perm} granted={granted}
                            onToggle={g => toggle.mutate({ type: 'dept', id: selectedDept, permission: key, granted: g })}
                            loading={toggle.isPending} />
                        );
                      }
                      return null;
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPermissions;
