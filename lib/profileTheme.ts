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
 *
 * PRE-PHASE 11 CURATION
 *
 * Ten palettes, each a complete token set, each visually distinct at a
 * glance. The old collection held eleven palettes of which four pairs were
 * near-duplicates; those were merged and replaced. See `lib/theme.ts` for the
 * full merge table and the legacy-alias map that keeps old saved profiles
 * rendering in the closest retained palette.
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
  /*
   * PRE-PHASE 11 — the glass family.
   *
   * The liquid-glass treatment is a *token* family, not a hardcoded effect:
   * every theme declares its own glass surface, border, highlight, and sheen,
   * so the glass picks up the palette rather than sitting on top of it as a
   * grey film.
   *
   *   - `--pf-glass-surface`   the translucent fill
   *   - `--pf-glass-border`    the hairline edge
   *   - `--pf-glass-highlight` the specular sheen across the top edge
   *   - `--pf-glass-sheen`     the accent-tinted light that moves on hover
   */
  "--pf-glass-surface": string;
  "--pf-glass-border": string;
  "--pf-glass-highlight": string;
  "--pf-glass-sheen": string;
  /** The blur radius the glass panels use, in px. */
  "--pf-glass-blur": string;
}

/**
 * Obsidian — the neutral dark PRSME default.
 *
 * Deliberately close to a true neutral: the surfaces are almost greyscale and
 * only the accent carries colour. Every other dark palette in the collection
 * is saturated *somewhere* — violet, cobalt, oxblood, moss, amber, arctic,
 * terracotta — so Obsidian has to stay the one that is genuinely neutral.
 */
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
  "--pf-glass-surface": "rgba(255, 255, 255, 0.055)",
  "--pf-glass-border": "rgba(255, 255, 255, 0.10)",
  "--pf-glass-highlight": "rgba(255, 255, 255, 0.07)",
  "--pf-glass-sheen": "rgba(168, 146, 255, 0.16)",
  "--pf-glass-blur": "14px",
};

/**
 * Violet Haze — a saturated violet ground.
 *
 * The violet family is *not* Obsidian with a purple accent: the page itself
 * is purple, the elevated surfaces are purple, and the borders are tinted
 * violet. The whole page reads as violet at a glance.
 */
const VIOLET_TOKENS: ProfileTokens = {
  "--pf-bg": "#120727",
  "--pf-surface-1": "#1B0B3C",
  "--pf-surface-2": "#251052",
  "--pf-surface-3": "#31176C",
  "--pf-text-strong": "#F8F3FF",
  "--pf-text": "#E6DAFB",
  "--pf-text-muted": "#AD9BD6",
  "--pf-text-faint": "#8271AA",
  "--pf-border": "rgba(211,182,255,0.14)",
  "--pf-border-strong": "rgba(211,182,255,0.24)",
  "--pf-accent": "#D3B6FF",
  "--pf-accent-strong": "#B78DFF",
  "--pf-accent-fg": "#1B0B3C",
  "--pf-accent-soft": "rgba(211,182,255,0.16)",
  "--pf-hover": "rgba(211,182,255,0.12)",
  "--pf-focus-ring": "rgba(211,182,255,0.62)",
  "--pf-rating": "#E1CDFF",
  "--pf-rating-bg": "rgba(211,182,255,0.14)",
  "--pf-rating-border": "rgba(211,182,255,0.36)",
  "--pf-rating-solid": "#291353",
  "--pf-rating-border-strong": "#5E3AAB",
  "--pf-tag-bg": "rgba(211,182,255,0.10)",
  "--pf-tag-text": "#E4D4FF",
  "--pf-tag-border": "rgba(211,182,255,0.22)",
  "--pf-meta": "#8A79B4",
  "--pf-overlay-from": "rgba(18,7,39,0.94)",
  "--pf-overlay-via": "rgba(18,7,39,0.58)",
  "--pf-glass-surface": "rgba(211, 182, 255, 0.07)",
  "--pf-glass-border": "rgba(211, 182, 255, 0.16)",
  "--pf-glass-highlight": "rgba(211, 182, 255, 0.10)",
  "--pf-glass-sheen": "rgba(211, 182, 255, 0.20)",
  "--pf-glass-blur": "16px",
};

