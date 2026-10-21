"use client";

import { useEffect, useState } from "react";
import { useThemeMount } from "@/components/useTheme";
import { loadDraft } from "@/lib/profileDraft";
import { noirProfile } from "@/lib/noirProfile";
import { buildEffectiveOwner } from "@/lib/effectiveProfile";
import { PublicProfileContent } from "@/components/PublicProfileContent";

/**
 * Client island that runs after hydration:
 *   1. Reads the saved ProfileDraft from localStorage.
 *   2. If a draft exists, hides the server-rendered default profile
 *      sections via a body-level attribute and renders the customised
 *      version using the same presentation components and the same
 *      typed data model.
 *
 * The SSR HTML is the canonical Phase 2.5 markup; the override appears
 * only on browsers that have saved a customization.
 *
 * The technique:
 *   - On mount, if a draft exists, set `document.body.dataset.profileOverride = "active"`.
 *   - A CSS rule `[data-profile-override="active"] [data-default-profile]`
 *     hides the SSR sections.
 *   - The same body attribute shows `[data-profile-override-mountpoint]`,
 *     which is where this component renders the customised profile.
 */
export function PublicProfileOverride() {
  const [draft, setDraft] = useState<ReturnType<typeof loadDraft> | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadDraft();
    setDraft(stored);
    setHydrated(true);
    if (stored) {
      document.body.dataset.profileOverride = "active";
    }
    function onStorage() {
      const fresh = loadDraft();
      setDraft(fresh);
      if (fresh) {
        document.body.dataset.profileOverride = "active";
      } else {
        delete document.body.dataset.profileOverride;
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      delete document.body.dataset.profileOverride;
    };
  }, []);

  useThemeMount(draft?.appearance ?? null);

  if (!hydrated) return null;
  if (!draft) return null;

  return (
    <div data-profile-override-mountpoint className="contents">
      <PublicProfileContent
        owner={buildEffectiveOwner(noirProfile, draft)}
        draft={draft}
        respectSectionVisibility
      />
    </div>
  );
}