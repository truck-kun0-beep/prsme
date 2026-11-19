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
  /**
   * The signed-in account's own profile username, or `null`.
   *
   * PRE-PHASE 11 — the username lives in the `profiles.username` COLUMN, not
   * in `auth.users.raw_user_meta_data`. The app never writes that metadata
   * field, so reading it would give `undefined` for every account created
   * through the normal onboarding flow — and the "View Profile" action would
   * have nothing to link to.
   *
   * So the username is read from the application's own profile endpoint, which
   * is scoped by the session and can only ever return the caller's own row.
   */
  username: string | null;
  /**
   * True once the profile lookup has settled.
   *
   * `null` username with `profileLoaded: true` means the account is signed in
   * but has not created a profile yet — which is a different state from "we
   * have not looked yet", and the navigation treats it differently.
   */
  profileLoaded: boolean;
  /** Stable helper for the sign-out path, so callers need not build a client. */
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * One in-flight lookup for the whole page.
 *
 * The nav's mobile panel and the account menu both need the username, and
 * they mount independently. Without this, an authenticated page would issue
 * two identical requests for the same row on every navigation.
 */
let profileLookup: Promise<string | null> | null = null;

function fetchOwnUsername(): Promise<string | null> {
  if (!profileLookup) {
    profileLookup = fetch("/api/profile", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { ok?: boolean; username?: string };
        return body.ok && typeof body.username === "string" ? body.username : null;
      })
      .catch(() => null)
      .finally(() => {
        // Allow a later retry (after onboarding creates the profile).
        profileLookup = null;
      });
  }
  return profileLookup;
}

/** Drop the cached lookup — used after sign-out and after onboarding. */
export function resetOwnUsernameLookup(): void {
  profileLookup = null;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(
    isSupabaseConfigured() ? "loading" : "unconfigured",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

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
        if (!nextSession) {
          // Signed out: forget the username so a second person on a shared
          // browser never sees the previous account's handle.
          setUsername(null);
          setProfileLoaded(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  /*
   * Resolve the account's own profile username once the session is known.
   *
   * It is a separate effect from the session subscription because it depends
   * on the session rather than on the subscription: signing in, or finishing
   * onboarding, should each be able to trigger it without re-subscribing.
   */
  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "anonymous" || status === "unconfigured") {
        setProfileLoaded(true);
      }
      return;
    }

    let cancelled = false;
    setProfileLoaded(false);

    void fetchOwnUsername().then((value) => {
      if (cancelled) return;
      setUsername(value);
      setProfileLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [status]);

  const value = useMemo<AccountContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      username,
      profileLoaded,
      signOut: async () => {
        const supabase = getClient();
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [status, session, username, profileLoaded],
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
    username: null,
    profileLoaded: true,
    signOut: async () => {},
  };
}