/**
 * Electric Cobalt — vivid blue on a deep navy ground.
 *
 * Blue, not violet: the accent skews towards azure (`#4DA3FF`) rather than
 * towards the purple end, and the surfaces are navy rather than near-black.
 */
const COBALT_TOKENS: ProfileTokens = {
  "--pf-bg": "#04101F",
  "--pf-surface-1": "#071A31",
  "--pf-surface-2": "#0B2445",
  "--pf-surface-3": "#10305C",
  "--pf-text-strong": "#EAF3FF",
  "--pf-text": "#CFE2FA",
  "--pf-text-muted": "#8FADD4",
  "--pf-text-faint": "#5C7DA6",
  "--pf-border": "rgba(147,197,255,0.14)",
  "--pf-border-strong": "rgba(147,197,255,0.26)",
  "--pf-accent": "#93C5FF",
  "--pf-accent-strong": "#4DA3FF",
  "--pf-accent-fg": "#04101F",
  "--pf-accent-soft": "rgba(77,163,255,0.16)",
  "--pf-hover": "rgba(77,163,255,0.12)",
  "--pf-focus-ring": "rgba(77,163,255,0.62)",
  "--pf-rating": "#B6D6FF",
  "--pf-rating-bg": "rgba(77,163,255,0.14)",
  "--pf-rating-border": "rgba(77,163,255,0.36)",
  "--pf-rating-solid": "#0B2445",
  "--pf-rating-border-strong": "#1E5C9E",
  "--pf-tag-bg": "rgba(147,197,255,0.10)",
  "--pf-tag-text": "#CFE4FF",
  "--pf-tag-border": "rgba(147,197,255,0.22)",
  "--pf-meta": "#6B8CB4",
  "--pf-overlay-from": "rgba(4,16,31,0.94)",
  "--pf-overlay-via": "rgba(4,16,31,0.58)",
  "--pf-glass-surface": "rgba(147, 197, 255, 0.07)",
  "--pf-glass-border": "rgba(147, 197, 255, 0.16)",
  "--pf-glass-highlight": "rgba(147, 197, 255, 0.10)",
  "--pf-glass-sheen": "rgba(147, 197, 255, 0.20)",
  "--pf-glass-blur": "16px",
};

/**
 * Oxblood — burgundy and oxblood.
 *
 * This is the retained palette for BOTH of the old burgundy presets
 * (`rose-noir` and `cherry-cola`). It is warmer and more saturated than
 * either of them was: the ground is a deep oxblood rather than neutral
 * near-black, and the accent is a warm coral rather than a dusty pink.
 */
const OXBLOOD_TOKENS: ProfileTokens = {
  "--pf-bg": "#0F0708",
  "--pf-surface-1": "#180B0D",
  "--pf-surface-2": "#220F12",
  "--pf-surface-3": "#2E1519",
  "--pf-text-strong": "#FCEEEE",
  "--pf-text": "#F0D7D6",
  "--pf-text-muted": "#C19795",
  "--pf-text-faint": "#8B6462",
  "--pf-border": "rgba(246,185,174,0.12)",
  "--pf-border-strong": "rgba(246,185,174,0.24)",
  "--pf-accent": "#F6B9AE",
  "--pf-accent-strong": "#E49182",
  "--pf-accent-fg": "#180B0D",
  "--pf-accent-soft": "rgba(228,145,130,0.16)",
  "--pf-hover": "rgba(228,145,130,0.12)",
  "--pf-focus-ring": "rgba(228,145,130,0.60)",
  "--pf-rating": "#FACBC1",
  "--pf-rating-bg": "rgba(228,145,130,0.14)",
  "--pf-rating-border": "rgba(228,145,130,0.36)",
  "--pf-rating-solid": "#2A1216",
  "--pf-rating-border-strong": "#7A3E39",
  "--pf-tag-bg": "rgba(246,185,174,0.09)",
  "--pf-tag-text": "#F2DAD7",
  "--pf-tag-border": "rgba(246,185,174,0.22)",
  "--pf-meta": "#97716F",
  "--pf-overlay-from": "rgba(15,7,8,0.94)",
  "--pf-overlay-via": "rgba(15,7,8,0.58)",
  "--pf-glass-surface": "rgba(246, 185, 174, 0.06)",
  "--pf-glass-border": "rgba(246, 185, 174, 0.15)",
  "--pf-glass-highlight": "rgba(246, 185, 174, 0.09)",
  "--pf-glass-sheen": "rgba(246, 185, 174, 0.18)",
  "--pf-glass-blur": "15px",
};

