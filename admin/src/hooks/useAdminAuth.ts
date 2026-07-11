import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

type Status = 'loading' | 'signed-out' | 'not-admin' | 'admin';

export function useAdminAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const checkAdmin = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setStatus('signed-out');
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', currentSession.user.id)
      .single();

    if (profileError || !data?.is_admin) {
      // Never leave a non-admin session logged into the back office.
      await supabase.auth.signOut();
      setStatus('not-admin');
      return;
    }

    setStatus('admin');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      checkAdmin(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      checkAdmin(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [checkAdmin]);

  async function signIn(email: string, password: string) {
    setError(null);
    setStatus('loading');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setStatus('signed-out');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setStatus('signed-out');
  }

  return { status, error, email: session?.user.email ?? null, signIn, signOut };
}
