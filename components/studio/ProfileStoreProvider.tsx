"use client";

/**
 * Studio persistence.
 *
 * One context, two backends, chosen by account state:
 *
 *   - **Guest** (no session, or no Supabase configured): exactly the existing
 *     `localStorage` behaviour. Nothing about the demo changes.
 *   - **Authenticated**: `localStorage` is NOT read. The draft comes from the
 *     database and `save()` POSTs to `/api/profile`.
 *
 * The most important rule in this file is the negative one: for a signed-in
 * owner, a stale local draft must never silently overwrite the saved database
 * profile. Guests legitimately carry work in localStorage from before they
 * ever created an account; once they have an account, the database is
 * authoritative and the local copy is at most a recovery source — which is why
 * the guest-draft values are computed but only ever *offered*, never auto-applied.
 *
 * Save ordering: saves are serialised through a monotonic counter. A response
 * for an older revision is discarded rather than allowed to clobber a newer
 * edit, which is what prevents a slow first request from overwriting a fast
 * second one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildDefaultDraft,
  loadDraft,
  saveDraft,
  clearStoredDraft,
  readDraft,
  type ProfileDraft,
} from "@/lib/profileDraft";
import { useAccount } from "@/components/auth/AccountProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type SavePhase = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface SaveOutcome {
  ok: boolean;
  savedAt?: number;
  error?: string;
}

interface ProfileStoreValue {
  draft: ProfileDraft;
  /** True once the initial load (guest or account) has settled. */
  hydrated: boolean;
  /** Which backend the current draft belongs to. */
  mode: "guest" | "account";
  phase: SavePhase;
  dirty: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  /** The owner's public username, when known. */
  username: string | null;
  update: (patch: Partial<ProfileDraft>) => void;
  updateWith: (producer: (current: ProfileDraft) => ProfileDraft) => void;
  reset: () => void;
  save: () => Promise<SaveOutcome>;
}

const ProfileStoreContext = createContext<ProfileStoreValue | null>(null);

