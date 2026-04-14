// useIdleTimeout — sign out after N minutes of inactivity.
// Resets on any mouse/keyboard/touch event.
// L5 security fix: prevent indefinite sessions on unattended devices.

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const IDLE_MINUTES = 60; // 60 min idle = sign out
const WARN_MINUTES = 55; // Warn at 55 min

export const useIdleTimeout = (enabled = true) => {
  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned     = useRef(false);

  const signOut = useCallback(async () => {
    toast.error('Session expired — you have been signed out due to inactivity.');
    await supabase.auth.signOut();
  }, []);

  const resetTimers = useCallback(() => {
    if (!enabled) return;
    if (idleTimer.current)  clearTimeout(idleTimer.current);
    if (warnTimer.current)  clearTimeout(warnTimer.current);
    warned.current = false;

    warnTimer.current = setTimeout(() => {
      if (!warned.current) {
        warned.current = true;
        toast.warning(`Session expiring in ${IDLE_MINUTES - WARN_MINUTES} minutes due to inactivity.`, { duration: 10000 });
      }
    }, WARN_MINUTES * 60 * 1000);

    idleTimer.current = setTimeout(signOut, IDLE_MINUTES * 60 * 1000);
  }, [enabled, signOut]);

  useEffect(() => {
    if (!enabled) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    const handler = () => resetTimers();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimers(); // Start timer on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimer.current)  clearTimeout(idleTimer.current);
      if (warnTimer.current)  clearTimeout(warnTimer.current);
    };
  }, [enabled, resetTimers]);
};

export default useIdleTimeout;
