import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SapClient } from '@/types';

type LookupState = 'idle' | 'searching' | 'found' | 'not_found' | 'error';

export const useSapLookup = () => {
  const [state, setState] = useState<LookupState>('idle');
  const [client, setClient] = useState<SapClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (phone: string) => {
    if (!phone || phone.replace(/\s/g, '').length < 7) return;
    setState('searching');
    setClient(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sap-client-search', {
        body: { phone: phone.replace(/\s/g, '') },
      });
      if (fnError) throw fnError;
      if (data?.found && data.client) {
        setClient(data.client);
        setState('found');
      } else {
        setState('not_found');
      }
    } catch (e: any) {
      setError(e.message ?? 'SAP lookup failed');
      setState('error');
    }
  };

  const reset = () => { setState('idle'); setClient(null); setError(null); };

  return { state, client, error, search, reset };
};