/**
 * Deep Moss — the retained palette for the old `forest-dark`.
 *
 * Green, but a *mossy* green rather than the old sage-on-black: the accent
 * is a yellow-green, the ground is a green-black, and the elevated surfaces
 * are visibly green.
 */
const MOSS_TOKENS: ProfileTokens = {
  "--pf-bg": "#06100A",
  "--pf-surface-1": "#0A1911",
  "--pf-surface-2": "#0F2419",
  "--pf-surface-3": "#163121",
  "--pf-text-strong": "#EEF6EF",
  "--pf-text": "#D5E6D9",
  "--pf-text-muted": "#90AC98",
  "--pf-text-faint": "#617C6C",
  "--pf-border": "rgba(198,231,168,0.12)",
  "--pf-border-strong": "rgba(198,231,168,0.24)",
  "--pf-accent": "#C6E7A8",
  "--pf-accent-strong": "#9FCB7A",
  "--pf-accent-fg": "#06100A",
  "--pf-accent-soft": "rgba(159,203,122,0.15)",
  "--pf-hover": "rgba(159,203,122,0.11)",
  "--pf-focus-ring": "rgba(159,203,122,0.58)",
  "--pf-rating": "#D6EFBE",
  "--pf-rating-bg": "rgba(159,203,122,0.14)",
  "--pf-rating-border": "rgba(159,203,122,0.34)",
  "--pf-rating-solid": "#132A1B",
  "--pf-rating-border-strong": "#3C6338",
  "--pf-tag-bg": "rgba(198,231,168,0.09)",
  "--pf-tag-text": "#DBEDCE",
  "--pf-tag-border": "rgba(198,231,168,0.20)",
  "--pf-meta": "#6E8878",
  "--pf-overlay-from": "rgba(6,16,10,0.94)",
  "--pf-overlay-via": "rgba(6,16,10,0.58)",
  "--pf-glass-surface": "rgba(198, 231, 168, 0.06)",
  "--pf-glass-border": "rgba(198, 231, 168, 0.15)",
  "--pf-glass-highlight": "rgba(198, 231, 168, 0.09)",
  "--pf-glass-sheen": "rgba(198, 231, 168, 0.18)",
  "--pf-glass-blur": "15px",
};

/**
 * Silver Screen — true monochrome.
 *
 * No hue anywhere: the "accent" is a silver grey. The rating chip and the
 * tags are grey too, which is the point — this palette proves the whole
 * profile can be built without a single hue.
 */
const SILVER_TOKENS: ProfileTokens = {
  "--pf-bg": "#08080A",
  "--pf-surface-1": "#0F0F11",
  "--pf-surface-2": "#161618",
  "--pf-surface-3": "#1E1E21",
  "--pf-text-strong": "#FAFAFA",
  "--pf-text": "#E4E4E4",
  "--pf-text-muted": "#A3A3A3",
  "--pf-text-faint": "#6E6E6E",
  "--pf-border": "rgba(255,255,255,0.11)",
  "--pf-border-strong": "rgba(255,255,255,0.22)",
  "--pf-accent": "#EDEDED",
  "--pf-accent-strong": "#D4D4D4",
  "--pf-accent-fg": "#08080A",
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
  "--pf-overlay-from": "rgba(8,8,10,0.94)",
  "--pf-overlay-via": "rgba(8,8,10,0.60)",
  "--pf-glass-surface": "rgba(255, 255, 255, 0.06)",
  "--pf-glass-border": "rgba(255, 255, 255, 0.14)",
  "--pf-glass-highlight": "rgba(255, 255, 255, 0.08)",
  "--pf-glass-sheen": "rgba(255, 255, 255, 0.12)",
  "--pf-glass-blur": "14px",
};

