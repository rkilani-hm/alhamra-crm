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

const safeDefaultProfile = (userId: string): Profile =>
  ({ id: userId, full_name: null, role: 'frontdesk', department_id: null, created_at: null } as unknown as Profile);

async function loadProfile(userId: string): Promise<Profile> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error:', error.message);
      // Try without join
      const { data: simple } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (simple) return simple as unknown as Profile;
      return safeDefaultProfile(userId);
    }

    if (data) return data as unknown as Profile;

    // Profile doesn't exist — create it
    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert({ id: userId, role: 'frontdesk' })
      .select('*, departments(name)')
      .maybeSingle();

    if (insertErr) {
      console.error('Profile insert error:', insertErr.message);
      return safeDefaultProfile(userId);
    }

    return (created as unknown as Profile) ?? safeDefaultProfile(userId);
  } catch (err) {
    console.error('Profile load exception:', err);
    return safeDefaultProfile(userId);
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user,    setUser]    = useState<User    | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile whenever user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    loadProfile(user.id).then(p => {
      if (!cancelled) setProfile(p);
    }).catch(err => {
      console.error('Failed to load profile:', err);
    });

    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    // Safety timeout
    const timeout = setTimeout(() => {
      console.warn('Auth init timed out — clearing loading state');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(timeout);
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    }).catch((err) => {
      clearTimeout(timeout);
      console.error('getSession failed:', err);
      setLoading(false);
    });

    // ── onAuthStateChange handles SUBSEQUENT transitions only ──
    // It NEVER touches loading — that prevents all flashes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );

    return () => {
      clearTimeout(timeout);
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
