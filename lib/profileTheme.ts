/**
 * Profile-scoped semantic theme tokens, typography presets, and global
 * layout presets for the PRSME customization studio.
 *
 * Design contract (Phase 3.1):
 *   - Every profile-facing component consumes *semantic* tokens
 *     (`--pf-*`), never hardcoded violet/blue/pink. A theme switch therefore
 *     recolours the entire profile — including rating badges, interest tags,
 *     hover/focus states, borders, metadata, social controls, and empty
 *     states — from one source of truth.
 *   - The tokens are emitted as CSS custom properties on a *scope* element
 *     (`.profile-scope`), not on `:root`. That keeps profile theming from
 *     leaking into the studio editor chrome, which uses the site tokens.
 *   - Typography presets declare three font variables (display / body /
 *     meta) so a preset visibly changes headings, body copy, and metadata
 *     without forcing mono onto long paragraphs.
 *   - Global layout presets declare a content-canvas width, section rhythm,
 *     and type scale so "Editorial", "Balanced", and "Compact" produce
 *     structurally different pages — not just relabeled ones.
 */

import type {
  ThemeId,
  TypographyId,
  LayoutPreset,
  BackgroundTreatment,
  ThemePreset,
} from "./themeTypes";

/* -------------------------------------------------------------------------- */
/*                             Profile token palette                           */
/* -------------------------------------------------------------------------- */

/**
 * The complete set of profile-scoped semantic tokens. Every preset supplies a
 * value for *every* key so a theme is always internally consistent — there is
 * no partially-defined palette and no accidental fallback to violet.
 */
export interface ProfileTokens {
  /* Surfaces */
  "--pf-bg": string;
  "--pf-surface-1": string;
  "--pf-surface-2": string;
  "--pf-surface-3": string;
  /* Text */
  "--pf-text-strong": string;
  "--pf-text": string;
  "--pf-text-muted": string;
  "--pf-text-faint": string;
  /* Lines + accents */
  "--pf-border": string;
  "--pf-border-strong": string;
  "--pf-accent": string;
  "--pf-accent-strong": string;
  "--pf-accent-fg": string;
  "--pf-accent-soft": string;
  /* Interaction */
  "--pf-hover": string;
  "--pf-focus-ring": string;
  /* Specialized */
  "--pf-rating": string;
  "--pf-rating-bg": string;
  "--pf-rating-border": string;
  /*
   * Phase 4.2 — contrast-aware rating surfaces.
   *
   * - `--pf-rating-solid` is the chip's *opaque* body, so the score stays
   *   legible across posters and dark/light backgrounds alike.
   * - `--pf-rating-border-strong` is the border that meets the body, so the
   *   chip keeps a visible edge against any background surface.
   */
  "--pf-rating-solid": string;
  "--pf-rating-border-strong": string;
  "--pf-tag-bg": string;
  "--pf-tag-text": string;
  "--pf-tag-border": string;
  "--pf-meta": string;
  "--pf-overlay-from": string;
  "--pf-overlay-via": string;
}

const OBSIDIAN_TOKENS: ProfileTokens = {
  "--pf-bg": "#07070B",
  "--pf-surface-1": "#0B0B10",
  "--pf-surface-2": "#101018",
  "--pf-surface-3": "#161622",
  "--pf-text-strong": "#F4F4F6",
  "--pf-text": "#E6E6EC",
  "--pf-text-muted": "#9A9AAA",
  "--pf-text-faint": "#6F6F80",
  "--pf-border": "rgba(255,255,255,0.08)",
  "--pf-border-strong": "rgba(255,255,255,0.14)",
  "--pf-accent": "#A892FF",
  "--pf-accent-strong": "#8C6CFF",
  "--pf-accent-fg": "#0B0B10",
  "--pf-accent-soft": "rgba(168,146,255,0.14)",
  "--pf-hover": "rgba(168,146,255,0.10)",
  "--pf-focus-ring": "rgba(168,146,255,0.55)",
  "--pf-rating": "#C4B5FD",
  "--pf-rating-bg": "rgba(168,146,255,0.12)",
  "--pf-rating-border": "rgba(168,146,255,0.32)",
  "--pf-rating-solid": "#1A1530",
  "--pf-rating-border-strong": "#3F2F7A",
  "--pf-tag-bg": "rgba(255,255,255,0.05)",
  "--pf-tag-text": "#C9C9D4",
  "--pf-tag-border": "rgba(255,255,255,0.10)",
  "--pf-meta": "#6F6F80",
  "--pf-overlay-from": "rgba(7,7,11,0.92)",
  "--pf-overlay-via": "rgba(7,7,11,0.55)",
};

