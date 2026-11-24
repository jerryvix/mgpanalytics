/**
 * Who is using the app. Everyone has a session: a guest gets an anonymous one on first launch
 * (owner, Nov 24: count every install), so `signedIn` (an account with an email), not
 * "has a session", is what unlocks The Analyst and its History (D-014, D-030). Signing out
 * starts a fresh guest session. Creating an account from a guest turns that guest into the
 * account (sign-in.tsx). Each day the app is opened, one activity row is sent (activity.ts).
 */
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { pingActivity } from '@/lib/activity';
import { supabase } from '@/lib/supabase';

type Auth = {
  session: Session | null;
  user: User | null;
  /** An anonymous session: browsing without an account. */
  isGuest: boolean;
  /** A real account (email and password), not a guest. */
  signedIn: boolean;
  ready: boolean;
};

const AuthContext = createContext<Auth>({ session: null, user: null, isGuest: false, signedIn: false, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // One guest sign-in at a time; after a failure (offline, say) wait for the next foreground
  const guestPending = useRef(false);
  const guestBlocked = useRef(false);

  useEffect(() => {
    const startGuest = async () => {
      if (guestPending.current || guestBlocked.current) return;
      guestPending.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) return;
        const { error } = await supabase.auth.signInAnonymously();
        if (error) guestBlocked.current = true;
      } catch {
        guestBlocked.current = true;
      } finally {
        guestPending.current = false;
      }
    };

    supabase.auth.getSession().then(
      ({ data }) => {
        setSession(data.session);
        setReady(true);
        if (!data.session) startGuest();
      },
      () => {
        setReady(true);
        startGuest();
      },
    );
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Signed out (or the session ran out): start a fresh guest session
      if (!s && event !== 'INITIAL_SESSION') startGuest();
    });
    // Refresh tokens only while the app is in the foreground.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        guestBlocked.current = false;
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) pingActivity(data.session.user.id);
          else startGuest();
        }, () => undefined);
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  // Launch, and every new session (a new guest, or signing in): today's activity row
  const id = session?.user.id;
  useEffect(() => {
    pingActivity(id);
  }, [id]);

  const user = session?.user ?? null;
  const isGuest = user?.is_anonymous === true;
  const signedIn = !!user && !isGuest;
  return <AuthContext.Provider value={{ session, user, isGuest, signedIn, ready }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
