"use client";

import { useEffect, useState } from "react";
import { useThemeMount } from "./useTheme";
import {
  isLightTheme,
  PROFILE_SCOPE_CLASS,
  profileScopeStyle,
} from "@/lib/profileTheme";
import { loadDraft, type ProfileDraft } from "@/lib/profileDraft";
import type { LayoutPreset } from "@/lib/profileTheme";

/**
 * ThemeScope — wraps profile content inside `.profile-scope` and applies
 * the chosen theme, typography, and global layout via CSS custom properties.
 *
 * The component renders the wrapper at the top of every profile surface:
 *   - the public profile (`/u/[username]`), via `draftSource="storage"`
 *   - the studio iframe (`/studio/preview`), via an explicit `draft` prop
 *
 * `draftSource="storage"` is what makes the saved Studio state show up on
 * `/u/noir`: the scope reads the saved draft after hydration and swaps the
 * `--pf-*` tokens. Before hydration it renders the demo defaults, which is
 * correct for a first-time visitor and keeps SSR markup consistent. The
 * page-level `<html data-theme>` bridge is handled separately by
 * `useThemeMount` (plus the pre-paint boot script), so the site tokens and
 * the profile tokens never disagree about which theme is active.
 *
 * Scopes are kept distinct on purpose:
 *   - The PRSME site tokens (`--surface-*`, `--text-*`, `--accent-*`) stay on
 *     the document, so the studio editor chrome never takes the profile theme.
 *   - The profile tokens (`--pf-*`) live on this scope only.
 */
export function ThemeScope({
  draft: draftProp,
  draftSource,
  className = "",
  children,
}: {
  /** Explicit draft (studio iframe). Wins over `draftSource`. */
  draft?: ProfileDraft | null;
  /** Read the saved draft from localStorage after hydration (public page). */
  draftSource?: "storage";
  className?: string;
  children: React.ReactNode;
}) {
  const [stored, setStored] = useState<ProfileDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (draftSource !== "storage") return;
    const apply = () => {
      setStored(loadDraft());
      setHydrated(true);
    };
    apply();
    // Keep the scope in sync when another tab saves or resets.
    window.addEventListener("storage", apply);
    return () => window.removeEventListener("storage", apply);
  }, [draftSource]);

  // The explicit `draft` prop (used by the iframe) doesn't need the
  // localStorage fallback; rely on its own hydration path in the parent.
  const effective = draftProp ?? (draftSource === "storage" ? stored : null);
  const appearance = effective?.appearance ?? null;
  // Apply the site-level palette (`html[data-theme]`) too, so off-iframe
  // pages like /u/[username] keep the Document-level bridge for SSR markup.
  useThemeMount(appearance);

  const theme = appearance?.theme ?? "obsidian";
  const typography = appearance?.typography ?? "serif";
  const layout = (appearance?.layout ?? "poster") as LayoutPreset;
  const background = appearance?.background ?? "solid";
  const accentOverride = appearance?.accentOverride ?? null;

  const style = profileScopeStyle({
    theme,
    typography,
    layout,
    background,
    accentOverride,
  });

  return (
    <div
      data-theme-id={theme}
      data-tone={isLightTheme(theme) ? "light" : "dark"}
      data-layout-split={layout === "compact" ? "stacked" : "side"}
      className={`${PROFILE_SCOPE_CLASS} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
