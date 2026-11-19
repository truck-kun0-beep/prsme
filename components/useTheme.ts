"use client";

import { useEffect } from "react";
import { THEME_BY_ID, normaliseThemeId, type ThemeId } from "@/lib/theme";
import type { ProfileDraft } from "@/lib/profileDraft";

const THEME_STYLE_ID = "prsme-theme-vars";

/**
 * Apply a ProfileDraft.appearance onto <html> by:
 *   1. setting data-theme="<id>" on the html element, and
 *   2. injecting a tiny <style> block that redeclares the preset tokens
 *      and the chosen background treatment.
 *
 * The bridge in globals.css (`html[data-theme]`) then maps those tokens
 * onto the Tailwind palette so existing classes resolve correctly inside
 * any theme. The boot script in `lib/themeBoot.ts` runs before first paint
 * to apply the persisted theme without FOUC.
 */
export function useThemeMount(appearance: ProfileDraft["appearance"] | null) {
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
}

function applyAppearance(appearance: ProfileDraft["appearance"] | null) {
  /*
   * Pre-Phase 11 — normalise the id before painting.
   *
   * A draft saved before the palette curation can still carry an old theme
   * id. Painting `data-theme="rose-noir"` would resolve no tokens at all,
   * leaving the page on the default palette's *page* colours while the
   * profile scope painted the resolved palette — two different themes on one
   * screen. Normalising here keeps the two layers in agreement.
   */
  const themeId: ThemeId = normaliseThemeId(appearance?.theme ?? "obsidian");
  const preset = THEME_BY_ID[themeId];
  const html = document.documentElement;
  html.setAttribute("data-theme", themeId);

  let rule = `html[data-theme="${themeId}"]{`;
  for (const [k, v] of Object.entries(preset.tokens)) {
    rule += `${k}:${v};`;
  }
  rule += `}`;

  let bg = "";
  if (appearance?.background === "gradient") {
    const panel = preset.tokens["--panel-haze"] || "transparent";
    bg = `html[data-theme] body{background-image:${panel};background-repeat:no-repeat;background-attachment:fixed;background-size:cover;}`;
  } else {
    bg = `html[data-theme] body{background-image:transparent;}`;
  }

  let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = rule + "\n" + bg;
}