const VIOLET_TOKENS: ProfileTokens = {
  "--pf-bg": "#0E0820",
  "--pf-surface-1": "#150A2E",
  "--pf-surface-2": "#1B0F3A",
  "--pf-surface-3": "#241548",
  "--pf-text-strong": "#F6F2FF",
  "--pf-text": "#E2D6FA",
  "--pf-text-muted": "#A99ACF",
  "--pf-text-faint": "#7F70A6",
  "--pf-border": "rgba(196,168,255,0.12)",
  "--pf-border-strong": "rgba(196,168,255,0.20)",
  "--pf-accent": "#C4A8FF",
  "--pf-accent-strong": "#A582FF",
  "--pf-accent-fg": "#150A2E",
  "--pf-accent-soft": "rgba(196,168,255,0.16)",
  "--pf-hover": "rgba(196,168,255,0.12)",
  "--pf-focus-ring": "rgba(196,168,255,0.60)",
  "--pf-rating": "#D8C6FF",
  "--pf-rating-bg": "rgba(196,168,255,0.14)",
  "--pf-rating-border": "rgba(196,168,255,0.34)",
  "--pf-rating-solid": "#251245",
  "--pf-rating-border-strong": "#5A3FAB",
  "--pf-tag-bg": "rgba(196,168,255,0.10)",
  "--pf-tag-text": "#DCCFFF",
  "--pf-tag-border": "rgba(196,168,255,0.20)",
  "--pf-meta": "#8A79B4",
  "--pf-overlay-from": "rgba(14,8,32,0.94)",
  "--pf-overlay-via": "rgba(14,8,32,0.58)",
};

const MIDNIGHT_TOKENS: ProfileTokens = {
  /* Deliberately blue/cyan — no violet survives in this theme. */
  "--pf-bg": "#04080F",
  "--pf-surface-1": "#080F1A",
  "--pf-surface-2": "#0C1726",
  "--pf-surface-3": "#112036",
  "--pf-text-strong": "#EEF4FF",
  "--pf-text": "#D6E2F4",
  "--pf-text-muted": "#93A6C6",
  "--pf-text-faint": "#5F7195",
  "--pf-border": "rgba(134,181,255,0.12)",
  "--pf-border-strong": "rgba(134,181,255,0.22)",
  "--pf-accent": "#7DD3FC",
  "--pf-accent-strong": "#38BDF8",
  "--pf-accent-fg": "#04121F",
  "--pf-accent-soft": "rgba(125,211,252,0.16)",
  "--pf-hover": "rgba(125,211,252,0.12)",
  "--pf-focus-ring": "rgba(125,211,252,0.62)",
  "--pf-rating": "#7DD3FC",
  "--pf-rating-bg": "rgba(125,211,252,0.14)",
  "--pf-rating-border": "rgba(125,211,252,0.34)",
  "--pf-rating-solid": "#0A1828",
  "--pf-rating-border-strong": "#1B5A82",
  "--pf-tag-bg": "rgba(134,181,255,0.10)",
  "--pf-tag-text": "#BBD6F5",
  "--pf-tag-border": "rgba(134,181,255,0.22)",
  "--pf-meta": "#6B82A6",
  "--pf-overlay-from": "rgba(4,8,15,0.94)",
  "--pf-overlay-via": "rgba(4,8,15,0.58)",
};

