/**
 * Shared theme type definitions. Extracted from `theme.ts` so both the legacy
 * theme registry (used by Phase 3) and the new profile-scoped token layer
 * (`profileTheme.ts`) can reference them without a circular dependency.
 */

/**
 * Profile theme presets.
 *
 * Phase 3 shipped five (Obsidian, Violet Haze, Midnight Blue, Rose Noir,
 * Paper). Phase 4.3 adds six more, each with a complete `--pf-*` token set in
 * `lib/profileTheme.ts` — never an accent-only variant of an existing theme.
 */
export type ThemeId =
  /* Phase 3 — preserved exactly as shipped. */
  | "obsidian"
  | "violet"
  | "midnight"
  | "rose-noir"
  | "paper"
  /* Phase 4.3 — six genuinely distinct palettes. */
  | "forest-dark"
  | "cherry-cola"
  | "silver-screen"
  | "amber-film"
  | "arctic-tide"
  | "soft-sage";

/**
 * Typography presets. Each declares a display / body / meta trio, so the
 * choice visibly changes headings, long copy, and metadata independently.
 */
export type TypographyId =
  /* Phase 3 — preserved. */
  | "serif"
  | "modern"
  | "mono-led"
  /* Phase 4.3 — five more curated voices. */
  | "contemporary"
  | "soft-editorial"
  | "manrope"
  | "archive"
  | "playful";

/**
 * Global profile layout. Three presets produce structurally different pages:
 * `editorial` (wide canvas, generous rhythm), `poster` (balanced default),
 * `compact` (tight rhythm and density).
 */
export type LayoutPreset = "editorial" | "poster" | "compact";

export type BackgroundTreatment = "solid" | "gradient" | "paper-grain";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  tokens: Record<string, string>;
  defaultBackground: BackgroundTreatment;
  swatch: { from: string; to: string; text: string };
}