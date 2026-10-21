/**
 * Theme registry for the PRSME customization studio.
 *
 * Phase 3 ships five presets (Obsidian, Violet Haze, Midnight Blue, Rose Noir,
 * Paper). Each one owns a complete CSS variable map consumed by
 * `profileTheme.PROFILE_TOKENS_BY_THEME` — the registry below remains because
 * the studio's appearance picker needs a *displayable* swatch, name and
 * description. The actual paint is now applied through the profile-scope
 * tokens in `profileTheme.ts`, so this file only carries the registry data
 * and a back-compat `THEME_BY_ID` lookup.
 */

import type {
  ThemeId,
  TypographyId,
  LayoutPreset,
  BackgroundTreatment,
  ThemePreset,
} from "./themeTypes";

/* Re-export so existing imports of these from `@/lib/theme` keep working. */
export type {
  ThemeId,
  TypographyId,
  LayoutPreset,
  BackgroundTreatment,
  ThemePreset,
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "obsidian",
    name: "Obsidian",
    description:
      "Cinematic dark surfaces with restrained lavender accents — the PRSME default.",
    tokens: {
      "--surface-0": "#07070B",
      "--surface-1": "#0B0B10",
      "--surface-2": "#101018",
      "--surface-3": "#161622",
      "--surface-4": "#1E1E2C",
      "--text-strong": "#F4F4F6",
      "--text-default": "#E6E6EC",
      "--text-muted": "#9A9AAA",
      "--text-faint": "#6F6F80",
      "--accent-300": "#A892FF",
      "--accent-400": "#8C6CFF",
      "--accent-500": "#7350F0",
      "--accent-600": "#5E3FD0",
      "--line-soft": "rgba(255, 255, 255, 0.06)",
      "--line-strong": "rgba(255, 255, 255, 0.10)",
      "--bg-tint": "transparent",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(140,108,255,0.10), transparent 70%)",
    },
    defaultBackground: "solid",
    swatch: { from: "#0B0B10", to: "#1E1E2C", text: "#F4F4F6" },
  },
  {
    id: "violet",
    name: "Violet Haze",
    description: "Layered lavender and violet tones — moody but alive.",
    tokens: {
      "--surface-0": "#0E0820",
      "--surface-1": "#150A2E",
      "--surface-2": "#1B0F3A",
      "--surface-3": "#241548",
      "--surface-4": "#311B5C",
      "--text-strong": "#F6F2FF",
      "--text-default": "#E2D6FA",
      "--text-muted": "#A99ACF",
      "--text-faint": "#7F70A6",
      "--accent-300": "#C4A8FF",
      "--accent-400": "#A582FF",
      "--accent-500": "#8056EA",
      "--accent-600": "#5F36C2",
      "--line-soft": "rgba(196, 168, 255, 0.10)",
      "--line-strong": "rgba(196, 168, 255, 0.16)",
      "--bg-tint": "rgba(165,130,255,0.08)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(165,130,255,0.18), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#150A2E", to: "#311B5C", text: "#F6F2FF" },
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    description: "Deep blue surfaces with restrained cool accents.",
    tokens: {
      "--surface-0": "#04080F",
      "--surface-1": "#080F1A",
      "--surface-2": "#0C1726",
      "--surface-3": "#112036",
      "--surface-4": "#172B4A",
      "--text-strong": "#EEF4FF",
      "--text-default": "#D6E2F4",
      "--text-muted": "#93A6C6",
      "--text-faint": "#5F7195",
      "--accent-300": "#86B5FF",
      "--accent-400": "#5894F2",
      "--accent-500": "#3A75D8",
      "--accent-600": "#2658AE",
      "--line-soft": "rgba(134, 181, 255, 0.08)",
      "--line-strong": "rgba(134, 181, 255, 0.14)",
      "--bg-tint": "rgba(88,148,242,0.06)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(58,117,216,0.18), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#080F1A", to: "#172B4A", text: "#EEF4FF" },
  },
  {
    id: "rose-noir",
    name: "Rose Noir",
    description: "Muted burgundy and rose tones, low chroma, never neon.",
    tokens: {
      "--surface-0": "#0E0709",
      "--surface-1": "#160B0F",
      "--surface-2": "#1F0F14",
      "--surface-3": "#2A1419",
      "--surface-4": "#391A22",
      "--text-strong": "#FFEFEF",
      "--text-default": "#EDD3D5",
      "--text-muted": "#B39899",
      "--text-faint": "#7C6364",
      "--accent-300": "#E9A5A8",
      "--accent-400": "#D6757B",
      "--accent-500": "#B14C53",
      "--accent-600": "#863237",
      "--line-soft": "rgba(233, 165, 168, 0.08)",
      "--line-strong": "rgba(233, 165, 168, 0.14)",
      "--bg-tint": "rgba(177,76,83,0.06)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(177,76,83,0.20), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#160B0F", to: "#391A22", text: "#FFEFEF" },
  },
  {
    id: "paper",
    name: "Paper",
    description:
      "Designed-for-light theme with high-contrast ink, restrained accent, and a subtle paper grain.",
    tokens: {
      "--surface-0": "#F7F4EE",
      "--surface-1": "#FBF8F2",
      "--surface-2": "#F1ECE2",
      "--surface-3": "#E5DDCB",
      "--surface-4": "#D4C9AE",
      "--text-strong": "#1B1B1F",
      "--text-default": "#2A2A30",
      "--text-muted": "#5C5C66",
      "--text-faint": "#8A8A95",
      "--accent-300": "#5B4BD6",
      "--accent-400": "#4A38C2",
      "--accent-500": "#3A2A99",
      "--accent-600": "#2A1F75",
      "--line-soft": "rgba(27, 27, 31, 0.08)",
      "--line-strong": "rgba(27, 27, 31, 0.16)",
      "--bg-tint": "rgba(74, 56, 194, 0.04)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(74, 56, 194, 0.10), transparent 70%)",
    },
    defaultBackground: "paper-grain",
    swatch: { from: "#FBF8F2", to: "#D4C9AE", text: "#1B1B1F" },
  },
];

export const THEME_BY_ID: Record<ThemeId, ThemePreset> = Object.fromEntries(
  THEME_PRESETS.map((t) => [t.id, t]),
) as Record<ThemeId, ThemePreset>;

/* Typography / layout / background *display* data now lives in
 * `profileTheme.ts`, which is the canonical source for the studio picker.
 * Re-export the list shapes here so the existing imports keep working. */
export { TYPOGRAPHY_LIST, LAYOUT_LIST, BACKGROUND_OPTIONS } from "./profileTheme";

export const DEFAULT_THEME_ID: ThemeId = "obsidian";
export const DEFAULT_TYPOGRAPHY: TypographyId = "serif";
export const DEFAULT_LAYOUT: LayoutPreset = "editorial";
export const DEFAULT_BACKGROUND: BackgroundTreatment = "solid";

/**
 * Back-compat helper used by a few Phase 3 components that still expect an
 * inline style object. The studio chrome resolves its own tokens from the
 * page-level theme, not from this helper — the public profile applies the
 * profile-scoped tokens directly via the `.profile-scope` class.
 */
export function themeInlineStyle(input: {
  theme: ThemeId;
  typography: TypographyId;
  background: BackgroundTreatment;
}): React.CSSProperties & Record<string, string> {
  const preset = THEME_BY_ID[input.theme];
  return preset.tokens as React.CSSProperties & Record<string, string>;
}