const ROSE_TOKENS: ProfileTokens = {
  "--pf-bg": "#0E0709",
  "--pf-surface-1": "#160B0F",
  "--pf-surface-2": "#1F0F14",
  "--pf-surface-3": "#2A1419",
  "--pf-text-strong": "#FFEFEF",
  "--pf-text": "#EDD3D5",
  "--pf-text-muted": "#B39899",
  "--pf-text-faint": "#7C6364",
  "--pf-border": "rgba(233,165,168,0.12)",
  "--pf-border-strong": "rgba(233,165,168,0.22)",
  "--pf-accent": "#E9A5A8",
  "--pf-accent-strong": "#D6757B",
  "--pf-accent-fg": "#1A0A0D",
  "--pf-accent-soft": "rgba(233,165,168,0.16)",
  "--pf-hover": "rgba(233,165,168,0.12)",
  "--pf-focus-ring": "rgba(233,165,168,0.60)",
  "--pf-rating": "#F0B7B9",
  "--pf-rating-bg": "rgba(233,165,168,0.14)",
  "--pf-rating-border": "rgba(233,165,168,0.34)",
  "--pf-rating-solid": "#2A1216",
  "--pf-rating-border-strong": "#7C3F45",
  "--pf-tag-bg": "rgba(233,165,168,0.10)",
  "--pf-tag-text": "#EBD0D1",
  "--pf-tag-border": "rgba(233,165,168,0.22)",
  "--pf-meta": "#8E7172",
  "--pf-overlay-from": "rgba(14,7,9,0.94)",
  "--pf-overlay-via": "rgba(14,7,9,0.58)",
};

const PAPER_TOKENS: ProfileTokens = {
  /* A genuine light theme: dark ink, paper surfaces, readable borders. */
  "--pf-bg": "#F7F4EE",
  "--pf-surface-1": "#FBF8F2",
  "--pf-surface-2": "#F1ECE2",
  "--pf-surface-3": "#E5DDCB",
  "--pf-text-strong": "#1B1B1F",
  "--pf-text": "#2A2A30",
  "--pf-text-muted": "#5C5C66",
  "--pf-text-faint": "#8A8A95",
  "--pf-border": "rgba(27,27,31,0.12)",
  "--pf-border-strong": "rgba(27,27,31,0.22)",
  "--pf-accent": "#4A38C2",
  "--pf-accent-strong": "#3A2A99",
  "--pf-accent-fg": "#FFFFFF",
  "--pf-accent-soft": "rgba(74,56,194,0.10)",
  "--pf-hover": "rgba(74,56,194,0.08)",
  "--pf-focus-ring": "rgba(74,56,194,0.50)",
  "--pf-rating": "#3A2A99",
  "--pf-rating-bg": "rgba(74,56,194,0.09)",
  "--pf-rating-border": "rgba(74,56,194,0.28)",
  "--pf-rating-solid": "#FFFFFF",
  "--pf-rating-border-strong": "#5B4AB6",
  "--pf-tag-bg": "rgba(27,27,31,0.045)",
  "--pf-tag-text": "#3A3A42",
  "--pf-tag-border": "rgba(27,27,31,0.14)",
  "--pf-meta": "#7A7A85",
  "--pf-overlay-from": "rgba(251,248,242,0.94)",
  "--pf-overlay-via": "rgba(251,248,242,0.62)",
};

/* -------------------------------------------------------------------------- */
/*                        Phase 4.3 — six new themes                           */
/* -------------------------------------------------------------------------- */

/*
 * These six were added for Phase 4.3. Each is a *complete* palette — surfaces,
 * text, borders, accents, ratings, tags, and overlays all move together — and
 * none is an accent-only reskin of an existing preset.
 *
 * The contrast floor that shaped the values below: body text and metadata sit
 * at >= 4.5:1 against their own surface, and `--pf-rating-solid` (the rating
 * chip body) is always an opaque colour so a score stays legible over a bright
 * poster as well as over a dark page.
 */

/** Forest After Dark — deep green ground, muted sage highlights. */
const FOREST_TOKENS: ProfileTokens = {
  "--pf-bg": "#060D0A",
  "--pf-surface-1": "#0A1410",
  "--pf-surface-2": "#0F1D17",
  "--pf-surface-3": "#15281F",
  "--pf-text-strong": "#EDF5EF",
  "--pf-text": "#D6E5DA",
  "--pf-text-muted": "#93AC9C",
  "--pf-text-faint": "#647C6D",
  "--pf-border": "rgba(167,205,182,0.12)",
  "--pf-border-strong": "rgba(167,205,182,0.22)",
  "--pf-accent": "#A7CDB6",
  "--pf-accent-strong": "#84B79A",
  "--pf-accent-fg": "#06120C",
  "--pf-accent-soft": "rgba(167,205,182,0.15)",
  "--pf-hover": "rgba(167,205,182,0.11)",
  "--pf-focus-ring": "rgba(167,205,182,0.58)",
  "--pf-rating": "#B9DCC6",
  "--pf-rating-bg": "rgba(167,205,182,0.14)",
  "--pf-rating-border": "rgba(167,205,182,0.34)",
  "--pf-rating-solid": "#0C1E16",
  "--pf-rating-border-strong": "#3A6249",
  "--pf-tag-bg": "rgba(167,205,182,0.09)",
  "--pf-tag-text": "#C3DACB",
  "--pf-tag-border": "rgba(167,205,182,0.20)",
  "--pf-meta": "#6E8778",
  "--pf-overlay-from": "rgba(6,13,10,0.94)",
  "--pf-overlay-via": "rgba(6,13,10,0.58)",
};

