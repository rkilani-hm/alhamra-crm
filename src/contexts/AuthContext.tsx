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

// ── L5: Idle session timeout (30 minutes of inactivity) ─────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(signOutFn: () => Promise<void>) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await signOutFn();
    window.location.href = '/login?reason=idle';
  }, IDLE_TIMEOUT_MS);
}

function startIdleWatcher(signOutFn: () => Promise<void>) {
  const events = ['mousedown','mousemove','keydown','scroll','touchstart','click'];
  const handler = () => resetIdleTimer(signOutFn);
  events.forEach(e => window.addEventListener(e, handler, { passive: true }));
  resetIdleTimer(signOutFn); // start timer immediately
  return () => {
    events.forEach(e => window.removeEventListener(e, handler));
    if (idleTimer) clearTimeout(idleTimer);
  };
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, profile: null, loading: true,
  signOut: async () => {},
});

// M4: Return null instead of a fake frontdesk profile.
// ProtectedRoute will redirect to /login on null profile,
// rather than silently granting frontdesk access on DB errors.
const safeDefaultProfile = (_userId: string): null => null;

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error');
      // Try without join
      const { data: simple } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (simple) return simple as unknown as Profile;
      return null; // M4: fail closed on profile error
    }

    if (data) return data as unknown as Profile;

    // Profile doesn't exist — create it
    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert({ id: userId, role: 'frontdesk' })
      .select('*, departments(name)')
      .maybeSingle();

    if (insertErr) {
      console.error('Profile insert error');
      return null; // M4: fail closed
    }

    return (created as unknown as Profile) ?? safeDefaultProfile(userId);
  } catch (err) {
    console.error('Profile load exception');
    return null; // M4: fail closed
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
      console.error('Profile load failed');
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
      console.error('Session load failed');
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
