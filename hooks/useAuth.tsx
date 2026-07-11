import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  suspended: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // A suspended account can still authenticate (Supabase Auth has no
  // concept of it), so we check the flag ourselves right after and sign
  // them back out rather than letting them into the app.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    supabase
      .from('profiles')
      .select('is_suspended')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data?.is_suspended) return;
        setSuspended(true);
        supabase.auth.signOut();
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      suspended,
      signIn: async (email, password) => {
        setSuspended(false);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, username) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, initializing, suspended]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
