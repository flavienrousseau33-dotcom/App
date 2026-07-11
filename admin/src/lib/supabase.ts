import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in admin/.env (see README).'
  );
}

// Deliberately only the anon key: every privileged action this app takes
// goes through a security-definer SQL function that checks the caller is an
// admin server-side (see supabase/schema.sql). The service-role key must
// never be used in a browser-shipped app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