/**
 * Amber Film — warm sepia near-black.
 *
 * The warmth is in the *ground*, not only in the accent: every surface is a
 * brown-black, so the page reads as projected film rather than as a dark UI
 * with an orange button.
 */
const AMBER_TOKENS: ProfileTokens = {
  "--pf-bg": "#0F0A05",
  "--pf-surface-1": "#17110A",
  "--pf-surface-2": "#20180E",
  "--pf-surface-3": "#2B2114",
  "--pf-text-strong": "#FCF4E6",
  "--pf-text": "#EEDFC9",
  "--pf-text-muted": "#C4AC8B",
  "--pf-text-faint": "#8E7B60",
  "--pf-border": "rgba(233,181,113,0.12)",
  "--pf-border-strong": "rgba(233,181,113,0.24)",
  "--pf-accent": "#F6CE96",
  "--pf-accent-strong": "#E9B571",
  "--pf-accent-fg": "#17110A",
  "--pf-accent-soft": "rgba(233,181,113,0.16)",
  "--pf-hover": "rgba(233,181,113,0.11)",
  "--pf-focus-ring": "rgba(233,181,113,0.58)",
  "--pf-rating": "#F8D9A9",
  "--pf-rating-bg": "rgba(233,181,113,0.14)",
  "--pf-rating-border": "rgba(233,181,113,0.34)",
  "--pf-rating-solid": "#261C0F",
  "--pf-rating-border-strong": "#6E532A",
  "--pf-tag-bg": "rgba(233,181,113,0.09)",
  "--pf-tag-text": "#EEDDC0",
  "--pf-tag-border": "rgba(233,181,113,0.20)",
  "--pf-meta": "#9A8566",
  "--pf-overlay-from": "rgba(15,10,5,0.94)",
  "--pf-overlay-via": "rgba(15,10,5,0.58)",
  "--pf-glass-surface": "rgba(233, 181, 113, 0.06)",
  "--pf-glass-border": "rgba(233, 181, 113, 0.15)",
  "--pf-glass-highlight": "rgba(233, 181, 113, 0.09)",
  "--pf-glass-sheen": "rgba(233, 181, 113, 0.18)",
  "--pf-glass-blur": "15px",
};

/**
 * Arctic Tide — teal and icy blue.
 *
 * Cyan-leaning rather than blue-leaning: the accent is `#5FD2DE`, and the
 * surfaces are blue-green. It is the only truly *cold* coloured palette in
 * the collection, which is what separates it from Cobalt.
 */
const ARCTIC_TOKENS: ProfileTokens = {
  "--pf-bg": "#041013",
  "--pf-surface-1": "#08191E",
  "--pf-surface-2": "#0B242B",
  "--pf-surface-3": "#0F333C",
  "--pf-text-strong": "#EAF7FA",
  "--pf-text": "#C9E6EC",
  "--pf-text-muted": "#87ABB4",
  "--pf-text-faint": "#5A7F88",
  "--pf-border": "rgba(168,232,240,0.12)",
  "--pf-border-strong": "rgba(168,232,240,0.24)",
  "--pf-accent": "#A8E8F0",
  "--pf-accent-strong": "#5FD2DE",
  "--pf-accent-fg": "#041013",
  "--pf-accent-soft": "rgba(95,210,222,0.15)",
  "--pf-hover": "rgba(95,210,222,0.11)",
  "--pf-focus-ring": "rgba(95,210,222,0.60)",
  "--pf-rating": "#BCEEF4",
  "--pf-rating-bg": "rgba(95,210,222,0.14)",
  "--pf-rating-border": "rgba(95,210,222,0.34)",
  "--pf-rating-solid": "#0C2730",
  "--pf-rating-border-strong": "#2E6A76",
  "--pf-tag-bg": "rgba(168,232,240,0.09)",
  "--pf-tag-text": "#C8E9EF",
  "--pf-tag-border": "rgba(168,232,240,0.20)",
  "--pf-meta": "#6B8F98",
  "--pf-overlay-from": "rgba(4,16,19,0.94)",
  "--pf-overlay-via": "rgba(4,16,19,0.58)",
  "--pf-glass-surface": "rgba(168, 232, 240, 0.06)",
  "--pf-glass-border": "rgba(168, 232, 240, 0.15)",
  "--pf-glass-highlight": "rgba(168, 232, 240, 0.09)",
  "--pf-glass-sheen": "rgba(168, 232, 240, 0.18)",
  "--pf-glass-blur": "15px",
};

