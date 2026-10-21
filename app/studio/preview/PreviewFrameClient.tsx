"use client";

import { useEffect, useState } from "react";
import { PublicProfileContent } from "@/components/PublicProfileContent";
import { ThemeScope } from "@/components/ThemeScope";
import { buildEffectiveOwner } from "@/lib/effectiveProfile";
import { noirProfile } from "@/lib/noirProfile";
import {
  loadDraft,
  readDraft,
  type ProfileDraft,
} from "@/lib/profileDraft";

/**
 * Body of the /studio/preview iframe. Listens for `postMessage` from the
 * parent StudioClient so live (unsaved) edits travel with the user's
 * changes. Falls back to the saved draft in localStorage when the iframe is
 * opened directly (e.g. by the "Open preview" button) so the same state
 * is visible without any message exchange.
 */
export function PreviewFrameClient() {
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 1. Fallback path: read whatever was last saved on this device.
    const stored = loadDraft();
    if (stored) setDraft(stored);
    setHydrated(true);

    // 2. Live syncing path: parent sends the in-memory draft.
    function onMessage(ev: MessageEvent<unknown>) {
      if (typeof ev.data !== "object" || ev.data === null) return;
      const data = ev.data as Record<string, unknown>;
      if (data.type !== "prsme-preview-state") return;
      if (data.draft === null) {
        setDraft(null);
        return;
      }
      if (typeof data.draft !== "object") return;
      const parsed = readDraft(data.draft);
      setDraft(parsed);
    }
    window.addEventListener("message", onMessage);

    // 3. Ask the parent for the latest draft. If we're embedded, the
    //    parent will respond. If we're standalone, no harm — we keep
    //    whatever localStorage said.
    try {
      window.parent?.postMessage({ type: "prsme-preview-ready" }, "*");
    } catch {
      /* not embedded */
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Until hydration finishes we render the demo profile so SSR markup is
  // consistent. Once hydration runs we swap to whatever the parent pushed
  // (or to localStorage if nothing was pushed).
  const owner = hydrated && draft
    ? buildEffectiveOwner(noirProfile, draft)
    : noirProfile;

  return (
    <ThemeScope draft={draft}>
      <PublicProfileContent
        owner={owner}
        draft={draft}
        respectSectionVisibility={hydrated}
      />
    </ThemeScope>
  );
}