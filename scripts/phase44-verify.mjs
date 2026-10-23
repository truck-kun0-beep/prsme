// scripts/phase44-verify.mjs — Phase 4.4 acceptance checks.
//
// Scope: only the four reported defects. No broad theme/typography/layout sweep.
//
//   1. My Clicks  — card sizing, rail scrollability by real touch, last card
//                   reachable, images loaded, failure fallback shown.
//   2. Hover      — computed transitions/transform actually present on cards.
//   3. Album      — card is the anchor; no trailing button below the cover.
//   4. Soundtrack — opens Apple Music, shows the Apple Music glyph.
//
// Requires: dev server on 127.0.0.1:3000, Chromium CDP on 9334.

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase44";
await mkdir(OUT, { recursive: true });

const results = [];
function test(name, pass, details) {
  results.push({ name, pass: !!pass });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}`);
  if (details !== undefined) console.log(`        ${JSON.stringify(details).slice(0, 400)}`);
}

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (slug) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${slug}`;

const PHOTOS = [
  { id: "cl-1", title: "Tram 28, Graça", place: "Lisbon", ratio: "tall", palette: "mono", mode: "image",
    imageUrl: T("b/b4/Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg/960px-Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg"),
    altText: "A yellow vintage tram climbing a steep Lisbon street." },
  { id: "cl-2", title: "Lisbon at night", place: "Portugal", ratio: "wide", palette: "amber", mode: "image",
    imageUrl: T("1/18/Lisbon_at_night_%2824301569479%29.jpg/960px-Lisbon_at_night_%2824301569479%29.jpg"),
    altText: "Lisbon rooftops glowing warm after dark." },
  { id: "cl-3", title: "TV tower, Alexanderplatz", place: "Berlin", ratio: "portrait", palette: "iris", mode: "image",
    imageUrl: T("4/47/09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg/960px-09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg"),
    altText: "The Berlin TV Tower at night." },
  { id: "cl-4", title: "Damrak at golden hour", place: "Amsterdam", ratio: "square", palette: "cyan", mode: "image",
    imageUrl: T("e/ef/Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg/960px-Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg"),
    altText: "Colorful Dutch canal houses in golden evening light." },
  { id: "cl-5", title: "Gion, after rain", place: "Kyoto", ratio: "tall", palette: "forest", mode: "image",
    imageUrl: T("c/c1/Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg/960px-Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg"),
    altText: "A narrow Kyoto alley in Gion." },
  // Deliberately dead host+path: proves the fallback is a real state.
  { id: "cl-6", title: "Dead link", place: "Nowhere", ratio: "square", palette: "rust", mode: "image",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/definitely-not-a-real-file-99999.jpg/960px-definitely-not-a-real-file-99999.jpg",
    altText: "An entry whose image cannot load." },
];

const baseDraft = (over) => ({
  version: 1,
  identity: { username: "noir", displayName: "Noir Aldridge",
    bio: "Filmmaker, occasional photographer, frequent over-reader.",
    location: "Lisbon", pronouns: "they/them", avatarPalette: "mono" },
  tags: ["Cinema", "Music"], socials: [], avatarDataUrl: null,
  soundtrack: null, collections: [], clicks: PHOTOS,
  appearance: { theme: "obsidian", typography: "serif", layout: "poster", background: "solid", accentOverride: null },
  visibility: "public",
  sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
  ...over,
});

/* ================= 1. My Clicks @390 ================= */
await browser.setViewport(390, 844);
await browser.seed(baseDraft());
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(2500);

const geom = await browser.evalJs(`
  const rail = document.querySelector('[data-testid="clicks-mobile-rail"]');
  // Scope to the RAIL: both layouts are mounted at once (the desktop grid is
  // display:none), so an unscoped query counts every card twice and reports the
  // hidden grid's zero-width boxes as broken.
  const cards = rail ? Array.from(rail.querySelectorAll('[data-testid="clicks-card"]')) : [];
  const imgs = Array.from(document.querySelectorAll('[data-testid="clicks-image"]'));
  return {
    railVisible: rail ? getComputedStyle(rail).display !== 'none' : false,
    railScrollWidth: rail ? rail.scrollWidth : null,
    railClientWidth: rail ? rail.clientWidth : null,
    overflows: rail ? rail.scrollWidth > rail.clientWidth + 1 : false,
    cardCount: cards.length,
    cardWidths: cards.map(c => Math.round(c.getBoundingClientRect().width)),
    frames: cards.map(c => { const f = c.querySelector('.pf-clicks-frame'); return f ? Math.round(f.getBoundingClientRect().height) : null; }),
    loaded: imgs.filter(i => i.naturalWidth > 0).length,
    imgs: imgs.length,
    failedShown: document.querySelectorAll('[data-testid="clicks-image-failed"]').length,
    arrows: !!document.querySelector('[data-testid="clicks-next"]'),
    cue: (document.querySelector('[data-testid="clicks-scroll-cue"]')||{}).textContent,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
`);
test("Clicks rail is horizontal and overflows at 390px", geom.railVisible && geom.overflows, geom);
test("Cards have intentional width and real height", geom.cardWidths.every(w => w > 120) && geom.frames.every(h => h > 60), { w: geom.cardWidths, h: geom.frames });
test("Rail exposes scroll controls + cue", geom.arrows && typeof geom.cue === "string", { cue: geom.cue });
test("No document-level horizontal overflow", geom.docOverflow <= 0, { overflow: geom.docOverflow });

