/**
 * Phase 3.1 verification: does the iframe-based preview actually
 * trigger genuine mobile media queries at 390 CSS px?
 */

import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, screenshot, close } = await connect();

await setViewport(1280, 1100);
await goto(`${HOST}/studio`, { waitMs: 5000 });

// Click the 390 button
await evalJs(`document.querySelector('[data-testid="studio-preview-viewport-390"]').click();`);
await new Promise((r) => setTimeout(r, 2000));

const r = await evalJs(`
  return (() => {
    const f = document.querySelector('[data-testid="studio-preview-iframe"]');
    return {
      iframeWidth: f?.getBoundingClientRect().width,
      iframeHeight: f?.getBoundingClientRect().height,
      attrWidth: f?.getAttribute('style'),
    };
  })();
`);
console.log("STUDIO → IFRAME", r);

// Inspect the iframe's internal DOM after navigation
const inner = await evalJs(`
  return (async () => {
    const f = document.querySelector('[data-testid="studio-preview-iframe"]');
    if (!f || !f.contentDocument) return { ok: false, reason: 'no contentDocument' };
    const d = f.contentDocument;
    const profileContainer = d.querySelector('.pf-header');
    const navToggleVisible = d.querySelector('.site-nav-toggle')
      ? getComputedStyle(d.querySelector('.site-nav-toggle')).display !== 'none'
      : null;
    const desktopLinksHidden = d.querySelector('.site-nav-link')
      ? getComputedStyle(d.querySelector('.site-nav-link')).display !== 'none'
      : null;
    const profileNameFont = d.querySelector('#profile-name')
      ? getComputedStyle(d.querySelector('#profile-name')).fontFamily
      : null;
    const bodyClientWidth = d.documentElement.clientWidth;
    const bodyScrollWidth = d.documentElement.scrollWidth;
    const themeAttr = d.documentElement.getAttribute('data-theme-id');
    const csVars = (() => {
      const scope = d.querySelector('.profile-scope');
      if (!scope) return null;
      const cs = getComputedStyle(scope);
      return {
        accent: cs.getPropertyValue('--pf-accent').trim(),
        rating: cs.getPropertyValue('--pf-rating').trim(),
        meta: cs.getPropertyValue('--pf-meta').trim(),
        fontDisplay: cs.getPropertyValue('--pf-font-display').trim(),
        fontBody: cs.getPropertyValue('--pf-font-body').trim(),
      };
    })();
    return {
      ok: true,
      bodyClientWidth,
      bodyScrollWidth,
      hasHorizontalDocOverflow: bodyScrollWidth > bodyClientWidth + 1,
      navToggleVisible,
      desktopLinksHidden,
      profileNameFont,
      themeAttr,
      profileScopeTokens: csVars,
      firstCollectionLayout: (() => {
        const a = d.querySelector('article[data-collection-layout]');
        return a?.getAttribute('data-collection-layout');
      })(),
    };
  })();
`);
console.log("IFRAME INTERNALS:", JSON.stringify(inner, null, 2));

await screenshot("G:\\prsme\\docs\\phase31-iframe-390.png", { fullPage: true });
await close();