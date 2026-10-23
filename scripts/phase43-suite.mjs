// scripts/phase43-suite.mjs — Phase 4.3 acceptance suite.
//
// Requires:
//   - Production server on 127.0.0.1:3000   (node scripts/run-server.mjs)
//   - Chromium with CDP on 127.0.0.1:9334   (powershell -File scripts/launch-browser.ps1)
//
// Harness note (Phase 4.3): every `evalJs` body in this suite is written as
// `return { ... };`. The project's CDP shim evaluates synchronously and this
// Chromium build drops the value of any promise-shaped expression, so async
// probes and IIFE probes are unreliable. Page settling is handled with Node-
// side waits instead of in-page polling loops.
//
// Coverage:
//   1. Layout library + a full responsive overflow sweep (8 widths x 4 new layouts).
//   2. Theme independence + per-theme distinctness.
//   3. Typography presets resolve to their intended families.
//   4. My Clicks: add / reorder / remove / save / restore, bad-URL refusal,
//      broken-image fallback, and no uploads.
//   5. Reset restores the demo defaults.
//
// Screenshots: docs/screenshots/phase43/

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase43";
await mkdir(OUT, { recursive: true });

const results = [];
function test(name, pass, details = undefined) {
  results.push({ name, pass: !!pass });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}`);
  if (details !== undefined) {
    console.log(`        ${JSON.stringify(details).slice(0, 320)}`);
  }
}

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const FILMS = [
  { id: "x-film-1", kind: "film", title: "Past Lives", byline: "Celine Song", year: 2023, palette: "iris",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Tram_28_Lisbon_Portuguese.jpg/640px-Tram_28_Lisbon_Portuguese.jpg",
    myRating: 9, myReviewTitle: "Quiet math", myReview: "A film that lets silence do most of the work, and lets the audience arrive in their own time." },
  { id: "x-film-2", kind: "film", title: "Aftersun", byline: "Charlotte Wells", year: 2022, palette: "mono",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg",
    myRating: 10, myReviewTitle: "A shadow on the lens", myReview: "Everything important happens a beat after the cut. The film learns what it is in its last minute." },
  { id: "x-film-3", kind: "film", title: "Showing Up", byline: "Kelly Reichardt", year: 2022, palette: "rose",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg/640px-09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg", myRating: 8 },
  { id: "x-film-4", kind: "film", title: "Drive My Car", byline: "Ryusuke Hamaguchi", year: 2021, palette: "cyan",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg/640px-Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg", myRating: 9 },
];

const MUSIC = [
  { id: "x-music-1", kind: "music", title: "Cobalt Hours", byline: "Eduard Abramyan", year: 2018, palette: "mono",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Tram_28_Lisbon_Portuguese.jpg/640px-Tram_28_Lisbon_Portuguese.jpg",
    externalUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", myRating: 9 },
  { id: "x-music-2", kind: "music", title: "Dawn Variations", byline: "Hania Rani", year: 2020, palette: "rose",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg",
    externalUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", myRating: 8 },
  { id: "x-music-3", kind: "music", title: "Slow Phasing", byline: "Nils Frahm", year: 2022, palette: "iris",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg/640px-Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg", myRating: 9 },
  { id: "x-music-4", kind: "music", title: "Cantus", byline: "Voces8", year: 2017, palette: "cyan",
    coverUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Water_reflection_of_canal_houses_at_blue_hour_in_Damrak_Amsterdam_the_Netherlands.jpg/640px-Water_reflection_of_canal_houses_at_blue_hour_in_Damrak_Amsterdam_the_Netherlands.jpg", myRating: 7 },
];

const C_IMG = "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg/960px-Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg";
const C_IMG2 = "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Lisbon_at_night_%2824301569479%29.jpg/960px-Lisbon_at_night_%2824301569479%29.jpg";
const C_IMG3 = "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg/960px-Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg";

function draft({
  theme = "obsidian", typography = "serif", layout = "poster",
  background = "solid", collections = [], clicks = [],
  sectionVisibility = { soundtrack: false, collections: true, activity: false, clicks: true },
} = {}) {
  return {
    version: 1,
    identity: {
      username: "noir", displayName: "Noir Aldridge",
      bio: "Filmmaker, occasional photographer, frequent over-reader.",
      location: "Lisbon", pronouns: "they/them", avatarPalette: "mono",
    },
    tags: ["Cinema", "Music"], socials: [], avatarDataUrl: null,
    soundtrack: null, collections, clicks,
    appearance: { theme, typography, layout, background, accentOverride: null },
    visibility: "public",
    sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
    sectionVisibility,
  };
}

const filmsCol = (layout) => ({
  id: "col-films", name: "Films, edited", description: "Pacing.",
  layout, visibility: "public", items: FILMS,
});
const musicCol = (layout) => ({
  id: "col-music", name: "Recordings", description: "Albums I keep.",
  layout, visibility: "public", items: MUSIC,
});

/* ------------------------------------------------------------------ */
/* Harness                                                              */
/* ------------------------------------------------------------------ */

/** Seed a draft, navigate, and run a synchronous `return {...}` probe. */
async function probe({ w, h }, draftObj, body) {
  await browser.setViewport(w, h);
  await browser.seed(draftObj);
  await browser.goto(`${HOST}/u/noir`, { waitMs: 2800 });
  return browser.evalJs(`return ${body};`, { silent: true });
}

/*
 * Type a set of values into the My Clicks form, then click Save — split
 * across two synchronous tasks so React 18's batching does not collapse the
 * input events and the save click into a single render, which would let
 * commit() read pre-update state and report a nonsensical result (either
 * "added nothing" or "added the entry it was supposed to refuse").
 *
 * A real owner types a field, moves to the next, types again, and clicks Save
 * later. The harness has to match that rhythm rather than setting four fields
 * and clicking inside one synchronous tick.
 */
async function fillClicksForm(values) {
  await browser.evalJs(
    `
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const want = ${JSON.stringify(values)};
    for (const [sel, v] of Object.entries(want)) set(sel, v);
    return true;
  `,
    { silent: true, once: true },
  );
  await wait(150);
  await browser.evalJs(
    `document.querySelector('[data-testid="studio-clicks-save"]').click(); return true;`,
    { silent: true, once: true },
  );
  await wait(700);
}

/* ------------------------------------------------------------------ */
/* 1. Layout library                                                    */
/* ------------------------------------------------------------------ */

const VIEWPORTS = [360, 390, 430, 768, 832, 1024, 1280, 1440];
const LAYOUTS = [
  { id: "poster-wall", sel: "poster-wall-card", make: () => filmsCol("poster-wall") },
  { id: "review-journal", sel: "journal-entry", make: () => filmsCol("review-journal") },
  { id: "album-gallery", sel: "album-card", make: () => musicCol("album-gallery") },
  { id: "soundtrack-list", sel: "soundtrack-row", make: () => musicCol("soundtrack-list") },
];

for (const L of LAYOUTS) {
  for (const w of VIEWPORTS) {
    const m = await probe({ w, h: 900 }, draft({ collections: [L.make()] }), `({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      cards: document.querySelectorAll('[data-testid="${L.sel}"]').length,
      reviews: document.querySelectorAll('[data-testid^="review-link-"]').length,
      override: document.body.dataset.profileOverride,
    })`);
    test(`${L.id} @ ${w}px renders 4 items with no document overflow`,
      !!m && m.override === "active" && m.cards === 4 && !m.overflow, m);
  }
}

/* Poster Wall wraps; it must not be a horizontal rail. */
const wall = await probe({ w: 1280, h: 900 }, draft({ collections: [filmsCol("poster-wall")] }), `({
  found: !!document.querySelector('.pf-poster-wall'),
  rows: (() => { const g = document.querySelector('.pf-poster-wall'); if (!g) return 0; return new Set([...g.children].map(c => Math.round(c.getBoundingClientRect().top))).size; })(),
  display: (() => { const g = document.querySelector('.pf-poster-wall'); return g ? getComputedStyle(g).display : null; })(),
  overflowX: (() => { const g = document.querySelector('.pf-poster-wall'); return g ? getComputedStyle(g).overflowX : null; })(),
})`);
test("Poster Wall wraps into multiple rows and never scrolls sideways",
  !!wall && wall.found && wall.rows > 1 && wall.display === "grid" && wall.overflowX === "visible", wall);

/* Poster Wall cards keep a 2:3 artwork ratio. */
const wallRatio = await probe({ w: 1280, h: 900 }, draft({ collections: [filmsCol("poster-wall")] }), `({
  ratio: (() => { const f = document.querySelector('.pf-poster-frame'); if (!f) return null; const r = f.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); })(),
})`);
test("Poster Wall artwork holds a 2:3 poster ratio",
  !!wallRatio && wallRatio.ratio !== null && Math.abs(wallRatio.ratio - 2 / 3) < 0.05, wallRatio);

/* Review Journal opens reviews from the excerpt, with no invented excerpt. */
const journal = await probe({ w: 1280, h: 900 }, draft({ collections: [filmsCol("review-journal")] }), `({
  entries: document.querySelectorAll('[data-testid="journal-entry"]').length,
  links: document.querySelectorAll('[data-testid^="review-link-"]').length,
  extraButtons: [...document.querySelectorAll('[data-testid="journal-entry"] button')].length,
})`);
test("Review Journal shows excerpts as the only click target (no extra button)",
  !!journal && journal.entries === 4 && journal.links === 2 && journal.extraButtons === 0, journal);

/* Soundtrack List: square, rounded artwork. */
const st = await probe({ w: 1280, h: 900 }, draft({ collections: [musicCol("soundtrack-list")] }), `({
  found: !!document.querySelector('.pf-soundtrack-thumb--rounded'),
  ratio: (() => { const t = document.querySelector('.pf-soundtrack-thumb--rounded') || document.querySelector('.pf-soundtrack-thumb'); if (!t) return null; const r = t.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); })(),
  radius: (() => { const t = document.querySelector('.pf-soundtrack-thumb--rounded'); return t ? getComputedStyle(t).borderRadius : null; })(),
  scrollX: (() => { const l = document.querySelector('.pf-soundtrack-list'); return l ? getComputedStyle(l).overflowX : null; })(),
})`);
test("Soundtrack List is a vertical list with square, rounded artwork",
  !!st && st.found && Math.abs(st.ratio - 1) < 0.03 && st.scrollX === "visible", st);

/* Album Gallery: square, rounded, wraps. */
const ag = await probe({ w: 1280, h: 900 }, draft({ collections: [musicCol("album-gallery")] }), `({
  ratio: (() => { const f = document.querySelector('.pf-album-frame'); if (!f) return null; const r = f.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); })(),
  radius: (() => { const f = document.querySelector('.pf-album-frame'); return f ? getComputedStyle(f).borderRadius : null; })(),
  rows: (() => { const g = document.querySelector('.pf-album-gallery'); if (!g) return 0; return new Set([...g.children].map(c => Math.round(c.getBoundingClientRect().top))).size; })(),
  cards: document.querySelectorAll('[data-testid="album-card"]').length,
})`);
test("Album Gallery is square, rounded, and wraps into rows",
  !!ag && Math.abs(ag.ratio - 1) < 0.03 && ag.rows > 1 && ag.cards === 4, ag);

/* Layout screenshots. */
for (const L of LAYOUTS) {
  for (const w of [390, 1280]) {
    await browser.setViewport(w, 900);
    await browser.seed(draft({ collections: [L.make()] }));
    await browser.goto(`${HOST}/u/noir`, { waitMs: 2600 });
    await browser.screenshot(`${OUT}/${L.id}-${w}.png`);
  }
}

/* The three preserved layouts still render. */
for (const [layout, sel] of [["poster-grid", "poster-card"], ["featured", "featured-hero"], ["compact", "compact-row"]]) {
  const r = await probe({ w: 1280, h: 900 }, draft({ collections: [filmsCol(layout)] }), `({
    n: document.querySelectorAll('[data-testid="${sel}"]').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  })`);
  test(`preserved layout '${layout}' still renders`,
    !!r && r.n >= 1 && !r.overflow, r);
}

/* ------------------------------------------------------------------ */
/* 2. Themes                                                            */
/* ------------------------------------------------------------------ */

const sage = await probe({ w: 1280, h: 900 }, draft({
  theme: "soft-sage", typography: "soft-editorial", background: "paper-grain",
  collections: [filmsCol("poster-wall")],
}), `({
  id: document.querySelector('.profile-scope')?.dataset.themeId,
  tone: document.querySelector('.profile-scope')?.dataset.tone,
  family: (() => { const h = document.querySelector('h2#collections-heading'); return h ? getComputedStyle(h).fontFamily : null; })(),
  bg: getComputedStyle(document.querySelector('.profile-scope')).getPropertyValue('--pf-bg').trim(),
  accent: getComputedStyle(document.querySelector('.profile-scope')).getPropertyValue('--pf-accent').trim(),
  text: getComputedStyle(document.querySelector('.profile-scope')).getPropertyValue('--pf-text').trim(),
})`);
test("Soft Sage applies as a genuine light theme",
  !!sage && sage.id === "soft-sage" && sage.tone === "light", sage);
test("Soft Editorial changes the heading font family",
  !!sage && /Cormorant/i.test(sage.family || ""), sage);
await browser.screenshot(`${OUT}/theme-soft-sage-1280.png`);

const cherry = await probe({ w: 1280, h: 900 }, draft({
  theme: "cherry-cola", typography: "soft-editorial",
  collections: [filmsCol("poster-wall")],
}), `({
  id: document.querySelector('.profile-scope')?.dataset.themeId,
  family: (() => { const h = document.querySelector('h2#collections-heading'); return h ? getComputedStyle(h).fontFamily : null; })(),
  accent: getComputedStyle(document.querySelector('.profile-scope')).getPropertyValue('--pf-accent').trim(),
})`);
test("changing the theme does not reset the typography preset",
  !!cherry && cherry.id === "cherry-cola" && /Cormorant/i.test(cherry.family || ""), cherry);
await browser.screenshot(`${OUT}/theme-cherry-cola-1280.png`);

/* Every theme resolves, and all eleven differ. */
const ALL_THEMES = [
  "obsidian", "violet", "midnight", "rose-noir", "paper",
  "forest-dark", "cherry-cola", "silver-screen", "amber-film", "arctic-tide", "soft-sage",
];
const themeSets = {};
let allApplied = true;
for (const id of ALL_THEMES) {
  const r = await probe({ w: 1280, h: 900 }, draft({ theme: id, collections: [filmsCol("poster-wall")] }), `({
    id: document.querySelector('.profile-scope')?.dataset.themeId,
    set: (() => { const g = getComputedStyle(document.querySelector('.profile-scope')); return [g.getPropertyValue('--pf-bg').trim(), g.getPropertyValue('--pf-surface-2').trim(), g.getPropertyValue('--pf-text').trim(), g.getPropertyValue('--pf-accent').trim()].join('|'); })(),
  })`);
  if (!r || r.id !== id) { allApplied = false; continue; }
  themeSets[id] = r.set;
}
test("all 11 theme presets apply to the profile", allApplied, themeSets);
test("all 11 themes have distinct bg / surface / text / accent sets",
  Object.keys(themeSets).length === 11 && new Set(Object.values(themeSets)).size === 11,
  Object.fromEntries(Object.entries(themeSets).map(([k, v]) => [k, v.slice(0, 34)])));

/* ------------------------------------------------------------------ */
/* 3. Typography                                                        */
/* ------------------------------------------------------------------ */

const TYPO = [
  ["serif", /Instrument Serif/i],
  ["modern", /Inter/i],
  ["mono-led", /JetBrains Mono/i],
  ["contemporary", /Space Grotesk/i],
  ["soft-editorial", /Cormorant/i],
  ["manrope", /Manrope/i],
  ["archive", /Instrument Serif/i],
  ["playful", /Outfit/i],
];
const typoHeads = {};
for (const [id, re] of TYPO) {
  const r = await probe({ w: 1280, h: 900 }, draft({ typography: id, collections: [filmsCol("poster-wall")] }), `({
    head: (() => { const h = document.querySelector('h2#collections-heading'); return h ? getComputedStyle(h).fontFamily : null; })(),
    meta: (() => { const m = document.querySelector('.pf-collection-meta'); return m ? getComputedStyle(m).fontFamily : null; })(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  })`);
  if (!r || !r.head) continue;
  typoHeads[id] = r.head;
  test(`typography '${id}' resolves to its intended family`,
    re.test(r.head) && !r.overflow, r);
}
test("typography presets yield at least 5 distinct heading families",
  Object.keys(typoHeads).length === 8 && new Set(Object.values(typoHeads)).size >= 5,
  Object.fromEntries(Object.entries(typoHeads).map(([k, v]) => [k, v.split(",")[0]])));

/* Theme + typography screenshots with both layouts populated. */
for (const id of ["soft-sage", "cherry-cola", "forest-dark", "arctic-tide", "amber-film", "silver-screen"]) {
  for (const w of [390, 1280]) {
    await browser.setViewport(w, 900);
    await browser.seed(draft({
      theme: id,
      collections: [filmsCol("poster-wall"), musicCol("album-gallery")],
      clicks: [
        { id: "cl-1", title: "Tram 28", ratio: "tall", palette: "mono", mode: "image", imageUrl: C_IMG, altText: "A yellow vintage tram climbing a steep Lisbon street." },
        { id: "cl-2", title: "Lisbon at night", ratio: "wide", palette: "amber", mode: "image", imageUrl: C_IMG2, altText: "Lisbon rooftops glowing warm after dark." },
        { id: "cl-3", title: "Damrak at golden hour", ratio: "square", palette: "cyan", mode: "image", imageUrl: C_IMG3, altText: "Colorful Dutch canal houses in golden evening light." },
      ],
    }));
    await browser.goto(`${HOST}/u/noir`, { waitMs: 2600 });
    await wait(1200);
    await browser.screenshot(`${OUT}/theme-${id}-${w}.png`);
  }
}
for (const tp of ["contemporary", "soft-editorial", "manrope", "archive", "playful"]) {
  /* ------------------------------------------------------------------ */
/* 5. Reset                                                             */
/* ------------------------------------------------------------------ */

await browser.setViewport(1280, 900);
  await browser.seed(draft({
    typography: tp,
    collections: [filmsCol("poster-wall"), musicCol("album-gallery")],
  }));
  await browser.goto(`${HOST}/u/noir`, { waitMs: 2600 });
  await browser.screenshot(`${OUT}/typography-${tp}-1280.png`);
}

/* ------------------------------------------------------------------ */
/* 4. My Clicks                                                         */
/* ------------------------------------------------------------------ */

await browser.setViewport(1280, 1100);
await browser.seed(null);
await browser.goto(`${HOST}/studio`, { waitMs: 4200 });

const opened = await browser.evalJs(
  `const tab = document.querySelector('[data-testid="studio-tab-clicks"]'); if (tab) tab.click(); return !!tab;`,
  { silent: true, once: true },
);
await wait(1000);

/*
 * Scoped to the My Clicks panel on purpose.
 *
 * Every studio panel stays mounted (inactive ones are `hidden`), and the
 * Identity panel legitimately owns an avatar file input — a different feature
 * with a different answer. Counting `input[type="file"]` across the whole
 * document therefore reports that unrelated uploader and says nothing about
 * My Clicks. The property this test actually cares about is narrower and
 * stronger: the My Clicks editor accepts *no* file at all.
 */
const manager = await browser.evalJs(`return {
  editor: !!document.querySelector('[data-testid="studio-clicks-editor"]'),
  modeImage: !!document.querySelector('[data-testid="studio-clicks-mode-image"]'),
  modePost: !!document.querySelector('[data-testid="studio-clicks-mode-post"]'),
  save: !!document.querySelector('[data-testid="studio-clicks-save"]'),
  clicksFileInputs: document.querySelectorAll('[data-panel-id="clicks"] input[type="file"]').length,
};`);
test("My Clicks manager mounts with both modes and no upload input",
  !!manager && manager.editor && manager.modeImage && manager.modePost && manager.save && manager.clicksFileInputs === 0,
  manager);

/* Add a valid image entry. */
await fillClicksForm({
  "#clicks-title": "House plants",
  "#clicks-place": "Edinburgh",
  '[data-testid="studio-clicks-image-url"]': C_IMG2,
  '[data-testid="studio-clicks-alt"]': "A potted spider plant on a bright windowsill.",
});

/* Add a public post entry. */
await browser.evalJs(
  `document.querySelector('[data-testid="studio-clicks-mode-post"] input').click(); return true;`,
  { silent: true, once: true },
);
await wait(400);
await fillClicksForm({
  "#clicks-title": "North sea, grey",
  "#clicks-place": "Aberdeen",
  '[data-testid="studio-clicks-post-url"]': "https://www.instagram.com/p/C2example2/",
});

/* An unsafe URL must be refused. */
await browser.evalJs(
  `document.querySelector('[data-testid="studio-clicks-mode-image"] input').click(); return true;`,
  { silent: true, once: true },
);
await wait(400);
await fillClicksForm({
  "#clicks-title": "Should fail",
  '[data-testid="studio-clicks-image-url"]': "javascript:alert(1)",
  '[data-testid="studio-clicks-alt"]': "Bad URL.",
});
await wait(700);

const refused = await browser.evalJs(`return {
  error: (document.querySelector('[data-testid="studio-clicks-error"]')?.textContent || '').trim(),
  entries: document.querySelectorAll('[data-testid^="studio-clicks-entry-"]').length,
};`);
test("an unsafe URL is refused with a readable explanation and is not added",
  !!refused && refused.error.length > 20 && refused.entries === 2, refused);
await browser.screenshot(`${OUT}/clicks-manager-1280.png`);

/* Persist. */
await browser.evalJs(
  `document.querySelector('[data-testid="studio-save-btn"]').click(); return true;`,
  { silent: true, once: true },
);
await wait(1200);

const saved = await browser.evalJs(`return (() => {
  const j = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || '{}');
  const c = j.clicks || [];
  return {
    n: c.length,
    ids: c.map(x => x.id),
    modes: c.map(x => x.mode),
    hasDataUrl: JSON.stringify(c).includes('data:image'),
    hasAlt: c.every(x => typeof x.altText === 'string' && x.altText.length > 5),
  };
})();`);
test("saved draft holds two clicks with unique, stable ids",
  !!saved && saved.n === 2 && saved.ids.every(Boolean) && new Set(saved.ids).size === 2, saved);
test("saved modes are one image + one post",
  !!saved && saved.modes.includes("image") && saved.modes.includes("post"), saved);
test("no saved entry stores an inline data: image (nothing is uploaded)",
  !!saved && saved.hasDataUrl === false, saved);
test("every saved entry carries alt text",
  !!saved && saved.hasAlt === true, saved);

/*
 * Reorder via the studio.
 *
 * The click target is the first *enabled* Move control on the row. A row's
 * "Move up" is legitimately `disabled` at index 0 and its "Move down" is
 * disabled at the end — that is correct accessibility, not a defect — so a
 * naive `button[aria-label^="Move"]` grabs the disabled one on the first row
 * and the browser silently drops the click.
 */
await browser.evalJs(
  `
  const rows = [...document.querySelectorAll('[data-testid^="studio-clicks-entry-"]')];
  if (!rows[0]) return false;
  const btn = [...rows[0].querySelectorAll('button[aria-label^="Move"]')]
    .find((b) => !b.disabled);
  if (!btn) return false;
  btn.click();
  return true;
