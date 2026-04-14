// usePermissions — resolves effective permissions for the current user.
// Managers have ALL permissions implicitly.
// Other roles: union of dept permissions + user overrides (user wins).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionKey } from '@/types';

interface PermRow { permission: PermissionKey; granted: boolean }

export const usePermissions = () => {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const { data: perms = [], isLoading } = useQuery<PermRow[]>({
    queryKey: ['my-permissions', profile?.id],
    enabled:  !!profile?.id && !isManager,
    staleTime: 60_000,
    queryFn: async () => {
      // Permissions tables not yet created; return empty to use hardcoded defaults
      return [] as PermRow[];
    },
  });

  const can = (key: PermissionKey): boolean => {
    // Managers bypass all permission checks
    if (isManager) return true;
    // Front desk: full workspace + CRM + WhatsApp by default (unless explicitly denied)
    if (profile?.role === 'frontdesk') {
      const FRONTDESK_DEFAULT: PermissionKey[] = [
        'can_create_cases','can_edit_cases','can_view_all_cases',
        'can_create_contacts','can_edit_contacts','can_import_data',
        'can_use_whatsapp','can_start_conversations',
      ];
      const override = perms.find(p => p.permission === key);
      if (override) return override.granted;
      return FRONTDESK_DEFAULT.includes(key);
    }
    // Department staff: only what's explicitly granted
    const found = perms.find(p => p.permission === key);
    return found?.granted ?? false;
  };

  return { can, isLoading, isManager };
};

export default usePermissions;