/** Cherry Cola — near-black with oxblood, deep cherry, and warm rose. */
const CHERRY_TOKENS: ProfileTokens = {
  "--pf-bg": "#0C0608",
  "--pf-surface-1": "#140A0D",
  "--pf-surface-2": "#1C0E12",
  "--pf-surface-3": "#261317",
  "--pf-text-strong": "#FDEEEE",
  "--pf-text": "#F0D8D8",
  "--pf-text-muted": "#C09898",
  "--pf-text-faint": "#8A6565",
  "--pf-border": "rgba(228,150,150,0.12)",
  "--pf-border-strong": "rgba(228,150,150,0.22)",
  "--pf-accent": "#E4969A",
  "--pf-accent-strong": "#D26A70",
  "--pf-accent-fg": "#1A0709",
  "--pf-accent-soft": "rgba(228,150,150,0.16)",
  "--pf-hover": "rgba(228,150,150,0.12)",
  "--pf-focus-ring": "rgba(228,150,150,0.58)",
  "--pf-rating": "#F0A8AB",
  "--pf-rating-bg": "rgba(228,150,150,0.14)",
  "--pf-rating-border": "rgba(228,150,150,0.34)",
  "--pf-rating-solid": "#221014",
  "--pf-rating-border-strong": "#78373D",
  "--pf-tag-bg": "rgba(228,150,150,0.09)",
  "--pf-tag-text": "#EFCFCE",
  "--pf-tag-border": "rgba(228,150,150,0.22)",
  "--pf-meta": "#97706F",
  "--pf-overlay-from": "rgba(12,6,8,0.94)",
  "--pf-overlay-via": "rgba(12,6,8,0.58)",
};

/** Silver Screen — monochrome charcoal, silver accents, editorial contrast. */
const SILVER_TOKENS: ProfileTokens = {
  "--pf-bg": "#0A0A0A",
  "--pf-surface-1": "#111111",
  "--pf-surface-2": "#181818",
  "--pf-surface-3": "#212121",
  "--pf-text-strong": "#FAFAFA",
  "--pf-text": "#E4E4E4",
  "--pf-text-muted": "#A3A3A3",
  "--pf-text-faint": "#6E6E6E",
  "--pf-border": "rgba(255,255,255,0.11)",
  "--pf-border-strong": "rgba(255,255,255,0.22)",
  "--pf-accent": "#D4D4D4",
  "--pf-accent-strong": "#B0B0B0",
  "--pf-accent-fg": "#0A0A0A",
  "--pf-accent-soft": "rgba(255,255,255,0.13)",
  "--pf-hover": "rgba(255,255,255,0.09)",
  "--pf-focus-ring": "rgba(255,255,255,0.72)",
  "--pf-rating": "#F0F0F0",
  "--pf-rating-bg": "rgba(255,255,255,0.12)",
  "--pf-rating-border": "rgba(255,255,255,0.32)",
  "--pf-rating-solid": "#1C1C1C",
  "--pf-rating-border-strong": "#5A5A5A",
  "--pf-tag-bg": "rgba(255,255,255,0.06)",
  "--pf-tag-text": "#DCDCDC",
  "--pf-tag-border": "rgba(255,255,255,0.16)",
  "--pf-meta": "#7C7C7C",
  "--pf-overlay-from": "rgba(10,10,10,0.94)",
  "--pf-overlay-via": "rgba(10,10,10,0.60)",
};