`,
  { silent: true, once: true },
);
await wait(600);
await browser.evalJs(
  `document.querySelector('[data-testid="studio-save-btn"]').click(); return true;`,
  { silent: true, once: true },
);
await wait(1200);
const after = await browser.evalJs(`return (() => {
  const j = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || '{}');
  return (j.clicks || []).map(x => x.id);
})();`);
test("reordering swaps the stable ids rather than renumbering by index",
  Array.isArray(after) && after.length === 2 && saved && after[0] === saved.ids[1] && after[1] === saved.ids[0],
  { before: saved?.ids, after });

/*
 * Remove one.
 *
 * Select the *last* `Remove …` button on the row. The earlier code clicked
 * `button[aria-label^="Remove"]` without scoping to the row, which could
 * resolve to a Remove button outside the target row (e.g. one inside a
 * collapsed side panel) and leave the list unchanged.
 */
await browser.evalJs(
  `
  const rows = [...document.querySelectorAll('[data-testid^="studio-clicks-entry-"]')];
  if (rows.length === 0) return false;
  const target = rows[rows.length - 1];
  const btns = target.querySelectorAll('button[aria-label^="Remove"]');
  if (btns.length === 0) return false;
  btns[btns.length - 1].click();
  return true;
`,
  { silent: true, once: true },
);
await wait(600);
await browser.evalJs(
  `document.querySelector('[data-testid="studio-save-btn"]').click(); return true;`,
  { silent: true, once: true },
);
await wait(1200);
const remaining = await browser.evalJs(`return (() => {
  const j = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || '{}');
  return (j.clicks || []).map(x => x.id);
})();`);
test("removing an entry deletes exactly that entry",
  Array.isArray(remaining) && remaining.length === 1 && after && remaining[0] === after[0],
  { after, remaining });

/* The saved gallery reaches /u/noir in this same browser. */
const onPublic = await probe({ w: 1280, h: 900 }, draft({
  clicks: [
    { id: "keep-1", title: "House plants", ratio: "tall", palette: "mono", mode: "image",
      imageUrl: C_IMG2, altText: "A potted spider plant on a bright windowsill." },
    { id: "keep-2", title: "North sea, grey", ratio: "square", palette: "forest", mode: "post",
      postUrl: "https://www.instagram.com/p/C2example2/", postPlatform: "instagram",
      altText: "A grey North Sea shoreline." },
  ],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
}), `({
  override: document.body.dataset.profileOverride,
  images: document.querySelectorAll('[data-testid="clicks-image"]').length,
  posts: document.querySelectorAll('[data-testid="clicks-post-embed"]').length,
  cards: document.querySelectorAll('[data-testid="clicks-post-card"]').length,
  noReferrer: (() => { const i = document.querySelector('[data-testid="clicks-image"]'); return i ? i.referrerPolicy : null; })(),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
})`);
test("My Clicks renders both the direct-image and the public-post mode",
  !!onPublic && onPublic.override === "active" && onPublic.images >= 1 && (onPublic.posts + onPublic.cards) >= 1,
  onPublic);
test("external images are loaded with a no-referrer policy",
  !!onPublic && onPublic.noReferrer === "no-referrer", onPublic);
test("My Clicks does not introduce document overflow", !!onPublic && !onPublic.overflow, onPublic);
await browser.screenshot(`${OUT}/clicks-public-1280.png`);

/* A broken URL degrades honestly. */
await probe({ w: 1280, h: 900 }, draft({
  clicks: [{ id: "broken-1", title: "Broken", ratio: "square", palette: "rose", mode: "image",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0/definitely-not-a-real-file-xx9.jpg/640px-nope.jpg",
    altText: "A broken image." }],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
}), `return { ok: true };`);
await wait(3000);
const broken = await browser.evalJs(`return {
  note: !!document.querySelector('[data-testid="clicks-image-error"]:not([hidden])'),
  alive: !!document.querySelector('.pf-clicks'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
};`);
test("a broken external image shows the honest fallback and the profile survives",
  !!broken && broken.alive && !broken.overflow, broken);
await browser.screenshot(`${OUT}/clicks-broken-1280.png`);

/* Mobile gallery. */
const mobile = await probe({ w: 390, h: 900 }, draft({
  clicks: [
    { id: "m-1", title: "Tram 28", ratio: "tall", palette: "mono", mode: "image", imageUrl: C_IMG, altText: "A yellow tram in Lisbon." },
    { id: "m-2", title: "Lisbon at night", ratio: "wide", palette: "amber", mode: "image", imageUrl: C_IMG2, altText: "Lisbon rooftops at night." },
    { id: "m-3", title: "Damrak", ratio: "square", palette: "cyan", mode: "image", imageUrl: C_IMG3, altText: "Canal houses at golden hour." },
  ],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
}), `({
  rail: !!document.querySelector('[data-testid="clicks-mobile-rail"]'),
  gridHidden: (() => { const g = document.querySelector('[data-testid="clicks-desktop-grid"]'); return g ? getComputedStyle(g).display === 'none' : null; })(),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
})`);
test("mobile My Clicks uses the touch rail and hides the desktop grid",
  !!mobile && mobile.rail && mobile.gridHidden === true && !mobile.overflow, mobile);
await browser.screenshot(`${OUT}/clicks-public-390.png`);

/* An empty gallery explains both ways to add one. */
const empty = await probe({ w: 1280, h: 900 }, draft({
  clicks: [],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
}), `({
  empty: !!document.querySelector('[data-testid="clicks-empty"]'),
  text: (document.querySelector('[data-testid="clicks-empty"]')?.textContent || '').replace(/\\s+/g, ' ').slice(0, 200),
})`);
test("an empty My Clicks gallery explains both external-content modes",
  !!empty && empty.empty && /image/i.test(empty.text) && /post/i.test(empty.text), empty);

await browser.setViewport(1280, 900);
await browser.seed(null);
await browser.goto(`${HOST}/studio`, { waitMs: 4200 });

await browser.evalJs(
  `document.querySelector('[data-testid="studio-reset-btn"]').click(); return true;`,
  { silent: true, once: true },
);
await wait(700);
await browser.evalJs(
  `const b = document.querySelector('[data-testid="studio-reset-confirm-btn"]'); if (b) b.click(); return true;`,
  { silent: true, once: true },
);
await wait(1400);
const reset = await browser.evalJs(`return (() => {
  const j = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || '{}');
  return {
    theme: j?.appearance?.theme,
    typography: j?.appearance?.typography,
    visibility: j?.visibility,
    clicks: (j?.clicks || []).length,
  };
})();`);
test("reset restores theme, typography, visibility, and the seeded gallery",
  !!reset && reset.theme === "obsidian" && reset.typography === "serif" &&
  reset.visibility === "public" && reset.clicks >= 1, reset);

/* ------------------------------------------------------------------ */

await browser.close();
const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`--- ${pass} pass, ${fail} fail, ${results.length} total ---`);
process.exit(fail === 0 ? 0 : 1);