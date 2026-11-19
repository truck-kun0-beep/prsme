/**
 * Shared theme type definitions. Extracted from `theme.ts` so both the legacy
 * theme registry (used by Phase 3) and the new profile-scoped token layer
 * (`profileTheme.ts`) can reference them without a circular dependency.
 */

/**
 * Profile theme presets.
 *
 * Pre-Phase 11 shipped eleven palettes. The curation pass merged the four
 * genuinely redundant pairs and replaced them with four more distinct
 * identities, so the collection is now ten:
 *
 *   obsidian      neutral dark, the PRSME default
 *   violet        saturated violet
 *   cobalt        electric blue / cobalt
 *   oxblood       burgundy and oxblood
 *   moss          deep green
 *   silver        monochrome
 *   amber         warm amber and sepia
 *   arctic        teal / icy blue
 *   terracotta    warm clay and rust
 *   porcelain     the light theme
 *
 * The removed ids (`rose-noir`, `midnight`, `forest-dark`, `soft-sage`,
 * `paper`) are NOT valid theme ids any more. They are accepted as *legacy
 * aliases* — see `LEGACY_THEME_ALIASES` in `theme.ts` — so a profile saved
 * before this change still renders, in the closest retained palette, instead
 * of falling back to the default.
 */
export type ThemeId =
  | "obsidian"
  | "violet"
  | "cobalt"
  | "oxblood"
  | "moss"
  | "silver"
  | "amber"
  | "arctic"
  | "terracotta"
  | "porcelain";

/**
 * Typography presets. Each declares a display / body / meta trio, so the
 * choice visibly changes headings, long copy, and metadata independently.
 */
export type TypographyId =
  /* The eight that shipped before this phase — kept exactly as they were. */
  | "serif"
  | "modern"
  | "mono-led"
  | "contemporary"
  | "soft-editorial"
  | "manrope"
  | "archive"
  | "playful"
  /* Four new voices, each a genuinely different family. */
  | "sora"
  | "fraunces"
  | "jakarta"
  | "bricolage";

/**
 * Global profile layout. Three presets produce structurally different pages:
 * `editorial` (wide canvas, generous rhythm), `poster` (balanced default),
 * `compact` (tight rhythm and density).
 */
export type LayoutPreset = "editorial" | "poster" | "compact";

/**
 * How the page sits behind the profile content.
 *
 * The `paper-grain` mode was removed in Pre-Phase 11. The light theme is now
 * `porcelain`, which is a curated *theme* rather than a background texture —
 * a light page is a different colour scheme, not a grain overlay on a dark one.
 */
export type BackgroundTreatment = "solid" | "gradient";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  tokens: Record<string, string>;
  defaultBackground: BackgroundTreatment;
  swatch: { from: string; to: string; text: string };
}