/** Amber Film — warm near-black, muted amber and sepia. */
const AMBER_TOKENS: ProfileTokens = {
  "--pf-bg": "#0D0904",
  "--pf-surface-1": "#15100A",
  "--pf-surface-2": "#1D160D",
  "--pf-surface-3": "#271E12",
  "--pf-text-strong": "#FBF2E2",
  "--pf-text": "#EBDDC5",
  "--pf-text-muted": "#BFAA88",
  "--pf-text-faint": "#8A795E",
  "--pf-border": "rgba(226,178,110,0.12)",
  "--pf-border-strong": "rgba(226,178,110,0.22)",
  "--pf-accent": "#E2B26E",
  "--pf-accent-strong": "#C99450",
  "--pf-accent-fg": "#170F05",
  "--pf-accent-soft": "rgba(226,178,110,0.16)",
  "--pf-hover": "rgba(226,178,110,0.11)",
  "--pf-focus-ring": "rgba(226,178,110,0.58)",
  "--pf-rating": "#EFC086",
  "--pf-rating-bg": "rgba(226,178,110,0.14)",
  "--pf-rating-border": "rgba(226,178,110,0.34)",
  "--pf-rating-solid": "#1D160C",
  "--pf-rating-border-strong": "#6E532A",
  "--pf-tag-bg": "rgba(226,178,110,0.09)",
  "--pf-tag-text": "#E8D6B4",
  "--pf-tag-border": "rgba(226,178,110,0.20)",
  "--pf-meta": "#8F7C5D",
  "--pf-overlay-from": "rgba(13,9,4,0.94)",
  "--pf-overlay-via": "rgba(13,9,4,0.58)",
};

/** Arctic Tide — blue-teal ground with cool ice accents. */
const ARCTIC_TOKENS: ProfileTokens = {
  "--pf-bg": "#04090E",
  "--pf-surface-1": "#081119",
  "--pf-surface-2": "#0C1922",
  "--pf-surface-3": "#12232E",
  "--pf-text-strong": "#EAF6FA",
  "--pf-text": "#CDE3EC",
  "--pf-text-muted": "#8CAAB8",
  "--pf-text-faint": "#5C7884",
  "--pf-border": "rgba(150,214,232,0.12)",
  "--pf-border-strong": "rgba(150,214,232,0.22)",
  "--pf-accent": "#96D6E8",
  "--pf-accent-strong": "#6BBED4",
  "--pf-accent-fg": "#04121A",
  "--pf-accent-soft": "rgba(150,214,232,0.15)",
  "--pf-hover": "rgba(150,214,232,0.11)",
  "--pf-focus-ring": "rgba(150,214,232,0.60)",
  "--pf-rating": "#A8DEEC",
  "--pf-rating-bg": "rgba(150,214,232,0.14)",
  "--pf-rating-border": "rgba(150,214,232,0.34)",
  "--pf-rating-solid": "#0A1A24",
  "--pf-rating-border-strong": "#2C5A6D",
  "--pf-tag-bg": "rgba(150,214,232,0.09)",
  "--pf-tag-text": "#C2DEE9",
  "--pf-tag-border": "rgba(150,214,232,0.20)",
  "--pf-meta": "#6B8A97",
  "--pf-overlay-from": "rgba(4,9,14,0.94)",
  "--pf-overlay-via": "rgba(4,9,14,0.58)",
};

/** Soft Sage — a genuine light theme: warm off-white, sage ink, dark text. */
const SAGE_TOKENS: ProfileTokens = {
  "--pf-bg": "#F2F4EE",
  "--pf-surface-1": "#F8FAF5",
  "--pf-surface-2": "#EAEEE4",
  "--pf-surface-3": "#DCE2D4",
  "--pf-text-strong": "#1D241C",
  "--pf-text": "#2C352A",
  "--pf-text-muted": "#55604F",
  "--pf-text-faint": "#7E8A76",
  "--pf-border": "rgba(29,36,28,0.12)",
  "--pf-border-strong": "rgba(29,36,28,0.22)",
  "--pf-accent": "#40684A",
  "--pf-accent-strong": "#2F5138",
  "--pf-accent-fg": "#FFFFFF",
  "--pf-accent-soft": "rgba(64,104,74,0.10)",
  "--pf-hover": "rgba(64,104,74,0.08)",
  "--pf-focus-ring": "rgba(64,104,74,0.55)",
  "--pf-rating": "#2F5138",
  "--pf-rating-bg": "rgba(64,104,74,0.09)",
  "--pf-rating-border": "rgba(64,104,74,0.28)",
  "--pf-rating-solid": "#FFFFFF",
  "--pf-rating-border-strong": "#5A8464",
  "--pf-tag-bg": "rgba(29,36,28,0.045)",
  "--pf-tag-text": "#37422F",
  "--pf-tag-border": "rgba(29,36,28,0.14)",
  "--pf-meta": "#6E7A66",
  "--pf-overlay-from": "rgba(248,250,245,0.94)",
  "--pf-overlay-via": "rgba(248,250,245,0.62)",
};