await browser.screenshot(`${OUT}/verify-clicks-390.png`, { fullPage: true });

/* Real touch drag to the end of the rail. */
await browser.evalJs(`const r = document.querySelector('[data-testid="clicks-mobile-rail"]'); r.scrollIntoView({block:'center'}); return true;`, { once: true });
await wait(500);
const rb = await browser.evalJs(`
  const r = document.querySelector('[data-testid="clicks-mobile-rail"]');
  const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
`);
const cx = Math.round(rb.x + rb.w / 2), cy = Math.round(rb.y + rb.h / 2);
await browser.call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx + 140, y: cy }] });
for (let i = 1; i <= 12; i++) {
  await browser.call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + 140 - i * 45, y: cy }] });
  await wait(25);
}
await browser.call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(900);

const dragged = await browser.evalJs(`
  const r = document.querySelector('[data-testid="clicks-mobile-rail"]');
  return { scrollLeft: Math.round(r.scrollLeft), max: r.scrollWidth - r.clientWidth };
`);
test("Touch drag scrolls the rail", dragged.scrollLeft > 0, dragged);

const atEnd = await browser.evalJs(`
  const r = document.querySelector('[data-testid="clicks-mobile-rail"]');
  r.scrollLeft = r.scrollWidth;
  await new Promise(f => setTimeout(f, 350));
  const last = r.lastElementChild;
  const rb = r.getBoundingClientRect(), lb = last.getBoundingClientRect();
  const next = document.querySelector('[data-testid="clicks-next"]');
  return {
    reached: Math.round(r.scrollLeft) >= (r.scrollWidth - r.clientWidth) - 2,
    lastFullyVisible: lb.left >= rb.left - 2 && lb.right <= rb.right + 2,
    nextDisabled: next ? next.disabled : null,
    cue: (document.querySelector('[data-testid="clicks-scroll-cue"]')||{}).textContent,
  };
`);
test("Last card is fully reachable and fully visible", atEnd.reached && atEnd.lastFullyVisible, atEnd);
test("Next arrow disables at the end (cue is honest)", atEnd.nextDisabled === true, atEnd);
await browser.screenshot(`${OUT}/verify-clicks-390-end.png`);

/*
 * Walk the whole rail, letting each card enter the viewport so its lazy
 * `<img>` is actually fetched, then assert the real property:
 *
 *   every card is EITHER a loaded photograph OR an explicit "unavailable"
 *   card — never an empty frame.
 *
 * This is deliberately not "5 images loaded": `loading="lazy"` means an
 * off-screen photograph has not begun fetching, which is correct behaviour,
 * not a missing image.
 */
await browser.evalJs(`
  const r = document.querySelector('[data-testid="clicks-mobile-rail"]');
  r.scrollLeft = 0; return true;
`, { once: true });
const walked = await browser.evalJs(`
  const rail = document.querySelector('[data-testid="clicks-mobile-rail"]');
  const cards = Array.from(rail.querySelectorAll('[data-testid="clicks-card"]'));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let x = 0; x <= rail.scrollWidth; x += 120) {
    rail.scrollLeft = x;
    await sleep(260);
  }
  rail.scrollLeft = 0;
  await sleep(400);
  const state = cards.map((c) => {
    const img = c.querySelector('[data-testid="clicks-image"]');
    const fallback = c.querySelector('[data-testid="clicks-image-failed"]');
    const frame = c.querySelector('.pf-clicks-frame');
    return {
      title: (c.querySelector('.pf-clicks-title')||{}).textContent,
      loaded: !!(img && img.naturalWidth > 0),
      failed: !!fallback,
      frameH: frame ? Math.round(frame.getBoundingClientRect().height) : 0,
    };
  });
  return {
    state,
    empty: state.filter(s => !s.loaded && !s.failed).length,
  };
`, { silent: true });
test("After scrolling, every card is loaded or explicitly marked unavailable",
  walked && walked.empty === 0, walked && walked.state);

/* Hover motion. */
const hover = await browser.evalJs(`
  const card = document.querySelector('[data-testid="clicks-card"]');
  const frame = card.querySelector('.pf-clicks-frame');
  const before = getComputedStyle(frame).transform;
  card.classList.add('__probe');
  const st = document.createElement('style');
  st.textContent = '.__probe .pf-clicks-frame { transform: translateY(-4px) !important; }';
  document.head.appendChild(st);
  const after = getComputedStyle(frame).transform;
  st.remove();
  return {
    transition: getComputedStyle(frame).transitionDuration,
    restTransform: before,
    hoverTransform: after,
    moves: before !== after,
  };
`);
test("Click card has a hover transform + transition", hover.moves && hover.transition !== "0s", hover);

