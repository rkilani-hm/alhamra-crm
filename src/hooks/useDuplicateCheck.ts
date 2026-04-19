// useDuplicateCheck — calls the check-duplicate edge function.
// Debounced: fires 600ms after the last field change.
// Returns { checking, result } where result has is_duplicate, confidence, matched, reason.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface DuplicateResult {
  is_duplicate: boolean;
  confidence:   number;           // 0–100
  matched?:     any | null;       // the matched DB record
  candidates?:  any[];
  reason:       string;
}

interface CheckParams {
  entity_type: 'contact' | 'organization';
  name:        string;
  phone?:      string;
  email?:      string;
  exclude_id?: string;
}

export function useDuplicateCheck(params: CheckParams, enabled = true) {
  const [checking, setChecking] = useState(false);
  const [result,   setResult]   = useState<DuplicateResult | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout>>();
  const abortRef  = useRef<AbortController>();

  const check = useCallback(async (p: CheckParams) => {
    if (!p.name || p.name.trim().length < 2) { setResult(null); return; }

    setChecking(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { data, error } = await supabase.functions.invoke('check-duplicate', {
        body: p,
      });
      if (error) throw error;
      setResult(data as DuplicateResult);
    } catch {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => check(params), 600);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.name, params.phone, params.email, params.entity_type, enabled]);

  return { checking, result };
}
