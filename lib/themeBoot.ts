/**
 * Pre-paint bootstrap script — applied in <head> by the root layout so
 * that navigating between /studio and /u/noir does not cause a visible
 * theme flash.
 *
 * Reads localStorage('prsme:profile-draft:v1') and applies the persisted
 * theme tokens + background treatment onto <html data-theme>.
 *
 * This file is intentionally NOT marked "use client" — it ships as a
 * plain string into the server-rendered <head>.
 *
 * PRE-PHASE 11
 *
 * Two things changed here:
 *
 *   1. The preset table is generated from the *whole* registry rather than
 *      from a hand-written list of five ids, so a new theme is never missed.
 *   2. A legacy theme id is normalised on the client too. The server does
 *      the same normalisation when it reads the draft, but the boot script
 *      runs before React has hydrated and before the server has had a chance
 *      to correct the DOM — so without this, a profile saved with the old
 *      `rose-noir` id would paint itself with the default palette for a
 *      moment and then jump.
 */

import { THEME_PRESETS, LEGACY_THEME_ALIASES, type ThemeId } from "./theme";

/**
 * The whole registry, keyed by id. Serialised into the script.
 *
 * `THEME_PRESETS` is the single source of truth for the site-level token
 * map, so the script and the server can never disagree about what a theme
 * looks like.
 */
const PRESET_TOKENS_JSON = JSON.stringify(
  Object.fromEntries(THEME_PRESETS.map((t) => [t.id, t.tokens])),
);

/** The legacy-alias map, so the client resolves an old id the same way. */
const LEGACY_ALIAS_JSON = JSON.stringify(LEGACY_THEME_ALIASES);

export const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var raw = window.localStorage.getItem('prsme:profile-draft:v1');
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data || data.version !== 1) return;
    var appearance = data.appearance;
    if (!appearance) return;

    // Normalise a legacy theme id before painting anything.
    var legacy = ${LEGACY_ALIAS_JSON};
    var requested = appearance.theme || 'obsidian';
    var themeId = legacy[requested] || requested;
    if (!${PRESET_TOKENS_JSON}[themeId]) themeId = 'obsidian';

    document.documentElement.setAttribute('data-theme', themeId);

    var presets = ${PRESET_TOKENS_JSON};
    var preset = presets[themeId];
    var css = 'html[data-theme="' + themeId + '"] {';
    for (var k in preset) css += k + ':' + preset[k] + ';';
    css += '}';

    // Only 'solid' and 'gradient' exist now; the paper-grain mode was removed.
    var bg = '';
    if (appearance.background === 'gradient') {
      bg = 'html[data-theme] body{background-image:' + (preset['--panel-haze'] || 'transparent') + ';background-repeat:no-repeat;background-attachment:fixed;background-size:cover;}';
    } else {
      bg = 'html[data-theme] body{background-image:transparent;}';
    }
    var style = document.createElement('style');
    style.id = 'prsme-theme-vars';
    style.textContent = css + '\\n' + bg;
    document.head.appendChild(style);
  } catch (e) {}
})();
`.trim();

export type { ThemeId };
