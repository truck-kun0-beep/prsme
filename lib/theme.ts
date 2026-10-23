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
  /* ---- Phase 4.3 — six new palettes ----
   *
   * Display names are the brief's names; IDs match `ProfileTokens` keys in
   * `profileTheme.ts`. Tokens here drive the studio chrome only (not the
   * profile, which uses `--pf-*`). The visual swatch stays accurate because
   * both systems describe the same palette. */
  {
    id: "forest-dark",
    name: "Forest After Dark",
    description:
      "Deep forest green, muted sage highlights, and an understated botanical atmosphere.",
    tokens: {
      "--surface-0": "#060D0A",
      "--surface-1": "#0A1410",
      "--surface-2": "#0F1D17",
      "--surface-3": "#15281F",
      "--surface-4": "#1B3327",
      "--text-strong": "#EDF5EF",
      "--text-default": "#D6E5DA",
      "--text-muted": "#93AC9C",
      "--text-faint": "#647C6D",
      "--accent-300": "#CFE6D8",
      "--accent-400": "#A7CDB6",
      "--accent-500": "#84B79A",
      "--accent-600": "#5E9577",
      "--line-soft": "rgba(167,205,182,0.10)",
      "--line-strong": "rgba(167,205,182,0.22)",
      "--bg-tint": "rgba(132,183,154,0.06)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(132,183,154,0.18), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#0A1410", to: "#1B3327", text: "#EDF5EF" },
  },
  {
    id: "cherry-cola",
    name: "Cherry Cola",
    description:
      "Near-black surfaces with restrained oxblood, deep cherry, and warm rose accents.",
    tokens: {
      "--surface-0": "#0C0608",
      "--surface-1": "#140A0D",
      "--surface-2": "#1C0E12",
      "--surface-3": "#261317",
      "--surface-4": "#34181E",
      "--text-strong": "#FDEEEE",
      "--text-default": "#F0D8D8",
      "--text-muted": "#C09898",
      "--text-faint": "#8A6565",
      "--accent-300": "#F5BAC0",
      "--accent-400": "#E4969A",
      "--accent-500": "#D26A70",
      "--accent-600": "#A8484E",
      "--line-soft": "rgba(228,150,150,0.10)",
      "--line-strong": "rgba(228,150,150,0.22)",
      "--bg-tint": "rgba(210,106,112,0.07)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(210,106,112,0.20), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#140A0D", to: "#34181E", text: "#FDEEEE" },
  },
  {
    id: "silver-screen",
    name: "Silver Screen",
    description:
      "Refined monochrome with charcoal surfaces, silver accents, and editorial contrast.",
    tokens: {
      "--surface-0": "#0A0A0A",
      "--surface-1": "#111111",
      "--surface-2": "#181818",
      "--surface-3": "#212121",
      "--surface-4": "#2E2E2E",
      "--text-strong": "#FAFAFA",
      "--text-default": "#E4E4E4",
      "--text-muted": "#A3A3A3",
      "--text-faint": "#6E6E6E",
      "--accent-300": "#EDEDED",
      "--accent-400": "#D4D4D4",
      "--accent-500": "#B0B0B0",
      "--accent-600": "#8A8A8A",
      "--line-soft": "rgba(255,255,255,0.10)",
      "--line-strong": "rgba(255,255,255,0.20)",
      "--bg-tint": "rgba(255,255,255,0.05)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(255,255,255,0.10), transparent 70%)",
    },
    defaultBackground: "solid",
    swatch: { from: "#111111", to: "#2E2E2E", text: "#FAFAFA" },
  },
  {
    id: "amber-film",
    name: "Amber Film",
    description:
      "Warm near-black, muted amber, and subtle sepia-inspired tones.",
    tokens: {
      "--surface-0": "#0D0904",
      "--surface-1": "#15100A",
      "--surface-2": "#1D160D",
      "--surface-3": "#271E12",
      "--surface-4": "#352817",
      "--text-strong": "#FBF2E2",
      "--text-default": "#EBDDC5",
      "--text-muted": "#BFAA88",
      "--text-faint": "#8A795E",
      "--accent-300": "#F2C68A",
      "--accent-400": "#E2B26E",
      "--accent-500": "#C99450",
      "--accent-600": "#A4763A",
      "--line-soft": "rgba(226,178,110,0.10)",
      "--line-strong": "rgba(226,178,110,0.22)",
      "--bg-tint": "rgba(201,148,80,0.06)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(201,148,80,0.20), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#15100A", to: "#352817", text: "#FBF2E2" },
  },
  {
    id: "arctic-tide",
    name: "Arctic Tide",
    description:
      "Deep blue-teal surfaces with cool ice-coloured accents.",
    tokens: {
      "--surface-0": "#04090E",
      "--surface-1": "#081119",
      "--surface-2": "#0C1922",
      "--surface-3": "#12232E",
      "--surface-4": "#1A2F3B",
      "--text-strong": "#EAF6FA",
      "--text-default": "#CDE3EC",
      "--text-muted": "#8CAAB8",
      "--text-faint": "#5C7884",
      "--accent-300": "#BBE6F2",
      "--accent-400": "#96D6E8",
      "--accent-500": "#6BBED4",
      "--accent-600": "#3E96AE",
      "--line-soft": "rgba(150,214,232,0.10)",
      "--line-strong": "rgba(150,214,232,0.22)",
      "--bg-tint": "rgba(107,190,212,0.06)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(107,190,212,0.20), transparent 70%)",
    },
    defaultBackground: "gradient",
    swatch: { from: "#081119", to: "#1A2F3B", text: "#EAF6FA" },
  },
  {
    id: "soft-sage",
    name: "Soft Sage",
    description:
      "A calm, muted light theme with sage accents, warm off-white surfaces, and dark readable text.",
    tokens: {
      "--surface-0": "#F2F4EE",
      "--surface-1": "#F8FAF5",
      "--surface-2": "#EAEEE4",
      "--surface-3": "#DCE2D4",
      "--surface-4": "#C6D2BD",
      "--text-strong": "#1D241C",
      "--text-default": "#2C352A",
      "--text-muted": "#55604F",
      "--text-faint": "#7E8A76",
      "--accent-300": "#5C8763",
      "--accent-400": "#40684A",
      "--accent-500": "#2F5138",
      "--accent-600": "#1F3926",
      "--line-soft": "rgba(29,36,28,0.10)",
      "--line-strong": "rgba(29,36,28,0.20)",
      "--bg-tint": "rgba(64,104,74,0.05)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(64,104,74,0.16), transparent 70%)",
    },
    defaultBackground: "paper-grain",
    swatch: { from: "#F8FAF5", to: "#C6D2BD", text: "#1D241C" },
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