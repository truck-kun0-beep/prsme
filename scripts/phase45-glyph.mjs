// scripts/phase45-glyph.mjs — prove the Apple Music mark is no longer clipped.

import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await browser.setViewport(1280, 900);
await browser.seed(null);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1200);

const check = await browser.evalJs(`
  const a = document.querySelector('[data-testid="profile-soundtrack-link"]');
  const svg = a.querySelector('svg');
  const sr = svg.getBoundingClientRect();
  const shapes = Array.from(svg.querySelectorAll('path, ellipse, circle'));

  /*
   * Measure in RENDERED pixels, not getBBox().
   *
   * getBBox() reports an element's box in its own local coordinate system and
   * deliberately ignores the transform on any ancestor — so with the centring
   * <g transform="..."> in place it would report the pre-transform box and tell
   * us nothing about what the visitor actually sees. Screen rects are the only
   * honest measurement once a transform is involved.
   */
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of shapes) {
    const r = el.getBoundingClientRect();
    minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
  }
  const padL = minX - sr.left, padR = sr.right - maxX;
  const padT = minY - sr.top, padB = sr.bottom - maxY;
  return {
    renderedBox: { minX: +minX.toFixed(1), maxX: +maxX.toFixed(1), minY: +minY.toFixed(1), maxY: +maxY.toFixed(1) },
    svgBox: { w: +sr.width.toFixed(1), h: +sr.height.toFixed(1) },
    // Padding is to the SVG's own box, so convert to viewBox units (24).
    padViewBox: { top: +(padT / sr.height * 24).toFixed(2), bottom: +(padB / sr.height * 24).toFixed(2),
                  left: +(padL / sr.width * 24).toFixed(2), right: +(padR / sr.width * 24).toFixed(2) },
    clipped: padT < 0 || padB < 0 || padL < 0 || padR < 0,
    centred: Math.abs((padL - padR)) < 1.5,
    shapeCount: shapes.length,
    href: a.getAttribute('href'),
    provider: a.getAttribute('data-provider'),
    aria: a.getAttribute('aria-label'),
    title: a.getAttribute('title'),
  };
`);
console.log(JSON.stringify(check, null, 2));
const ok = !check.clipped && check.centred;
console.log(ok ? "\nGLYPH OK - inside viewBox and centred" : "\nGLYPH PROBLEM");
await browser.close();
process.exitCode = ok ? 0 : 1;