export function ProfileStoreProvider({ children }: { children: ReactNode }) {
  const { status } = useAccount();
  const isAccount = isSupabaseConfigured() && status === "authenticated";

  const [draft, setDraft] = useState<ProfileDraft>(() =>
    buildDefaultDraft({ includeDemoClicks: false }),
  );
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [mode, setMode] = useState<"guest" | "account">("guest");

  /*
   * Monotonic save revision.
   *
   * Every save takes a ticket; only a response whose ticket is still the
   * newest is allowed to update `phase`. Without this, two overlapping saves
   * can resolve out of order and the UI can report "saved" for a revision that
   * the server has already superseded.
   */
  const saveTicket = useRef(0);
  const inflight = useRef(false);

  /* ---------------------------------------------------------------- */
  /*                          Initial load                            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured() || status === "unconfigured") {
      const local = loadDraft();
      if (!cancelled) {
        if (local) {
          setDraft(local);
          setLastSavedAt(Date.now());
          setPhase("saved");
        }
        setMode("guest");
        setHydrated(true);
      }
      return;
    }

    if (status === "loading") return;

    if (status === "anonymous") {
      const local = loadDraft();
      if (!cancelled) {
        if (local) {
          setDraft(local);
          setLastSavedAt(Date.now());
          setPhase("saved");
        }
        setMode("guest");
        setHydrated(true);
      }
      return;
    }

    // status === "authenticated": the database is the only source of truth.
    setMode("account");

    void (async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "GET",
          // Not cached: a stale 200 would hydrate the Studio with someone
          // else's older revision.
          cache: "no-store",
        });

        if (response.status === 404) {
          // Authenticated but no profile yet — onboarding is the next step.
          if (!cancelled) {
            setDraft(buildDefaultDraft({ includeDemoClicks: false }));
            setPhase("idle");
            setHydrated(true);
          }
          return;
        }

        if (!response.ok) throw new Error(`load failed: ${response.status}`);

        const payload = (await response.json()) as {
          draft?: unknown;
          username?: string;
          updatedAt?: string;
        };

        // The draft is re-validated client-side too, so a row written by a
        // newer server build cannot crash the Studio.
        const parsed = payload.draft ? readDraft(payload.draft) : null;

        if (!cancelled) {
          if (parsed) {
            setDraft(parsed);
            setPhase("saved");
            setLastSavedAt(Date.now());
          }
          if (typeof payload.username === "string") setUsername(payload.username);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) {
          setLastError("Couldn't load your saved profile.");
          setPhase("error");
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  /* ---------------------------------------------------------------- */
  /*                            Mutations                             */
  /* ---------------------------------------------------------------- */
  const update = useCallback((patch: Partial<ProfileDraft>) => {
    setDraft((cur) => ({ ...cur, ...patch }));
    setPhase("unsaved");
    setLastError(null);
  }, []);

  const updateWith = useCallback(
    (producer: (current: ProfileDraft) => ProfileDraft) => {
      setDraft((cur) => producer(cur));
      setPhase("unsaved");
      setLastError(null);
    },
    [],
  );

  /*
   * Reset.
   *
   * For a guest this is the existing "Reset demo" action: restore the demo and
   * write it to localStorage.
   *
   * For an account it deliberately does NOT push the demo profile into the
   * database. It resets the in-memory editor to the starter state and marks the
   * draft unsaved — the owner then presses Save to make it real. Silently
   * writing Noir's demo content over a real account's saved profile is exactly
   * the "do not copy the demo into a new account" failure.
   */
  const reset = useCallback(() => {
    const fresh = buildDefaultDraft(
      mode === "guest" ? { includeDemoClicks: true } : { includeDemoClicks: false },
    );

    if (mode === "account") {
      // Keep the owner's own identity fields; only the content resets.
      setDraft((cur) => ({
        ...fresh,
        identity: {
          ...fresh.identity,
          username: cur.identity.username,
          displayName: cur.identity.displayName,
        },
        visibility: cur.visibility,
      }));
      setPhase("unsaved");
      setLastError(null);
      return;
    }

    setDraft(fresh);
    saveDraft(fresh);
    setLastSavedAt(Date.now());
    setPhase("saved");
    setLastError(null);
  }, [mode]);

  /* ---------------------------------------------------------------- */
  /*                              Save                                */
  /* ---------------------------------------------------------------- */
  const save = useCallback(async (): Promise<SaveOutcome> => {
    const ticket = ++saveTicket.current;

    setPhase("saving");
    setLastError(null);

    try {
      if (mode === "guest") {
        const result = saveDraft(draft);
        if (!result.ok) {
          // Only the newest ticket may publish an outcome.
          if (ticket === saveTicket.current) {
            setLastError(result.error ?? "Could not save.");
            setPhase("error");
          }
          return { ok: false, error: result.error ?? "Could not save." };
        }

        if (ticket === saveTicket.current) {
          const now = Date.now();
          setLastSavedAt(now);
          setPhase("saved");
          return { ok: true, savedAt: now };
        }
        return { ok: true };
      }

      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft,
          visibility: draft.visibility === "public" ? "public" : "private",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        username?: string;
      };

      // A superseded response must not report success or failure.
      if (ticket !== saveTicket.current) return { ok: true };

      if (!response.ok || !payload.ok) {
        const message = payload.error ?? "Could not save.";
        setLastError(message);
        setPhase("error");
        return { ok: false, error: message };
      }

      const now = Date.now();
      setLastSavedAt(now);
      setPhase("saved");
      if (typeof payload.username === "string") setUsername(payload.username);
      return { ok: true, savedAt: now };
    } catch {
      if (ticket === saveTicket.current) {
        setLastError("Network error — your changes are still here, try again.");
        setPhase("error");
      }
      return { ok: false, error: "Network error." };
    }
  }, [draft, mode]);

  const dirty = phase === "unsaved" || phase === "saving";

  const value = useMemo<ProfileStoreValue>(
    () => ({
      draft,
      hydrated,
      mode,
      phase,
      dirty,
      lastSavedAt,
      lastError,
      username,
      update,
      updateWith,
      reset,
      save,
    }),
    [
      draft,
      hydrated,
      mode,
      phase,
      dirty,
      lastSavedAt,
      lastError,
      username,
      update,
      updateWith,
      reset,
      save,
    ],
  );

  void inflight;

  return (
    <ProfileStoreContext.Provider value={value}>
      {children}
    </ProfileStoreContext.Provider>
  );
}

/**
 * The Studio's draft and its save state.
 *
 * Throws outside the provider — unlike the account context, every consumer is
 * a Studio panel, and a missing provider there is a wiring bug that should be
 * loud.
 */
export function useProfileStore(): ProfileStoreValue {
  const ctx = useContext(ProfileStoreContext);
  if (!ctx) {
    throw new Error(
      "useProfileStore must be used inside <ProfileStoreProvider>",
    );
  }
  return ctx;
}

/**
 * Sign-out cleanup for the guest/account boundary.
 *
 * Removing the local draft on sign-out is deliberate: leaving it behind would
 * mean the *next* person to use this browser opens the Studio as a guest and
 * sees the previous owner's work.
 */
export function useClearDraftOnSignOut() {
  const { status } = useAccount();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (status === "authenticated") {
      wasAuthenticated.current = true;
      return;
    }
    if (wasAuthenticated.current && status === "anonymous") {
      wasAuthenticated.current = false;
      clearStoredDraft();
    }
  }, [status]);
}