export const PROFILE_TOKENS_BY_THEME: Record<ThemeId, ProfileTokens> = {
  obsidian: OBSIDIAN_TOKENS,
  violet: VIOLET_TOKENS,
  midnight: MIDNIGHT_TOKENS,
  "rose-noir": ROSE_TOKENS,
  paper: PAPER_TOKENS,
  "forest-dark": FOREST_TOKENS,
  "cherry-cola": CHERRY_TOKENS,
  "silver-screen": SILVER_TOKENS,
  "amber-film": AMBER_TOKENS,
  "arctic-tide": ARCTIC_TOKENS,
  "soft-sage": SAGE_TOKENS,
};

/** True when a theme is a light theme (drives scrollbar + form control colors). */
export function isLightTheme(theme: ThemeId): boolean {
  return LIGHT_THEMES.includes(theme);
}

/* -------------------------------------------------------------------------- */
/*                                  Typography                                  */
/* -------------------------------------------------------------------------- */

/**
 * Typography presets. Three font roles per preset:
 *   - `display`  → profile name, section headings, collection headings
 *   - `body`     → biography, review excerpts, long-form copy
 *   - `meta`     → eyebrows, item metadata, tags, counts
 *
 * Mono is only ever assigned to `display` + `meta`; body copy always stays on
 * a legible sans or serif so long paragraphs are never set in monospace.
 */
export interface TypographyPreset {
  id: TypographyId;
  name: string;
  description: string;
  display: string;
  body: string;
  meta: string;
  /** Display tracking (em). */
  displayTracking: string;
  /** Scale factor applied to display sizes so presets read at a distinct size. */
  displayScale: number;
  /** Display weight. */
  displayWeight: number;
}

export const TYPOGRAPHY_PRESETS: Record<TypographyId, TypographyPreset> = {
  serif: {
    id: "serif",
    name: "Editorial",
    description:
      "Instrument Serif for expressive headings, Inter for body copy.",
    display: `var(--font-display), ui-serif, Georgia, serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.02em",
    displayScale: 1.16,
    displayWeight: 400,
  },
  modern: {
    id: "modern",
    name: "Modern",
    description:
      "Inter throughout — tight tracking and a heavier display weight.",
    display: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.035em",
    displayScale: 1,
    displayWeight: 700,
  },
  "mono-led": {
    id: "mono-led",
    name: "Typewriter",
    description:
      "JetBrains Mono for display and metadata, Inter for readable body copy.",
    display: `var(--font-mono), ui-monospace, monospace`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-mono), ui-monospace, monospace`,
    displayTracking: "-0.03em",
    displayScale: 0.94,
    displayWeight: 500,
  },

  /* ---- Phase 4.3: five additional voices -------------------------------
   *
   * Each one moves at least two of the three roles, so switching presets is
   * visible in the *computed* font families rather than in a label. Body copy
   * stays on a legible sans or serif everywhere; monospace is only ever
   * assigned to metadata (and, in the two typewriter-style presets, to the
   * display face as well).
   */
  contemporary: {
    id: "contemporary",
    name: "Contemporary",
    description:
      "Space Grotesk headings over Inter body copy — geometric, current, sharp.",
    display: `var(--font-grotesk), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.03em",
    displayScale: 1.02,
    displayWeight: 600,
  },
  "soft-editorial": {
    id: "soft-editorial",
    name: "Soft Editorial",
    description:
      "Cormorant Garamond headings with DM Sans body — literary and high-contrast.",
    display: `var(--font-cormorant), ui-serif, Georgia, serif`,
    body: `var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.005em",
    displayScale: 1.24,
    displayWeight: 500,
  },
  manrope: {
    id: "manrope",
    name: "Manrope",
    description:
      "A single geometric sans across headings, body, and metadata. Quiet and unified.",
    display: `var(--font-manrope), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-manrope), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-manrope), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.028em",
    displayScale: 1.05,
    displayWeight: 700,
  },
  archive: {
    id: "archive",
    name: "Archive",
    description:
      "Instrument Serif headings with restrained IBM Plex Mono metadata — a catalogue feel.",
    display: `var(--font-display), ui-serif, Georgia, serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-plex-mono), ui-monospace, monospace`,
    displayTracking: "-0.015em",
    displayScale: 1.14,
    displayWeight: 400,
  },
  playful: {
    id: "playful",
    name: "Playful Minimal",
    description:
      "Outfit headings with a compact DM Sans body — characterful but restrained.",
    display: `var(--font-outfit), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.035em",
    displayScale: 1.08,
    displayWeight: 600,
  },
};

