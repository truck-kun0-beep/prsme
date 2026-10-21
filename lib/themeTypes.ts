/**
 * Shared theme type definitions. Extracted from `theme.ts` so both the legacy
 * theme registry (used by Phase 3) and the new profile-scoped token layer
 * (`profileTheme.ts`) can reference them without a circular dependency.
 */

export type ThemeId = "obsidian" | "violet" | "midnight" | "rose-noir" | "paper";

export type TypographyId = "serif" | "modern" | "mono-led";

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