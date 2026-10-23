"use client";

import { useEffect, useState } from "react";
import { useThemeMount } from "@/components/useTheme";
import { loadDraft } from "@/lib/profileDraft";
import { noirProfile } from "@/lib/noirProfile";
import { buildEffectiveOwner } from "@/lib/effectiveProfile";
import { ThemeScope } from "@/components/ThemeScope";
import { PublicProfileContent } from "@/components/PublicProfileContent";

/**
 * Client island that runs after hydration:
 *   1. Reads the saved ProfileDraft from localStorage.
 *   2. If a draft exists, removes the server-rendered default profile from
 *      the DOM and renders the customised version with the same
 *      presentation components and the same typed data model.
 *
 * The override is the entire post-customization page, not a parallel copy
 * of it. The server-rendered default is therefore *removed* (not hidden) the
 * moment the override mounts; for visitors without JavaScript, the override
 * never hydrates, and the default stays exactly as it came off the server.
 */
export function PublicProfileOverride() {
  const [draft, setDraft] = useState<ReturnType<typeof loadDraft> | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const stored = loadDraft();
    setDraft(stored);
    setHydrated(true);
    if (stored) {
      document.body.dataset.profileOverride = "active";
      // The SSR default is already fully laid out; once we have a draft, the
      // default is redundant and confusing — wipe it from the DOM rather
      // than display:none it, so every selector and every screen-reader pass
      // sees one profile, not two stacked ones.
      document
        .querySelectorAll("[data-default-profile]")
        .forEach((el) => el.parentElement?.removeChild(el));
      setActive(true);
    }

    function onStorage() {
      const fresh = loadDraft();
      setDraft(fresh);
      if (fresh) {
        document.body.dataset.profileOverride = "active";
        document
          .querySelectorAll("[data-default-profile]")
          .forEach((el) => el.parentElement?.removeChild(el));
        setActive(true);
      } else {
        delete document.body.dataset.profileOverride;
        setActive(false);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      // Cleanup must not remove the body flag, because its absence would
      // unmount our override mountpoint but not restore the SSR default that
      // we already removed. The override outlives the effect; the next
      // render replaces it.
    };
  }, []);

  useThemeMount(draft?.appearance ?? null);

  if (!hydrated) return null;
  if (!active || !draft) return null;

  return (
    <div data-profile-override-mountpoint className="contents">
      {/*
       * `ThemeScope` is not optional here.
       *
       * The server-rendered default profile is wrapped in `ThemeScope`, which
       * publishes the draft's theme, typography, and layout as `--pf-*` custom
       * properties on `.profile-scope`. Every surface inside the profile —
       * headings, cards, and now the Custom Link Buttons — reads those tokens.
       *
       * Without this wrapper the override rendered a bare `.pf-document`, so a
       * customised profile fell back to the `.profile-scope` neutral defaults
       * and the owner's chosen typography never reached it: a saved
       * `typography: "mono"` still rendered Instrument Serif. Re-wrapping here
       * is what makes "the saved settings are authoritative" true for the
       * customised profile and not just the SSR default.
       */}
      <ThemeScope draft={draft}>
        <PublicProfileContent
          owner={buildEffectiveOwner(noirProfile, draft)}
          draft={draft}
          respectSectionVisibility
        />
      </ThemeScope>
    </div>
  );
}