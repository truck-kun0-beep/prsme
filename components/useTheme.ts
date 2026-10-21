"use client";

import { useEffect } from "react";
import { THEME_BY_ID, type ThemeId } from "@/lib/theme";
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
  const themeId: ThemeId = appearance?.theme ?? "obsidian";
  const preset = THEME_BY_ID[themeId];
  const html = document.documentElement;
  html.setAttribute("data-theme", themeId);

  let rule = `html[data-theme="${themeId}"]{`;
  for (const [k, v] of Object.entries(preset.tokens)) {
    rule += `${k}:${v};`;
  }
  rule += `}`;

  let bg = "";
  if (appearance?.background === "paper-grain") {
    bg = `html[data-theme] body{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>");background-repeat:no-repeat;background-attachment:fixed;background-size:cover;}`;
  } else if (appearance?.background === "gradient") {
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