/**
 * Terracotta — warm clay and rust.
 *
 * A *second* warm palette alongside Amber, and deliberately further from it:
 * Amber is sepia and brown-black, Terracotta is orange-red clay with a
 * visibly red ground. They are not the same palette with a different accent.
 */
const TERRACOTTA_TOKENS: ProfileTokens = {
  "--pf-bg": "#150C08",
  "--pf-surface-1": "#1E120C",
  "--pf-surface-2": "#291811",
  "--pf-surface-3": "#362117",
  "--pf-text-strong": "#FCEFE6",
  "--pf-text": "#F0DCCC",
  "--pf-text-muted": "#C7A892",
  "--pf-text-faint": "#917C68",
  "--pf-border": "rgba(227,155,107,0.13)",
  "--pf-border-strong": "rgba(227,155,107,0.26)",
  "--pf-accent": "#F6C09B",
  "--pf-accent-strong": "#E39B6B",
  "--pf-accent-fg": "#1E120C",
  "--pf-accent-soft": "rgba(227,155,107,0.16)",
  "--pf-hover": "rgba(227,155,107,0.12)",
  "--pf-focus-ring": "rgba(227,155,107,0.60)",
  "--pf-rating": "#FAD3B4",
  "--pf-rating-bg": "rgba(227,155,107,0.14)",
  "--pf-rating-border": "rgba(227,155,107,0.36)",
  "--pf-rating-solid": "#2E1A11",
  "--pf-rating-border-strong": "#7A4A2C",
  "--pf-tag-bg": "rgba(227,155,107,0.09)",
  "--pf-tag-text": "#F2DDC9",
  "--pf-tag-border": "rgba(227,155,107,0.22)",
  "--pf-meta": "#A0826C",
  "--pf-overlay-from": "rgba(21,12,8,0.94)",
  "--pf-overlay-via": "rgba(21,12,8,0.58)",
  "--pf-glass-surface": "rgba(227, 155, 107, 0.07)",
  "--pf-glass-border": "rgba(227, 155, 107, 0.16)",
  "--pf-glass-highlight": "rgba(227, 155, 107, 0.10)",
  "--pf-glass-sheen": "rgba(227, 155, 107, 0.19)",
  "--pf-glass-blur": "15px",
};

/**
 * Porcelain — the light theme.
 *
 * A genuinely light page: paper-white ground, warm off-white surfaces, deep
 * ink text, and a clay-toned accent. It is not a dark theme with a lighter
 * header — the *background* is light, the text is dark, and the borders are
 * ink-on-paper.
 */
const PORCELAIN_TOKENS: ProfileTokens = {
  "--pf-bg": "#F4F1EA",
  "--pf-surface-1": "#FBF9F4",
  "--pf-surface-2": "#EFEBE1",
  "--pf-surface-3": "#E2DDD0",
  "--pf-text-strong": "#1B1A18",
  "--pf-text": "#2C2A26",
  "--pf-text-muted": "#5C5850",
  "--pf-text-faint": "#8A857A",
  "--pf-border": "rgba(27,26,24,0.12)",
  "--pf-border-strong": "rgba(27,26,24,0.22)",
  "--pf-accent": "#B4552A",
  "--pf-accent-strong": "#9C4520",
  "--pf-accent-fg": "#FFFFFF",
  "--pf-accent-soft": "rgba(180,85,42,0.10)",
  "--pf-hover": "rgba(180,85,42,0.08)",
  "--pf-focus-ring": "rgba(180,85,42,0.50)",
  "--pf-rating": "#8A3C1A",
  "--pf-rating-bg": "rgba(180,85,42,0.09)",
  "--pf-rating-border": "rgba(180,85,42,0.28)",
  "--pf-rating-solid": "#FFFFFF",
  "--pf-rating-border-strong": "#A85C33",
  "--pf-tag-bg": "rgba(27,26,24,0.045)",
  "--pf-tag-text": "#3A3833",
  "--pf-tag-border": "rgba(27,26,24,0.14)",
  "--pf-meta": "#7A7568",
  "--pf-overlay-from": "rgba(251,249,244,0.94)",
  "--pf-overlay-via": "rgba(251,249,244,0.62)",
  "--pf-glass-surface": "rgba(255, 255, 255, 0.62)",
  "--pf-glass-border": "rgba(27, 26, 24, 0.10)",
  "--pf-glass-highlight": "rgba(255, 255, 255, 0.85)",
  "--pf-glass-sheen": "rgba(255, 255, 255, 0.72)",
  "--pf-glass-blur": "12px",
};

