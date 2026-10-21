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
 */

import { THEME_BY_ID, type ThemeId } from "./theme";

const PRESET_TOKENS_JSON = JSON.stringify(
  Object.fromEntries(
    (
      ["obsidian", "violet", "midnight", "rose-noir", "paper"] as ThemeId[]
    ).map((id) => [id, THEME_BY_ID[id].tokens]),
  ),
);

const PAPER_GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>\")";

export const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var raw = window.localStorage.getItem('prsme:profile-draft:v1');
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data || data.version !== 1) return;
    var appearance = data.appearance;
    if (!appearance) return;
    var themeId = appearance.theme || 'obsidian';
    document.documentElement.setAttribute('data-theme', themeId);
    var presets = ${PRESET_TOKENS_JSON};
    var preset = presets[themeId] || presets.obsidian;
    var css = 'html[data-theme="' + themeId + '"] {';
    for (var k in preset) css += k + ':' + preset[k] + ';';
    css += '}';
    var bg = '';
    if (appearance.background === 'paper-grain') {
      bg = 'html[data-theme] body{background-image:${PAPER_GRAIN_URL};background-repeat:no-repeat;background-attachment:fixed;background-size:cover;}';
    } else if (appearance.background === 'gradient') {
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