export const TYPOGRAPHY_LIST: TypographyPreset[] = [
  /* Phase 3 — preserved. */
  TYPOGRAPHY_PRESETS.serif,
  TYPOGRAPHY_PRESETS.modern,
  TYPOGRAPHY_PRESETS["mono-led"],
  /* Phase 4.3 — five new voices. */
  TYPOGRAPHY_PRESETS.contemporary,
  TYPOGRAPHY_PRESETS["soft-editorial"],
  TYPOGRAPHY_PRESETS.manrope,
  TYPOGRAPHY_PRESETS.archive,
  TYPOGRAPHY_PRESETS.playful,
];

/* -------------------------------------------------------------------------- */
/*                            Global layout presets                            */
/* -------------------------------------------------------------------------- */

/**
 * Global profile layout. This is the *page* composition (canvas width, section
 * rhythm, type scale, header arrangement) and is deliberately separate from a
 * collection's own display layout (poster-grid / featured / compact).
 *
 * Each preset changes real structure:
 *   - `canvas`:      max content width in px on desktop
 *   - `sectionGap`:  vertical rhythm between sections
 *   - `displayScale`: type scale multiplier for headings
 *   - `metaScale`:   type scale multiplier for metadata
 *   - `headerSplit`: desktop header grid split ("stacked" puts the avatar above)
 */
export interface LayoutPresetDefinition {
  id: LayoutPreset;
  name: string;
  description: string;
  canvas: number;
  sectionGap: string;
  displayScale: number;
  metaScale: number;
  headerSplit: "side" | "stacked";
  /** Max width for the profile identity block. */
  identityWidth: string;
}

export const LAYOUT_PRESET_DEFS: Record<LayoutPreset, LayoutPresetDefinition> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    description:
      "Wide canvas, generous section rhythm, expressive display type.",
    canvas: 1360,
    sectionGap: "clamp(4rem, 9vw, 8rem)",
    displayScale: 1.12,
    metaScale: 1,
    headerSplit: "side",
    identityWidth: "46rem",
  },
  poster: {
    id: "poster",
    name: "Balanced",
    description:
      "Moderate width and rhythm. Comfortable poster and featured sizing.",
    canvas: 1120,
    sectionGap: "clamp(3rem, 6vw, 5.5rem)",
    displayScale: 1,
    metaScale: 0.95,
    headerSplit: "side",
    identityWidth: "40rem",
  },
  compact: {
    id: "compact",
    name: "Compact",
    description:
      "Tighter rhythm, smaller metadata, denser but still readable.",
    canvas: 940,
    sectionGap: "clamp(1.75rem, 3.5vw, 3rem)",
    displayScale: 0.9,
    metaScale: 0.85,
    headerSplit: "stacked",
    identityWidth: "34rem",
  },
};

export const LAYOUT_LIST: LayoutPresetDefinition[] = [
  LAYOUT_PRESET_DEFS.editorial,
  LAYOUT_PRESET_DEFS.poster,
  LAYOUT_PRESET_DEFS.compact,
];

/* -------------------------------------------------------------------------- */
/*                                  Backgrounds                                 */
/* -------------------------------------------------------------------------- */

export const BACKGROUND_OPTIONS: Array<{
  id: BackgroundTreatment;
  name: string;
  description: string;
}> = [
  {
    id: "solid",
    name: "Solid",
    description: "Single surface colour. Calm and readable.",
  },
  {
    id: "gradient",
    name: "Gradient",
    description: "Soft accent lift behind the top of the page.",
  },
  {
    id: "paper-grain",
    name: "Paper",
    description: "Fine grain texture over the surface colour.",
  },
];

/* -------------------------------------------------------------------------- */
/*                             CSS serialisation                               */
/* -------------------------------------------------------------------------- */

