import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

interface AuthContextType {
  user:    User    | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, profile: null, loading: true,
  signOut: async () => {},
});

async function loadProfile(userId: string): Promise<Profile | null> {
  // Try to fetch existing profile
  const { data } = await supabase
    .from('profiles')
    .select('*, departments(name)')
    .eq('id', userId)
    .maybeSingle();

  if (data) return data as unknown as Profile;

  // Profile doesn't exist (trigger may not have fired) — create it
  const { data: created } = await supabase
    .from('profiles')
    .insert({ id: userId, role: 'frontdesk' })
    .select('*, departments(name)')
    .maybeSingle();

  return created as unknown as Profile | null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user,    setUser]    = useState<User    | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // ── ONLY getSession() drives the initial loading state ──
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        try {
          const p = await loadProfile(s.user.id);
          if (!cancelled) setProfile(p);
        } catch (err) {
          console.error('Failed to load profile:', err);
        }
      }
      if (!cancelled) setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // ── onAuthStateChange handles SUBSEQUENT transitions only ──
    // It NEVER touches loading — that prevents all flashes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (cancelled) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (event === 'SIGNED_IN' && s?.user) {
          try {
            const p = await loadProfile(s.user.id);
            if (!cancelled) setProfile(p);
          } catch (err) {
            console.error('Failed to load profile on sign-in:', err);
          }
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
        // TOKEN_REFRESHED / USER_UPDATED — state already correct, no action needed
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
