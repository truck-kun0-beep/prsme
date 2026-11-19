/**
 * Theme registry for the PRSME customization studio.
 *
 * The registry holds the *displayable* data for each preset — name, blurb,
 * swatch, and the site-level token map the studio chrome uses. The paint
 * applied to a public profile comes from the profile-scoped tokens in
 * `profileTheme.ts`, and the two describe the same palette.
 *
 * PRE-PHASE 11 CURATION
 *
 * The collection was eleven palettes, and several of them were the same
 * palette with a different accent. This file now carries ten genuinely
 * distinct identities:
 *
 *   obsidian    neutral dark — the default
 *   violet      saturated violet
 *   cobalt      electric blue
 *   oxblood     burgundy / oxblood
 *   moss        deep green
 *   silver      monochrome
 *   amber       warm amber / sepia
 *   arctic      teal / icy blue
 *   terracotta  warm clay / rust
 *   porcelain   the light theme
 *
 * The merges, and what each removed id became:
 *
 *   rose-noir   → oxblood      (both were low-chroma burgundy/rose on near-black)
 *   midnight    → cobalt       (both were deep blue with a cool accent)
 *   arctic-tide → arctic       (the retained teal; midnight folded into cobalt)
 *   forest-dark → moss         (both were deep green with sage accents)
 *   soft-sage   → porcelain    (the light theme, renamed and re-tinted warm)
 *   paper       → porcelain    (the other light theme, merged into it)
 *
 * `cherry-cola` became `oxblood` and `violet`/`obsidian`/`silver-screen`/
 * `amber-film` were renamed to the shorter names above. The old ids all still
 * resolve — see `LEGACY_THEME_ALIASES` — so a saved profile keeps its
 * appearance instead of snapping to the default.
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
      "Cinematic neutral dark with a restrained lavender accent — the PRSME default.",
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
      "--glass-surface": "rgba(255, 255, 255, 0.055)",
      "--glass-border": "rgba(255, 255, 255, 0.10)",
      "--glass-highlight": "rgba(255, 255, 255, 0.07)",
      "--glass-sheen": "rgba(168, 146, 255, 0.16)",
      "--glass-blur": "14px",
    },
    defaultBackground: "solid",
    swatch: { from: "#0B0B10", to: "#1E1E2C", text: "#F4F4F6" },
  },
  {
    id: "violet",
    name: "Violet Haze",
    description:
      "Saturated violet — a deep purple ground with a lavender glow, deliberately not neutral black.",
    tokens: {
      "--surface-0": "#120727",
      "--surface-1": "#1B0B3C",
      "--surface-2": "#251052",
      "--surface-3": "#31176C",
      "--surface-4": "#41218C",
      "--text-strong": "#F8F3FF",
      "--text-default": "#E6DAFB",
      "--text-muted": "#AD9BD6",
      "--text-faint": "#8271AA",
      "--accent-300": "#D3B6FF",
      "--accent-400": "#B78DFF",
      "--accent-500": "#9B5CFF",
      "--accent-600": "#7A38DB",
      "--line-soft": "rgba(211,182,255,0.14)",
      "--line-strong": "rgba(211,182,255,0.24)",
      "--bg-tint": "rgba(155,92,255,0.12)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(155,92,255,0.26), transparent 70%)",
      "--glass-surface": "rgba(211, 182, 255, 0.07)",
      "--glass-border": "rgba(211, 182, 255, 0.16)",
      "--glass-highlight": "rgba(211, 182, 255, 0.10)",
      "--glass-sheen": "rgba(211, 182, 255, 0.20)",
      "--glass-blur": "16px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#1B0B3C", to: "#41218C", text: "#F8F3FF" },
  },
  {
    id: "cobalt",
    name: "Electric Cobalt",
    description:
      "A vivid cobalt blue with an azure accent — bright and digital against a deep navy ground.",
    tokens: {
      "--surface-0": "#04101F",
      "--surface-1": "#071A31",
      "--surface-2": "#0B2445",
      "--surface-3": "#10305C",
      "--surface-4": "#17427C",
      "--text-strong": "#EAF3FF",
      "--text-default": "#CFE2FA",
      "--text-muted": "#8FADD4",
      "--text-faint": "#5C7DA6",
      "--accent-300": "#93C5FF",
      "--accent-400": "#4DA3FF",
      "--accent-500": "#1E7BF5",
      "--accent-600": "#0A57C4",
      "--line-soft": "rgba(147,197,255,0.14)",
      "--line-strong": "rgba(147,197,255,0.26)",
      "--bg-tint": "rgba(30,123,245,0.10)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(30,123,245,0.24), transparent 70%)",
      "--glass-surface": "rgba(147, 197, 255, 0.07)",
      "--glass-border": "rgba(147, 197, 255, 0.16)",
      "--glass-highlight": "rgba(147, 197, 255, 0.10)",
      "--glass-sheen": "rgba(147, 197, 255, 0.20)",
      "--glass-blur": "16px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#071A31", to: "#17427C", text: "#EAF3FF" },
  },
  {
    id: "oxblood",
    name: "Oxblood",
    description:
      "Burgundy and oxblood with a warm rose accent — dark, heavy, and a little dramatic.",
    tokens: {
      "--surface-0": "#0F0708",
      "--surface-1": "#180B0D",
      "--surface-2": "#220F12",
      "--surface-3": "#2E1519",
      "--surface-4": "#3D1D22",
      "--text-strong": "#FCEEEE",
      "--text-default": "#F0D7D6",
      "--text-muted": "#C19795",
      "--text-faint": "#8B6462",
      "--accent-300": "#F6B9AE",
      "--accent-400": "#E49182",
      "--accent-500": "#CE6A58",
      "--accent-600": "#A84A3C",
      "--line-soft": "rgba(246,185,174,0.12)",
      "--line-strong": "rgba(246,185,174,0.24)",
      "--bg-tint": "rgba(206,106,88,0.09)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(206,106,88,0.22), transparent 70%)",
      "--glass-surface": "rgba(246, 185, 174, 0.06)",
      "--glass-border": "rgba(246, 185, 174, 0.15)",
      "--glass-highlight": "rgba(246, 185, 174, 0.09)",
      "--glass-sheen": "rgba(246, 185, 174, 0.18)",
      "--glass-blur": "15px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#180B0D", to: "#3D1D22", text: "#FCEEEE" },
  },
  {
    id: "moss",
    name: "Deep Moss",
    description:
      "Deep forest green with a mossy accent — botanical, quiet, and grounded.",
    tokens: {
      "--surface-0": "#06100A",
      "--surface-1": "#0A1911",
      "--surface-2": "#0F2419",
      "--surface-3": "#163121",
      "--surface-4": "#1F412B",
      "--text-strong": "#EEF6EF",
      "--text-default": "#D5E6D9",
      "--text-muted": "#90AC98",
      "--text-faint": "#617C6C",
      "--accent-300": "#C6E7A8",
      "--accent-400": "#9FCB7A",
      "--accent-500": "#78A94F",
      "--accent-600": "#557F34",
      "--line-soft": "rgba(198,231,168,0.12)",
      "--line-strong": "rgba(198,231,168,0.24)",
      "--bg-tint": "rgba(120,169,79,0.08)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(120,169,79,0.20), transparent 70%)",
      "--glass-surface": "rgba(198, 231, 168, 0.06)",
      "--glass-border": "rgba(198, 231, 168, 0.15)",
      "--glass-highlight": "rgba(198, 231, 168, 0.09)",
      "--glass-sheen": "rgba(198, 231, 168, 0.18)",
      "--glass-blur": "15px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#0A1911", to: "#1F412B", text: "#EEF6EF" },
  },
  {
    id: "silver",
    name: "Silver Screen",
    description:
      "True monochrome — charcoal surfaces and silver accents, with no colour at all.",
    tokens: {
      "--surface-0": "#08080A",
      "--surface-1": "#0F0F11",
      "--surface-2": "#161618",
      "--surface-3": "#1E1E21",
      "--surface-4": "#2B2B2F",
      "--text-strong": "#FAFAFA",
      "--text-default": "#E4E4E4",
      "--text-muted": "#A3A3A3",
      "--text-faint": "#6E6E6E",
      "--accent-300": "#EDEDED",
      "--accent-400": "#D4D4D4",
      "--accent-500": "#B0B0B0",
      "--accent-600": "#8A8A8A",
      "--line-soft": "rgba(255,255,255,0.11)",
      "--line-strong": "rgba(255,255,255,0.22)",
      "--bg-tint": "rgba(255,255,255,0.04)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(255,255,255,0.10), transparent 70%)",
      "--glass-surface": "rgba(255, 255, 255, 0.06)",
      "--glass-border": "rgba(255, 255, 255, 0.14)",
      "--glass-highlight": "rgba(255, 255, 255, 0.08)",
      "--glass-sheen": "rgba(255, 255, 255, 0.12)",
      "--glass-blur": "14px",
    },
    defaultBackground: "solid",
    swatch: { from: "#0F0F11", to: "#2B2B2F", text: "#FAFAFA" },
  },
  {
    id: "amber",
    name: "Amber Film",
    description:
      "Warm sepia near-black with muted amber — a projected-film warmth rather than a cold dark.",
    tokens: {
      "--surface-0": "#0F0A05",
      "--surface-1": "#17110A",
      "--surface-2": "#20180E",
      "--surface-3": "#2B2114",
      "--surface-4": "#3A2C1A",
      "--text-strong": "#FCF4E6",
      "--text-default": "#EEDFC9",
      "--text-muted": "#C4AC8B",
      "--text-faint": "#8E7B60",
      "--accent-300": "#F6CE96",
      "--accent-400": "#E9B571",
      "--accent-500": "#D2954A",
      "--accent-600": "#A76F32",
      "--line-soft": "rgba(233,181,113,0.12)",
      "--line-strong": "rgba(233,181,113,0.24)",
      "--bg-tint": "rgba(210,149,74,0.08)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(210,149,74,0.22), transparent 70%)",
      "--glass-surface": "rgba(233, 181, 113, 0.06)",
      "--glass-border": "rgba(233, 181, 113, 0.15)",
      "--glass-highlight": "rgba(233, 181, 113, 0.09)",
      "--glass-sheen": "rgba(233, 181, 113, 0.18)",
      "--glass-blur": "15px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#17110A", to: "#3A2C1A", text: "#FCF4E6" },
  },
  {
    id: "arctic",
    name: "Arctic Tide",
    description:
      "Icy teal and blue-green — cold, bright, and oceanic, with a distinctly cyan cast.",
    tokens: {
      "--surface-0": "#041013",
      "--surface-1": "#08191E",
      "--surface-2": "#0B242B",
      "--surface-3": "#0F333C",
      "--surface-4": "#154650",
      "--text-strong": "#EAF7FA",
      "--text-default": "#C9E6EC",
      "--text-muted": "#87ABB4",
      "--text-faint": "#5A7F88",
      "--accent-300": "#A8E8F0",
      "--accent-400": "#5FD2DE",
      "--accent-500": "#25B0C4",
      "--accent-600": "#0C8798",
      "--line-soft": "rgba(168,232,240,0.12)",
      "--line-strong": "rgba(168,232,240,0.24)",
      "--bg-tint": "rgba(37,176,196,0.08)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(37,176,196,0.22), transparent 70%)",
      "--glass-surface": "rgba(168, 232, 240, 0.06)",
      "--glass-border": "rgba(168, 232, 240, 0.15)",
      "--glass-highlight": "rgba(168, 232, 240, 0.09)",
      "--glass-sheen": "rgba(168, 232, 240, 0.18)",
      "--glass-blur": "15px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#08191E", to: "#154650", text: "#EAF7FA" },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    description:
      "Warm clay and rust — a genuinely warm palette, closer to fired earth than to a dark UI.",
    tokens: {
      "--surface-0": "#150C08",
      "--surface-1": "#1E120C",
      "--surface-2": "#291811",
      "--surface-3": "#362117",
      "--surface-4": "#472D20",
      "--text-strong": "#FCEFE6",
      "--text-default": "#F0DCCC",
      "--text-muted": "#C7A892",
      "--text-faint": "#917C68",
      "--accent-300": "#F6C09B",
      "--accent-400": "#E39B6B",
      "--accent-500": "#CE7440",
      "--accent-600": "#A65328",
      "--line-soft": "rgba(227,155,107,0.13)",
      "--line-strong": "rgba(227,155,107,0.26)",
      "--bg-tint": "rgba(206,116,64,0.09)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(206,116,64,0.22), transparent 70%)",
      "--glass-surface": "rgba(227, 155, 107, 0.07)",
      "--glass-border": "rgba(227, 155, 107, 0.16)",
      "--glass-highlight": "rgba(227, 155, 107, 0.10)",
      "--glass-sheen": "rgba(227, 155, 107, 0.19)",
      "--glass-blur": "15px",
    },
    defaultBackground: "gradient",
    swatch: { from: "#1E120C", to: "#472D20", text: "#FCEFE6" },
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description:
      "A genuinely light theme — warm paper surfaces, deep ink, and a clay-toned accent.",
    tokens: {
      "--surface-0": "#F4F1EA",
      "--surface-1": "#FBF9F4",
      "--surface-2": "#EFEBE1",
      "--surface-3": "#E2DDD0",
      "--surface-4": "#D0C9B7",
      "--text-strong": "#1B1A18",
      "--text-default": "#2C2A26",
      "--text-muted": "#5C5850",
      "--text-faint": "#8A857A",
      "--accent-300": "#B4552A",
      "--accent-400": "#9C4520",
      "--accent-500": "#7E3517",
      "--accent-600": "#63280F",
      "--line-soft": "rgba(27,26,24,0.10)",
      "--line-strong": "rgba(27,26,24,0.20)",
      "--bg-tint": "rgba(126,53,23,0.03)",
      "--panel-haze":
        "radial-gradient(60% 50% at 50% 0%, rgba(126,53,23,0.07), transparent 70%)",
      "--glass-surface": "rgba(255, 255, 255, 0.62)",
      "--glass-border": "rgba(27, 26, 24, 0.10)",
      "--glass-highlight": "rgba(255, 255, 255, 0.85)",
      "--glass-sheen": "rgba(255, 255, 255, 0.72)",
      "--glass-blur": "12px",
    },
    defaultBackground: "solid",
    swatch: { from: "#FBF9F4", to: "#D0C9B7", text: "#1B1A18" },
  },
];

export const THEME_BY_ID: Record<ThemeId, ThemePreset> = Object.fromEntries(
  THEME_PRESETS.map((t) => [t.id, t]),
) as Record<ThemeId, ThemePreset>;

/**
 * The theme ids that shipped before Pre-Phase 11, and the retained palette each
 * one now resolves to.
 *
 * WHY THIS EXISTS
 *
 * A saved profile stores its theme id in the JSON document the owner wrote.
 * Renaming or merging a preset therefore touches every profile that ever
 * picked the old one. The alternative — silently falling back to the default —
 * would change somebody's page without telling them, which is exactly the
 * "retain the existing appearance of saved profiles as closely as possible"
 * rule.
 *
 * So an old id is *normalised*, never rejected. `normaliseThemeId` maps it to
 * the closest retained palette; the profile still renders, in a colour that
 * matches what it used to be.
 *
 * The mapping is deliberately close rather than merely plausible:
 *
 *   rose-noir   → oxblood    both were low-chroma burgundy/rose on near-black
 *   cherry-cola → oxblood    ditto — this is the pair the brief called out
 *   midnight    → cobalt     both were deep blue with a cool accent
 *   arctic-tide → arctic     the teal palette is retained under its own name
 *   forest-dark → moss       both were deep green with soft accents
 *   soft-sage   → porcelain  the light theme, renamed and re-tinted warm
 *   paper       → porcelain  the other light theme, merged into it
 *   silver-screen → silver   renamed only
 *   amber-film  → amber      renamed only
 */
export const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  /* The four pairs the curation merged. */
  "rose-noir": "oxblood",
  "cherry-cola": "oxblood",
  midnight: "cobalt",
  "arctic-tide": "arctic",
  "forest-dark": "moss",
  "soft-sage": "porcelain",
  paper: "porcelain",
  /* Renames only. */
  "silver-screen": "silver",
  "amber-film": "amber",
};

/**
 * Resolve any stored theme id to a live one.
 *
 * A current id passes straight through. A legacy id maps to its retained
 * palette. Anything unrecognised falls back to the default, because an
 * unknown value has to render *something* and the default is the honest
 * choice.
 */
export function normaliseThemeId(value: unknown): ThemeId {
  if (typeof value !== "string") return DEFAULT_THEME_ID;
  const trimmed = value.trim();
  if (trimmed in THEME_BY_ID) return trimmed as ThemeId;
  const alias = LEGACY_THEME_ALIASES[trimmed];
  if (alias) return alias;
  return DEFAULT_THEME_ID;
}

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
  const preset = THEME_BY_ID[normaliseThemeId(input.theme)];
  return preset.tokens as React.CSSProperties & Record<string, string>;
}