/**
 * Serialize the profile scope class + inline variables for a given appearance.
 * The returned object is spread onto the `.profile-scope` wrapper so every
 * descendant resolves the same tokens. Because `--pf-*` are set on the scope
 * (not `:root`), the studio chrome is unaffected.
 */
export function profileScopeStyle(input: {
  theme: ThemeId;
  typography: TypographyId;
  layout: LayoutPreset;
  background: BackgroundTreatment;
  /** Optional owner-supplied accent override (hex). */
  accentOverride?: string | null;
}): React.CSSProperties & Record<string, string> {
  const tokens = { ...PROFILE_TOKENS_BY_THEME[input.theme] };
  const typo = TYPOGRAPHY_PRESETS[input.typography] ?? TYPOGRAPHY_PRESETS.serif;
  const layout = LAYOUT_PRESET_DEFS[input.layout] ?? LAYOUT_PRESET_DEFS.poster;

  // Owner accent override: replace the accent family coherently. The user
  // only supplies one colour, so we derive the surrounding accent states from
  // it via color-mix so the theme stays internally consistent.
  if (input.accentOverride && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.accentOverride)) {
    const hex = input.accentOverride;
    tokens["--pf-accent"] = hex;
    tokens["--pf-accent-strong"] = `color-mix(in oklab, ${hex} 88%, black)`;
    tokens["--pf-accent-soft"] = `color-mix(in oklab, ${hex} 16%, transparent)`;
    tokens["--pf-hover"] = `color-mix(in oklab, ${hex} 11%, transparent)`;
    tokens["--pf-focus-ring"] = `color-mix(in oklab, ${hex} 58%, transparent)`;
    tokens["--pf-rating"] = hex;
    tokens["--pf-rating-bg"] = `color-mix(in oklab, ${hex} 13%, transparent)`;
    tokens["--pf-rating-border"] = `color-mix(in oklab, ${hex} 34%, transparent)`;
    tokens["--pf-rating-solid"] = `color-mix(in oklab, ${hex} 22%, #0B0B10)`;
    tokens["--pf-rating-border-strong"] = `color-mix(in oklab, ${hex} 60%, #0B0B10)`;
  }

  const style: Record<string, string> = {
    ...tokens,
    /* Typography */
    "--pf-font-display": typo.display,
    "--pf-font-body": typo.body,
    "--pf-font-meta": typo.meta,
    "--pf-display-tracking": typo.displayTracking,
    "--pf-display-scale": String(typo.displayScale),
    "--pf-display-weight": String(typo.displayWeight),
    /* Layout */
    "--pf-canvas": `${layout.canvas}px`,
    "--pf-section-gap": layout.sectionGap,
    "--pf-layout-display-scale": String(layout.displayScale),
    "--pf-meta-scale": String(layout.metaScale),
    "--pf-identity-width": layout.identityWidth,
    /* Background treatment */
    "--pf-bg-image": backgroundImage(input.background, input.theme),
  };

  return style as React.CSSProperties & Record<string, string>;
}

function backgroundImage(bg: BackgroundTreatment, theme: ThemeId): string {
  if (bg === "paper-grain") {
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.35'/></svg>")`;
  }
  if (bg === "gradient") {
    const accent = PROFILE_TOKENS_BY_THEME[theme]["--pf-accent"];
    return `radial-gradient(70% 46% at 50% 0%, color-mix(in oklab, ${accent} 16%, transparent), transparent 72%)`;
  }
  return "none";
}

/** The scope class every profile surface must sit inside. */
export const PROFILE_SCOPE_CLASS = "profile-scope";

/** Re-exported so consumers can build the theme id list without importing lib/theme. */
export const THEME_IDS_ALL: ThemeId[] = [
  /* Phase 3 — preserved. */
  "obsidian",
  "violet",
  "midnight",
  "rose-noir",
  "paper",
  /* Phase 4.3 — six new palettes. */
  "forest-dark",
  "cherry-cola",
  "silver-screen",
  "amber-film",
  "arctic-tide",
  "soft-sage",
];

/** Themes whose body surface is light — used to flip form/scrollbar colours. */
export const LIGHT_THEMES: ThemeId[] = ["paper", "soft-sage"];

export type { ThemeId, TypographyId, LayoutPreset, BackgroundTreatment, ThemePreset };