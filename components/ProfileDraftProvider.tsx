"use client";

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
  PROFILE_DRAFT_KEY,
  type ProfileDraft,
} from "@/lib/profileDraft";

type SaveOutcome = { ok: true; savedAt: number } | { ok: false; error: string };

interface ProfileDraftContextValue {
  draft: ProfileDraft;
  defaults: ProfileDraft;
  hydrated: boolean;
  /** True when the in-memory draft differs from the persisted draft (or there is no persisted draft yet). */
  dirty: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  /** Imperative partial updates — shallow-merged into the draft. */
  update: (patch: Partial<ProfileDraft>) => void;
  /** Imperative deep updates through a producer. */
  updateWith: (producer: (current: ProfileDraft) => ProfileDraft) => void;
  /** Reset in-memory + storage back to the demo defaults. */
  reset: () => void;
  /** Persist the current draft to localStorage. */
  save: () => SaveOutcome;
}

const ProfileDraftContext = createContext<ProfileDraftContextValue | null>(null);

export function ProfileDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => buildDefaultDraft());
  const [defaults] = useState<ProfileDraft>(() => buildDefaultDraft());
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastPersistedRef = useRef<string | null>(null);

  // Hydrate from localStorage on mount. The default in-memory draft mirrors
  // the demo so SSR is consistent; we replace it after hydration.
  useEffect(() => {
    const stored = loadDraft();
    if (stored) {
      setDraft(stored);
      lastPersistedRef.current = JSON.stringify(stored);
      setLastSavedAt(Date.now());
    }
    setHydrated(true);
  }, []);

  // Cross-tab sync: if another tab saves, pick it up.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== PROFILE_DRAFT_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        const fresh = readDraft(parsed);
        setDraft(fresh);
        lastPersistedRef.current = e.newValue;
        setLastSavedAt(Date.now());
        setDirty(false);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<ProfileDraft>) => {
    setDraft((cur) => ({ ...cur, ...patch }));
    setDirty(true);
    setLastError(null);
  }, []);

  const updateWith = useCallback((producer: (current: ProfileDraft) => ProfileDraft) => {
    setDraft((cur) => producer(cur));
    setDirty(true);
    setLastError(null);
  }, []);

  const reset = useCallback(() => {
    const fresh = buildDefaultDraft();
    setDraft(fresh);
    setDirty(false);
    setLastError(null);
    clearStoredDraft();
    lastPersistedRef.current = JSON.stringify(fresh);
    // Notify other tabs.
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: PROFILE_DRAFT_KEY,
          newValue: JSON.stringify(fresh),
        }),
      );
    } catch {
      /* non-fatal */
    }
  }, []);

  const save = useCallback((): SaveOutcome => {
    const result = saveDraft(draft);
    if (result.ok) {
      lastPersistedRef.current = JSON.stringify(draft);
      const now = Date.now();
      setLastSavedAt(now);
      setDirty(false);
      setLastError(null);
      return { ok: true, savedAt: now };
    }
    setLastError(result.error ?? "Could not save.");
    return { ok: false, error: result.error ?? "Could not save." };
  }, [draft]);

  const value = useMemo<ProfileDraftContextValue>(
    () => ({
      draft,
      defaults,
      hydrated,
      dirty,
      lastSavedAt,
      lastError,
      update,
      updateWith,
      reset,
      save,
    }),
    [draft, defaults, hydrated, dirty, lastSavedAt, lastError, update, updateWith, reset, save],
  );

  return (
    <ProfileDraftContext.Provider value={value}>
      {children}
    </ProfileDraftContext.Provider>
  );
}

export function useProfileDraft(): ProfileDraftContextValue {
  const ctx = useContext(ProfileDraftContext);
  if (!ctx) {
    throw new Error("useProfileDraft must be used inside <ProfileDraftProvider>");
  }
  return ctx;
}