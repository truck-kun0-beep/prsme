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

export const PROFILE_TOKENS_BY_THEME: Record<ThemeId, ProfileTokens> = {
  obsidian: OBSIDIAN_TOKENS,
  violet: VIOLET_TOKENS,
  midnight: MIDNIGHT_TOKENS,
  "rose-noir": ROSE_TOKENS,
  paper: PAPER_TOKENS,
};

/** True when a theme is a light theme (drives scrollbar + form control colors). */
export function isLightTheme(theme: ThemeId): boolean {
  return theme === "paper";
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
};

export const TYPOGRAPHY_LIST: TypographyPreset[] = [
  TYPOGRAPHY_PRESETS.serif,
  TYPOGRAPHY_PRESETS.modern,
  TYPOGRAPHY_PRESETS["mono-led"],
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
  "obsidian",
  "violet",
  "midnight",
  "rose-noir",
  "paper",
];

export type { ThemeId, TypographyId, LayoutPreset, BackgroundTreatment, ThemePreset };