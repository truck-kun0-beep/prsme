// scripts/phase45-audit2.mjs — two focused checks the first audit left open.

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase45";
await mkdir(OUT, { recursive: true });

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (l, v) => console.log(`${l}: ${JSON.stringify(v)}`);

const T = (slug) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${slug}`;

/* ---- Music list under the soundtrack-list layout (the screenshot's list) ---- */
const musicItems = [
  { id: "mu-1", kind: "music", title: "Call Out My Name", byline: "The Weeknd", year: 2016, palette: "mono",
    coverUrl: T("b/b4/Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg/640px-Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg"),
    externalUrl: "https://music.apple.com/us/album/x/1", myRating: 9 },
  { id: "mu-2", kind: "music", title: "I Feel It Coming (feat. Daft Punk)", byline: "The Weeknd", palette: "rose",
    coverUrl: T("1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg"),
    externalUrl: "https://music.apple.com/us/album/x/2", myRating: 8 },
  { id: "mu-3", kind: "music", title: "Weeknd (LP & Hard)", byline: "EXID", palette: "cyan", myRating: 7 },
];

const draft = {
  version: 1,
  identity: { username: "noir", displayName: "Noir Aldridge",
    bio: "Filmmaker, occasional photographer, frequent over-reader.",
    location: "Lisbon", pronouns: "they/them", avatarPalette: "mono" },
  tags: ["Cinema", "Music"], socials: [], avatarDataUrl: null,
  soundtrack: null,
  collections: [{ id: "col-music", name: "Albums on Repeat",
    description: "The records I return to when the rest of the world gets too loud.",
    layout: "soundtrack-list", visibility: "public", items: musicItems }],
  clicks: [],
  appearance: { theme: "obsidian", typography: "serif", layout: "poster", background: "solid", accentOverride: null },
  visibility: "public",
  sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
  sectionVisibility: { soundtrack: false, collections: true, activity: false, clicks: false },
};

await browser.setViewport(1280, 1100);
await browser.seed(draft);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);

const music = await browser.evalJs(`
  const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
  const links = document.querySelectorAll('.pf-soundtrack-link');
  const thumbs = rows.map(r => {
    const t = r.querySelector('.pf-soundtrack-thumb');
    if (!t) return null;
    const b = t.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), radius: getComputedStyle(t).borderRadius };
  });
  return {
    rows: rows.length,
    squareLinkButtons: links.length,
    linksAreAnchors: Array.from(links).every(l => l.tagName === 'A'),
    rowIsAnchor: rows.filter(r => r.tagName === 'A').length,
    rowIsListItem: rows.filter(r => r.tagName === 'LI').length,
    nestedAnchors: rows.map(r => r.querySelectorAll('a').length),
    thumbs,
    // Whether a review excerpt already nests a link inside the row.
    rowsWithReviewLink: rows.filter(r => r.querySelector('[data-testid^="review-link-"]')).length,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
`);
note("music-list", music);
await browser.screenshot(`${OUT}/audit-music-soundtracklist-1280.png`, { fullPage: true });

/* ---- Apple Music glyph: does it clip inside its viewBox? ---- */
await browser.seed(null);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1200);

const glyph = await browser.evalJs(`
  const svg = document.querySelector('[data-testid="profile-soundtrack-link"] svg');
  const path = svg.querySelector('path');
  const pb = path.getBBox();
  const vb = svg.viewBox.baseVal;
  return {
    viewBox: [vb.x, vb.y, vb.width, vb.height],
    pathBBox: { x: +pb.x.toFixed(2), y: +pb.y.toFixed(2), w: +pb.width.toFixed(2), h: +pb.height.toFixed(2) },
    // Clipping occurs when the path's box escapes the viewBox on any side.
    clippedTop: pb.y < vb.y,
    clippedBottom: (pb.y + pb.height) > (vb.y + vb.height),
    clippedLeft: pb.x < vb.x,
    clippedRight: (pb.x + pb.width) > (vb.x + vb.width),
    // The classic Apple Music mark's two defining features.
    dHasBeam: (path.getAttribute('d')||'').length > 500,
    fillsBox: pb.width / vb.width,
  };
`);
note("apple-glyph", glyph);

// Zoomed capture of just the button so the mark is actually visible.
const btn = await browser.evalJs(`
  const b = document.querySelector('[data-testid="profile-soundtrack-link"]');
  b.scrollIntoView({block:'center'}); return true;
`, { once: true });
await wait(400);
const clip = await browser.call("Page.getLayoutMetrics");
await browser.screenshot(`${OUT}/audit-applemusic-zoom.png`, { clip: undefined });
await browser.screenshot(`${OUT}/audit-applemusic-zoom-1280.png`);

await browser.close();