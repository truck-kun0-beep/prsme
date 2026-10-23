"use client";

/**
 * Backwards-compatible access to the Studio's draft.
 *
 * Phase 5 introduced a second persistence backend (Supabase) alongside the
 * original localStorage one, and the selection logic between them lives in
 * `ProfileStoreProvider`. Every Studio panel already imported
 * `useProfileDraft` from THIS module, and each one only ever needed "the draft,
 * a way to patch it, and a save button that reports state".
 *
 * Rather than rewrite ten panels to consume the new context, this hook is a
 * narrow adapter over it. The surface it exposes is unchanged, so panel code is
 * untouched, and the backend swap is confined to one file.
 *
 * Two intentional differences from the pre-Phase-5 hook:
 *
 *   - `save()` is now async (a database round-trip is possible), so a caller
 *     that assumed a synchronous result must await it. The only such caller is
 *     the Studio's save button.
 *   - `defaults` is derived per-call rather than held, because an account's
 *     "defaults" depend on whether it is guest or not.
 */

import { useMemo, type ReactNode } from "react";
import {
  useProfileStore,
  type SaveOutcome,
} from "@/components/studio/ProfileStoreProvider";
import { buildDefaultDraft, type ProfileDraft } from "@/lib/profileDraft";

export interface ProfileDraftContextValue {
  draft: ProfileDraft;
  defaults: ProfileDraft;
  hydrated: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  update: (patch: Partial<ProfileDraft>) => void;
  updateWith: (producer: (current: ProfileDraft) => ProfileDraft) => void;
  reset: () => void;
  save: () => Promise<SaveOutcome>;
}

export function useProfileDraft(): ProfileDraftContextValue {
  const store = useProfileStore();

  const defaults = useMemo(
    () => buildDefaultDraft({ includeDemoClicks: false }),
    [],
  );

  return {
    draft: store.draft,
    defaults,
    hydrated: store.hydrated,
    dirty: store.dirty,
    lastSavedAt: store.lastSavedAt,
    lastError: store.lastError,
    update: store.update,
    updateWith: store.updateWith,
    reset: store.reset,
    save: store.save,
  };
}

/**
 * Compatibility wrapper.
 *
 * The draft and its provider now live in `ProfileStoreProvider` (Phase 5,
 * because the Studio gained a second persistence backend). This component is
 * kept so the existing nesting in `StudioClient` — and any other caller —
 * keeps working unchanged.
 *
 * It renders children and nothing else: all state belongs to the store above
 * it, and nesting two providers over the same draft would give the two halves
 * of the Studio disagreeing about what is saved.
 */
export function ProfileDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
export type { SaveOutcome };