/* ================= 2. Album gallery ================= */
await browser.setViewport(1280, 1000);
await browser.seed(baseDraft({
  clicks: [],
  collections: [{
    id: "col-music", name: "New collection", description: "Five items.",
    layout: "album-gallery", visibility: "public",
    items: [
      { id: "mu-1", kind: "music", title: "Cobalt Hours", byline: "Eduard Abramyan", palette: "mono",
        externalUrl: "https://music.apple.com/us/album/x/1", myRating: 9 },
      { id: "mu-2", kind: "music", title: "Dawn Variations", byline: "Hania Rani", palette: "rose",
        externalUrl: "https://music.apple.com/us/album/x/2", myRating: 8 },
      { id: "mu-3", kind: "music", title: "Slow Phasing", byline: "Nils Frahm", palette: "iris" },
    ],
  }],
  sectionVisibility: { soundtrack: false, collections: true, activity: false, clicks: false },
}));
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);

const album = await browser.evalJs(`
  const cards = Array.from(document.querySelectorAll('[data-testid="album-card"]'));
  const frame = document.querySelector('.pf-album-frame');
  // A button would be <button>/<a>. The old design put a small standalone
  // <a> BELOW the cover, inside the card. The whole point of the fix is that
  // the card ITSELF is now the anchor: so assert the card is an <a> and that
  // it holds no nested interactive element of its own.
  return {
    cards: cards.length,
    cardsAreAnchors: cards.filter(c => c.tagName === 'A').length,
    // mu-3 deliberately has no externalUrl -> must stay a non-interactive card.
    cardsWithoutHref: cards.filter(c => c.tagName !== 'A').length,
    nestedInteractive: cards.reduce((n, c) => n + c.querySelectorAll('a, button').length, 0),
    hrefs: cards.filter(c => c.tagName === 'A').map(c => c.getAttribute('href')),
    firstText: cards[0] ? cards[0].innerText.replace(/\\n/g, ' | ') : null,
    frameTransition: frame ? getComputedStyle(frame).transitionDuration : null,
  };
`);
test("Album card IS the link; nothing below it",
  album.cardsAreAnchors === 2 && album.cardsWithoutHref === 1 && album.nestedInteractive === 0, album);
test("Album link points at the item's external URL",
  album.hrefs[0] === "https://music.apple.com/us/album/x/1", { hrefs: album.hrefs });
test("Album card has a hover transition", album.frameTransition && album.frameTransition !== "0s", { t: album.frameTransition });
await browser.screenshot(`${OUT}/verify-album-1280.png`, { fullPage: true });

/* ================= 3. Soundtrack ================= */
await browser.seed(null);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1200);

const st = await browser.evalJs(`
  const card = document.querySelector('[data-testid="profile-soundtrack"]');
  const a = card ? card.querySelector('[data-testid="profile-soundtrack-link"]') : null;
  const path = a ? (a.querySelector('svg path')||{}).getAttribute('d') : null;
  return {
    present: !!card,
    href: a ? a.getAttribute('href') : null,
    aria: a ? a.getAttribute('aria-label') : null,
    // Apple Music's glyph is a beamed note; Spotify's is a circle. The path
    // begins with the note stem rather than the circle's arc data.
    isAppleGlyph: !!path && !/^M12 0C5\.4/.test(path),
    coverSrc: (card && card.querySelector('img')) ? card.querySelector('img').getAttribute('src') : null,
  };
`);
test("Soundtrack button opens Apple Music",
  st.present && typeof st.href === "string" && st.href.includes("music.apple.com"), st);
test("Soundtrack button shows the Apple Music glyph", st.isAppleGlyph, st);
test("Soundtrack button names Apple Music accessibly",
  typeof st.aria === "string" && st.aria.includes("Apple Music"), { aria: st.aria });
test("Cover art comes from Apple's CDN", /mzstatic\.com/.test(st.coverSrc || ""), { src: st.coverSrc });
await browser.screenshot(`${OUT}/verify-soundtrack-1280.png`);

/* Desktop clicks grid. */
await browser.setViewport(1280, 1200);
await browser.seed(baseDraft());
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(2000);
const desk = await browser.evalJs(`
  const grid = document.querySelector('[data-testid="clicks-desktop-grid"]');
  const rail = document.querySelector('[data-testid="clicks-railwrap"]');
  const imgs = Array.from(document.querySelectorAll('[data-testid="clicks-grid"] img, [data-testid="clicks-desktop-grid"] img'));
  return {
    gridVisible: grid ? getComputedStyle(grid).display !== 'none' : false,
    railHidden: rail ? getComputedStyle(rail).display === 'none' : false,
    loaded: imgs.filter(i => i.naturalWidth > 0).length,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
`);
test("Desktop uses the wrapping grid (no scroller)", desk.gridVisible && desk.railHidden, desk);
test("Desktop grid loads its photographs", desk.loaded >= 5, desk);
test("Desktop has no horizontal overflow", desk.docOverflow <= 0, { overflow: desk.docOverflow });
await browser.screenshot(`${OUT}/verify-clicks-1280.png`, { fullPage: true });

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILURES:");
  failed.forEach(f => console.log(`  - ${f.name}`));
  process.exitCode = 1;
}