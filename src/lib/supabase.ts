import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Env vars are baked in by Vite at build time.
// Fallbacks ensure the published deployment always has valid values
// even if Lovable didn't inject env vars at build time.
// The anon key is a PUBLIC key — safe to include in frontend code.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://hvhggfieaykcrlqxumeh.supabase.co';

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aGdnZmllYXlrY3JscXh1bWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Mzg5NjksImV4cCI6MjA5MTMxNDk2OX0.Yw33bmakYgFXknVNG6BcvHS8F_fZiXCK2gl4LoSUAXQ';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
