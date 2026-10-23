// scripts/phase45-audit.mjs — capture the CURRENT (pre-fix) state of the four
// Phase 4.5 targets. Read-only.

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase45";
await mkdir(OUT, { recursive: true });

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (l, v) => console.log(`${l}: ${JSON.stringify(v)}`);

/* ---- 1. Music list: which layout, and does it have square link buttons? ---- */
await browser.setViewport(1280, 1100);
await browser.seed(null);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4000 });
await wait(1500);

const music = await browser.evalJs(`
  const compact = document.querySelector('[data-testid="compact-collection"]');
  const st = document.querySelector('[data-testid="soundtrack-list-collection"]');
  const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
  return {
    compactPresent: !!compact,
    soundtrackListPresent: !!st,
    soundtrackRows: rows.length,
    // The square outlined external-link buttons the owner called out.
    squareLinkButtons: document.querySelectorAll('.pf-soundtrack-link').length,
    // A row that is itself a link (should be the Phase 4.5 goal).
    rowIsAnchor: rows.filter(r => r.tagName === 'A').length,
    rowIsListItem: rows.filter(r => r.tagName === 'LI').length,
    nestedAnchorsPerRow: rows.slice(0,2).map(r => r.querySelectorAll('a').length),
    firstRowHTML: rows[0] ? rows[0].outerHTML.slice(0, 260) : null,
  };
`);
note("music", music);
await browser.screenshot(`${OUT}/audit-music-1280.png`, { fullPage: true });

/* ---- 2. My Clicks: SOURCE label + shape spans ---- */
await browser.setViewport(1280, 1400);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4000 });
await wait(2000);

const clicks = await browser.evalJs(`
  const grid = document.querySelector('[data-testid="clicks-desktop-grid"]');
  const cards = grid ? Array.from(grid.querySelectorAll('[data-testid="clicks-card"]')) : [];
  const rail = document.querySelector('[data-testid="clicks-mobile-rail"]');
  const gridCardW = cards.slice(0, 4).map(c => Math.round(c.getBoundingClientRect().width));
  const railCardW = rail ? Array.from(rail.querySelectorAll('[data-testid="clicks-card"]')).slice(0,4)
      .map(c => Math.round(c.getBoundingClientRect().width)) : [];
  const frames = cards.slice(0, 4).map(c => {
    const f = c.querySelector('.pf-clicks-frame');
    const r = f.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(2) };
  });
  return {
    gridCards: cards.length,
    gridCardW,
    railCardW,
    frames,
    // The label the owner wants gone.
    sourceText: document.body.innerText.includes('SOURCE'),
    sourceLinks: document.querySelectorAll('.pf-clicks-source').length,
    cardIsAnchor: cards.filter(c => c.tagName === 'A').length,
    gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
  };
`);
note("clicks", clicks);
await browser.screenshot(`${OUT}/audit-clicks-1280.png`, { fullPage: true });

/* ---- 3. Custom Links: does the section exist at all? ---- */
const links = await browser.evalJs(`
  return {
    sectionExists: !!document.querySelector('[data-testid="custom-links"]'),
    anyLinkButtons: document.querySelectorAll('.pf-custom-link').length,
    headings: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 12),
  };
`);
note("customLinks", links);

/* ---- 4. Apple Music icon: does the glyph render? ---- */
const apple = await browser.evalJs(`
  const card = document.querySelector('[data-testid="profile-soundtrack"]');
  const a = card ? card.querySelector('[data-testid="profile-soundtrack-link"]') : null;
  const svg = a ? a.querySelector('svg') : null;
  const path = svg ? svg.querySelector('path') : null;
  let box = null;
  if (svg) {
    const r = svg.getBoundingClientRect();
    const pb = path ? path.getBBox() : null;
    box = {
      svgRect: { w: Math.round(r.width), h: Math.round(r.height) },
      viewBox: svg.getAttribute('viewBox'),
      // A viewBox with a zero dimension, or a path bbox at 0x0, is the classic
      // "broken logo" signature.
      pathBBox: pb ? { w: Math.round(pb.width), h: Math.round(pb.height), x: Math.round(pb.x), y: Math.round(pb.y) } : null,
      dHead: path ? (path.getAttribute('d') || '').slice(0, 50) : null,
    };
  }
  return {
    href: a ? a.getAttribute('href') : null,
    aria: a ? a.getAttribute('aria-label') : null,
    box,
  };
`);
note("appleMusic", apple);

await browser.close();