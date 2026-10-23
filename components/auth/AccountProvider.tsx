"use client";

/**
 * Account context for the client tree.
 *
 * A thin, dependency-free wrapper over `getClient()` that exposes session
 * state to components which need it (the nav's account menu, the Studio's
 * persistence adapter) without every one of them constructing a client and
 * re-subscribing.
 *
 * It degrades to `status: "unconfigured"` when Supabase is absent, which is
 * what lets the demo profile and the guest Studio keep working with no project
 * attached.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AccountStatus =
  /** No Supabase project: guest-only mode. */
  | "unconfigured"
  /** Supabase present, session not yet known. */
  | "loading"
  /** Supabase present, no session. */
  | "anonymous"
  /** Supabase present, signed in. */
  | "authenticated";

export interface AccountContextValue {
  status: AccountStatus;
  user: User | null;
  session: Session | null;
  /** Stable helper for the sign-out path, so callers need not build a client. */
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(
    isSupabaseConfigured() ? "loading" : "unconfigured",
  );
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getClient();
    if (!supabase) {
      setStatus("unconfigured");
      return;
    }

    let cancelled = false;

    // Read the existing session first, then subscribe.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? "authenticated" : "anonymous");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (cancelled) return;
        setSession(nextSession);
        setStatus(nextSession ? "authenticated" : "anonymous");
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      signOut: async () => {
        const supabase = getClient();
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [status, session],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

/**
 * Account state.
 *
 * Returns a neutral anonymous value when no provider is mounted, so a
 * component rendered outside the provider (a test harness, a standalone island)
 * degrades to guest mode instead of throwing.
 */
export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (ctx) return ctx;
  return {
    status: "unconfigured",
    user: null,
    session: null,
    signOut: async () => {},
  };
}