export const PROFILE_TOKENS_BY_THEME: Record<ThemeId, ProfileTokens> = {
  obsidian: OBSIDIAN_TOKENS,
  violet: VIOLET_TOKENS,
  cobalt: COBALT_TOKENS,
  oxblood: OXBLOOD_TOKENS,
  moss: MOSS_TOKENS,
  silver: SILVER_TOKENS,
  amber: AMBER_TOKENS,
  arctic: ARCTIC_TOKENS,
  terracotta: TERRACOTTA_TOKENS,
  porcelain: PORCELAIN_TOKENS,
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

  /* ---- Pre-Phase 11: four new voices ----------------------------------
   *
   * Each one introduces a family the project had never loaded, so the choice
   * changes the *shapes* on the page rather than only the metrics. They are
   * deliberately spread across the four axes the brief names: neo-geometric,
   * expressive literary serif, warm humanist sans, and experimental display.
   */
  sora: {
    id: "sora",
    name: "Sora",
    description:
      "Sora headings — neo-geometric and futuristic, with Inter body copy.",
    display: `var(--font-sora), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.02em",
    displayScale: 1.04,
    displayWeight: 600,
  },
  fraunces: {
    id: "fraunces",
    name: "Fraunces",
    description:
      "Fraunces headings — an expressive literary serif with real personality.",
    display: `var(--font-fraunces), ui-serif, Georgia, serif`,
    body: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-sans), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.012em",
    displayScale: 1.18,
    displayWeight: 600,
  },
  jakarta: {
    id: "jakarta",
    name: "Plus Jakarta",
    description:
      "Plus Jakarta Sans throughout — warm humanist shapes, friendly and readable.",
    display: `var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`,
    displayTracking: "-0.026em",
    displayScale: 1.06,
    displayWeight: 700,
  },
  bricolage: {
    id: "bricolage",
    name: "Bricolage",
    description:
      "Bricolage Grotesque display — bold art direction, with DM Sans body copy.",
    display: `var(--font-bricolage), ui-sans-serif, system-ui, sans-serif`,
    body: `var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif`,
    meta: `var(--font-plex-mono), ui-monospace, monospace`,
    displayTracking: "-0.045em",
    displayScale: 1.12,
    displayWeight: 800,
  },
};

export const TYPOGRAPHY_LIST: TypographyPreset[] = [
  /* The eight that shipped before this phase — preserved exactly. */
  TYPOGRAPHY_PRESETS.serif,
  TYPOGRAPHY_PRESETS.modern,
  TYPOGRAPHY_PRESETS["mono-led"],
  TYPOGRAPHY_PRESETS.contemporary,
  TYPOGRAPHY_PRESETS["soft-editorial"],
  TYPOGRAPHY_PRESETS.manrope,
  TYPOGRAPHY_PRESETS.archive,
  TYPOGRAPHY_PRESETS.playful,
  /* Pre-Phase 11 — four new voices. */
  TYPOGRAPHY_PRESETS.sora,
  TYPOGRAPHY_PRESETS.fraunces,
  TYPOGRAPHY_PRESETS.jakarta,
  TYPOGRAPHY_PRESETS.bricolage,
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
  "cobalt",
  "oxblood",
  "moss",
  "silver",
  "amber",
  "arctic",
  "terracotta",
  "porcelain",
];

/** Themes whose body surface is light — used to flip form/scrollbar colours. */
export const LIGHT_THEMES: ThemeId[] = ["porcelain"];

export type { ThemeId, TypographyId, LayoutPreset, BackgroundTreatment, ThemePreset };
