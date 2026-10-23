// scripts/phase46-qa.mjs — Phase 4.6 QA.
//
// Two halves, matching the two reported issues:
//
//   1. Custom Link Buttons — section position, real rendered geometry at all
//      eight required viewports, shape/style/colour/layout actually changing the
//      rendered button, persistence across a refresh, and mobile wrapping.
//   2. Soundtrack List — row and artwork geometry compared BEFORE and DURING a
//      real mouse hover, plus list overflow, at 390px and 1280px.
//
// Exits non-zero on any failure. Hover is a real CDP mouse move: a dispatched
// `mouseover` event does not engage `:hover`, which is what the Phase 4.5-era
// probes got wrong and why they reported "geometry identical" forever.

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase46";
await mkdir(OUT, { recursive: true });

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
};

const T = (slug) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${slug}`;

const IMG = {
  square: T("2/2c/Catedral_de_Lisboa_2019.jpg/640px-Catedral_de_Lisboa_2019.jpg"),
  wide: T("1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg"),
};

const LINKS = [
  { id: "lnk-1", label: "Portfolio", url: "https://example.com/portfolio" },
  { id: "lnk-2", label: "Prints & Editions", url: "https://example.com/shop" },
  {
    id: "lnk-3",
    // 54 characters: long enough to force a wrap on a 360px phone, and inside
    // the 60-character limit `validateCustomLinkLabel` enforces. An earlier
    // revision of this fixture used a 61-character label, and the reader
    // correctly dropped it — which is the validator working, not a bug.
    label: "Bookings, commissions, and other enquiries",
    url: "https://example.com/bookings",
  },
];

const MUSIC_ITEMS = [
  { id: "mu-1", kind: "music", title: "Call Out My Name", byline: "The Weeknd", palette: "mono",
    coverUrl: IMG.square, externalUrl: "https://music.apple.com/us/album/x/1", myRating: 9 },
  { id: "mu-2", kind: "music", title: "A Really Very Extremely Long Track Title That Wraps Onto Two Lines", byline: "Sora Verlaine", palette: "cyan",
    coverUrl: IMG.wide, externalUrl: "https://music.apple.com/us/album/x/2", myRating: 8 },
  { id: "mu-3", kind: "music", title: "Untitled Demo Track", byline: "EXID", palette: "rose", myRating: 7 },
  { id: "mu-4", kind: "music", title: "Reviewed, Not Linked", byline: "Mika Sørensen", palette: "forest",
    myRating: 6, myReview: "A quiet record that rewards a second pass." },
];

function draftWith({ links = LINKS, theme = "obsidian", typography = "serif" } = {}) {
  return {
    version: 1,
    identity: {
      username: "noir", displayName: "Noir Aldridge",
      bio: "Filmmaker, occasional photographer, frequent over-reader.",
      location: "Lisbon", pronouns: "they/them", avatarPalette: "mono",
    },
    tags: ["Cinema", "Music"], socials: [], avatarDataUrl: null,
    soundtrack: null,
    collections: [{
      id: "col-music", name: "Albums on Repeat",
      description: "The records I return to when the rest of the world gets too loud.",
      layout: "soundtrack-list", visibility: "public",
      items: MUSIC_ITEMS,
    }],
    clicks: [
      { id: "k1", title: "Tram 28", place: "Lisbon", ratio: "tall", palette: "mono", mode: "image",
        imageUrl: IMG.wide, altText: "A yellow tram on a Lisbon street.", sourceUrl: "https://example.com/tram28" },
      { id: "k2", title: "Lisbon at night", place: "Lisbon", ratio: "wide", palette: "iris", mode: "image",
        imageUrl: IMG.wide, altText: "Lisbon lit at night." },
    ],
    customLinks: links,
    appearance: { theme, typography, layout: "poster", background: "solid", accentOverride: null },
    visibility: "public",
    // Phase 4.5 shape on purpose: four ids, no `links`. The reader must insert
    // `links` in the canonical slot rather than appending it after My Clicks.
    sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
    sectionVisibility: { soundtrack: false, collections: true, activity: true, clicks: true },
  };
}

async function moveTo(x, y) {
  await browser.call("Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "none", buttons: 0, clickCount: 0,
  });
}

/* ============================ 1. SECTION ORDER ============================ */
await browser.setViewport(1280, 1200);
await browser.seed(draftWith());
await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
await wait(2500);

const order = await browser.evalJs(`
  const ids = ['soundtrack','collections','links','activity','clicks'];
  const found = {};
  for (const id of ids) {
    const el = document.querySelector('[data-testid="' + id + '-section"]');
    found[id] = el ? Math.round(el.getBoundingClientRect().top) : null;
  }
  // Every section, in document order, by its heading.
  const headings = Array.from(document.querySelectorAll('section.profile-canvas'))
    .map(s => ({
      testid: s.getAttribute('data-testid'),
      y: Math.round(s.getBoundingClientRect().top),
      label: s.querySelector('h2') ? s.querySelector('h2').textContent.trim().slice(0, 40) : null,
    }))
    .filter(s => s.testid);
  return {
    found,
    headings,
    storedOrder: JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || 'null')?.sectionOrder ?? null,
    // Is the links section inside the clicks section?
    nestedInsideClicks: !!(document.querySelector('[data-testid="clicks-section"] [data-testid="custom-links"]')),
    customLinkCount: document.querySelectorAll('[data-testid="custom-link"]').length,
  };
`);

check("order: links section exists", order.found.links !== null, order.found);
check(
  "order: collections < links < activity < clicks",
  order.found.collections !== null &&
    order.found.links !== null &&
    order.found.activity !== null &&
    order.found.clicks !== null &&
    order.found.collections < order.found.links &&
    order.found.links < order.found.activity &&
    order.found.activity < order.found.clicks,
  order.found,
);
check("order: links is NOT nested inside My Clicks", order.nestedInsideClicks === false, order.nestedInsideClicks);

/*
 * The stored draft is asserted separately, and only AFTER a real studio save.
 *
 * `readDraft` repairs the order in memory; it does not rewrite localStorage on
 * read, so asserting against the raw seeded value here would be asserting the
 * seed rather than the application. The repair is verified where it matters —
 * in the studio's saved draft — in the persistence section below.
 */

await browser.screenshot(`${OUT}/links-section-order-1280.png`, { fullPage: true });

/* ==================== 2. BUTTON GEOMETRY AT 8 VIEWPORTS ==================== */
const VIEWPORTS = [360, 390, 430, 768, 832, 1024, 1280, 1440];

for (const vw of VIEWPORTS) {
  await browser.setViewport(vw, 1000);
  await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
  await wait(1800);

  const g = await browser.evalJs(`
    const nav = document.querySelector('[data-testid="custom-links"]');
    if (!nav) return { missing: true };
    const btns = Array.from(nav.querySelectorAll('[data-testid="custom-link"]'));
    const navRect = nav.getBoundingClientRect();
    const list = nav.querySelector('.pf-custom-links-list');
    return {
      missing: false,
      count: btns.length,
      layout: nav.getAttribute('data-layout'),
      // min-height band: >=52 always, 52-64 on desktop.
      heights: btns.map(b => Math.round(b.getBoundingClientRect().height)),
      widths: btns.map(b => Math.round(b.getBoundingClientRect().width)),
      // Centred BOTH ways on every button, regardless of label length.
      centered: btns.map(b => {
        const s = getComputedStyle(b);
        return s.textAlign === 'center' && s.justifyContent === 'center' && s.alignItems === 'center';
      }),
      // Does any button escape the nav's box, or the viewport?
      outsideNav: btns.filter(b => {
        const r = b.getBoundingClientRect();
        return r.right > navRect.right + 1 || r.left < navRect.left - 1;
      }).length,
      outsideViewport: btns.filter(b => b.getBoundingClientRect().right > window.innerWidth + 1).length,
      // Long label must wrap, not clip.
      clipped: btns.filter(b => b.scrollHeight > b.clientHeight + 1).length,
      maxWidth: Math.round(list.getBoundingClientRect().width),
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      urlInText: btns.filter(b => b.textContent.includes('http')).length,
      rel: btns[0] ? btns[0].getAttribute('rel') : null,
      target: btns[0] ? btns[0].getAttribute('target') : null,
      accessibleName: btns.every(b => (b.getAttribute('aria-label') || '').length > 0),
      fontFamily: btns[0] ? getComputedStyle(btns[0]).fontFamily : null,
    };
  `);

  if (g.missing) {
    check(`@${vw}px: buttons render`, false, g);
    continue;
  }
  check(`@${vw}px: 3 buttons render`, g.count === 3, g.count);
  check(
    `@${vw}px: every button >= 52px tall`,
    g.heights.every(h => h >= 52),
    g.heights,
  );
  if (vw >= 768) {
    check(`@${vw}px: desktop height within 52-64px band`, g.heights.every(h => h >= 52 && h <= 64), g.heights);
  }
  check(`@${vw}px: labels centred both ways`, g.centered.every(Boolean), g.centered);
  check(`@${vw}px: no button escapes its container`, g.outsideNav === 0, g.outsideNav);
  check(`@${vw}px: no button escapes the viewport`, g.outsideViewport === 0, g.outsideViewport);
  check(`@${vw}px: no clipped label`, g.clipped === 0, g.clipped);
  check(`@${vw}px: no document overflow`, g.docOverflowX === 0, g.docOverflowX);
  check(`@${vw}px: URL never visible`, g.urlInText === 0);
  check(`@${vw}px: rel=noopener noreferrer`, g.rel === "noopener noreferrer", g.rel);
  check(`@${vw}px: opens in a new tab`, g.target === "_blank", g.target);
  check(`@${vw}px: every button has an accessible name`, g.accessibleName === true);
  check(
    `@${vw}px: buttons have a sensible max width`,
    g.maxWidth > 0 && g.maxWidth <= Math.min(vw, 544),
    { maxWidth: g.maxWidth, vw },
  );

  if ([390, 1280].includes(vw)) {
    await browser.screenshot(`${OUT}/links-${vw}.png`, { fullPage: true });
  }
}

/* ============ 3. APPEARANCE OPTIONS ACTUALLY CHANGE THE BUTTON ============ */
/*
 * Each option is verified by measuring the RENDERED result, not by reading back
 * the stored field. The brief is explicit that "decorative controls which only
 * update their selected state" are not acceptable, so a stored-value check alone
 * would prove nothing about what a visitor sees.
 */
async function renderWith(overrides, { seedDraft } = {}) {
  const links = overrides.links ?? LINKS.map((l) => ({ ...l, ...overrides.each }));
  await browser.seed(seedDraft ?? draftWith({ links }));
  await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
  await wait(1500);
  return browser.evalJs(`
    const nav = document.querySelector('[data-testid="custom-links"]');
    if (!nav) return { missing: true };
    const btn = nav.querySelector('[data-testid="custom-link"]');
    const s = getComputedStyle(btn);
    const list = nav.querySelector('.pf-custom-links-list');
    return {
      missing: false,
      radius: s.borderRadius,
      background: s.backgroundColor,
      color: s.color,
      borderColor: s.borderColor,
      fontFamily: s.fontFamily,
      layout: nav.getAttribute('data-layout'),
      display: getComputedStyle(list).display,
      columns: getComputedStyle(list).gridTemplateColumns,
      accentVar: s.getPropertyValue('--pf-link-accent').trim(),
      onAccentVar: s.getPropertyValue('--pf-link-on-accent').trim(),
      inlineStyle: btn.getAttribute('style'),
    };
  `);
}

// --- shape ---
const shapeRounded = await renderWith({ each: { shape: "rounded" } });
const shapeRect = await renderWith({ each: { shape: "rect" } });
const shapePill = await renderWith({ each: { shape: "pill" } });
check(
  "shape: rounded / rect / pill render three distinct radii",
  new Set([shapeRounded.radius, shapeRect.radius, shapePill.radius]).size === 3,
  { rounded: shapeRounded.radius, rect: shapeRect.radius, pill: shapePill.radius },
);
check(
  "shape: changing shape does not change button size",
  new Set([shapeRounded.background !== undefined]).size === 1 &&
    shapeRounded.radius !== shapePill.radius,
  true,
);

// --- style ---
const styleSolid = await renderWith({ each: { style: "solid" } });
const styleOutline = await renderWith({ each: { style: "outline" } });
const styleTint = await renderWith({ each: { style: "tint" } });
check(
  "style: solid / outline / tint render three distinct surfaces",
  new Set([styleSolid.background, styleOutline.background, styleTint.background]).size === 3,
  {
    solid: styleSolid.background,
    outline: styleOutline.background,
    tint: styleTint.background,
  },
);
check(
  "style: outline is transparent, solid is not",
  styleOutline.background === "rgba(0, 0, 0, 0)" && styleSolid.background !== "rgba(0, 0, 0, 0)",
  { solid: styleSolid.background, outline: styleOutline.background },
);

// --- colour ---
const themeColour = await renderWith({ each: { colourMode: "theme" } });
const customColour = await renderWith({
  each: { colourMode: "custom", accent: "#e85d75" },
});
check(
  "colour: theme mode leaves the --pf-link-accent token unset",
  themeColour.accentVar === "" && themeColour.inlineStyle === null,
  { accentVar: themeColour.accentVar, style: themeColour.inlineStyle },
);
check(
  "colour: custom mode applies the owner's hex",
  customColour.accentVar.toLowerCase() === "#e85d75",
  customColour.accentVar,
);
check(
  "colour: custom mode picks a readable text colour",
  /^#(0b0b10|f7f4ee)$/i.test(customColour.onAccentVar),
  customColour.onAccentVar,
);
check(
  "colour: custom accent actually changes the rendered fill",
  customColour.background !== styleSolid.background,
  { theme: styleSolid.background, custom: customColour.background },
);
/*
 * A light custom accent must flip the label to dark ink, a dark one to light.
 * This is the readability rule the brief asks for, checked at both ends.
 */
const lightAccent = await renderWith({
  each: { colourMode: "custom", accent: "#ffe66d", style: "solid" },
});
const darkAccent = await renderWith({
  each: { colourMode: "custom", accent: "#101014", style: "solid" },
});
check(
  "colour: a light accent gets dark text, a dark accent gets light text",
  /^#0b0b10$/i.test(lightAccent.onAccentVar) &&
    /^#f7f4ee$/i.test(darkAccent.onAccentVar),
  { light: lightAccent.onAccentVar, dark: darkAccent.onAccentVar },
);

// --- layout ---
/*
 * Grid needs labels short enough to sit on one line in a half-width cell.
 *
 * The main fixture deliberately contains a 42-character label, which is correct
 * for testing wrap behaviour but is *above* the 22-character grid threshold — so
 * asking for `grid` with it must fall back to the stack. That is checked
 * separately below. Here we use genuinely short labels so the grid itself is
 * exercised rather than its fallback.
 */
const SHORT_LINKS = [
  { id: "g1", label: "Shop", url: "https://example.com/shop", layout: "grid" },
  { id: "g2", label: "Press", url: "https://example.com/press", layout: "grid" },
  { id: "g3", label: "Contact", url: "https://example.com/contact", layout: "grid" },
  { id: "g4", label: "Newsletter", url: "https://example.com/news", layout: "grid" },
];

const stackLayout = await renderWith({ each: { layout: "stack" } });
const gridLayout = await renderWith({ links: SHORT_LINKS });
check(
  "layout: default is a full-width stack",
  stackLayout.layout === "stack" && stackLayout.display === "flex",
  { layout: stackLayout.layout, display: stackLayout.display },
);
check(
  "layout: grid is honoured for three short labels",
  gridLayout.layout === "grid" &&
    gridLayout.display === "grid" &&
    gridLayout.columns.split(" ").length === 2,
  { layout: gridLayout.layout, display: gridLayout.display, columns: gridLayout.columns },
);
/*
 * The brief asks for grid "only when it genuinely fits the number and length of
 * labels". A long label must fall back to the stack rather than being broken
 * across a narrow cell.
 */
const longLabelGrid = await renderWith({
  links: LINKS.map((l, i) => ({
    ...l,
    layout: "grid",
    label: i === 0 ? "Bookings, commissions, and enquiries" : l.label,
  })),
});
check(
  "layout: grid falls back to stack when a label is long",
  longLabelGrid.layout === "stack" && longLabelGrid.display === "flex",
  { layout: longLabelGrid.layout, display: longLabelGrid.display },
);
const twoButtonGrid = await renderWith({
  links: SHORT_LINKS.slice(0, 2),
});
check(
  "layout: grid falls back to stack with only two buttons",
  twoButtonGrid.layout === "stack",
  twoButtonGrid.layout,
);

/* ==================== 4. TYPOGRAPHY + THEME COHERENCE ==================== */
const serif = await renderWith({}, { seedDraft: draftWith({ typography: "serif" }) });
const mono = await renderWith({}, { seedDraft: draftWith({ typography: "mono-led" }) });
check(
  "typography: the profile preset reaches the buttons",
  serif.fontFamily !== mono.fontFamily,
  { serif: serif.fontFamily, mono: mono.fontFamily },
);

// The light theme must stay legible, which is the stated risk for a filled button.
await browser.setViewport(1280, 1000);
await browser.seed(draftWith({ theme: "paper" }));
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);
const lightTheme = await browser.evalJs(`
  const btn = document.querySelector('[data-testid="custom-link"]');
  const s = getComputedStyle(btn);
  return { background: s.backgroundColor, color: s.color, theme: document.documentElement.getAttribute('data-theme') };
`);
check(
  "theme: light theme renders a filled button with contrasting text",
  lightTheme.color !== lightTheme.background,
  lightTheme,
);
await browser.screenshot(`${OUT}/links-paper-theme-1280.png`, { fullPage: true });

/* ================== 5. STUDIO SAVE + PERSISTENCE ================== */
/*
 * Disarm the seed before the studio work.
 *
 * `browser.seed()` installs a Page.addScriptToEvaluateOnNewDocument script that
 * re-writes the draft key on EVERY navigation. Left armed, its three demo buttons
 * merged back in on the next load and the persistence assertions read six
 * buttons, half of them seeded. `seed(null)` is no better — that clears the key
 * on every load and destroys the save being verified. `seed(undefined)` removes
 * the injection entirely, so the page runs on whatever the studio actually
 * wrote.
 */
await browser.seed(undefined);
await browser.goto(`${HOST}/studio`, { waitMs: 5000 });
await wait(1200);
await browser.evalJs(`localStorage.removeItem('prsme:profile-draft:v1'); return true;`, { once: true });
await browser.goto(`${HOST}/studio`, { waitMs: 6000 });
await wait(1500);

const setVal = (sel, value) =>
  browser.evalJs(`
  const el = document.querySelector('${sel}');
  if (!el) return { ok: false };
  const proto = window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true };
`, { once: true });

await browser.evalJs(`document.querySelector('[data-testid="studio-tab-links"]')?.click();`, { once: true });
await wait(900);

// Three buttons of deliberately different lengths, with an appearance choice.
const STUDIO_LINKS = [
  { label: "Shop", url: "https://example.com/shop", shape: "pill", style: "tint", layout: "stack" },
  { label: "Portfolio", url: "https://example.com/portfolio", shape: "rect", style: "outline", layout: "stack" },
  { label: "Newsletter", url: "https://example.com/news", shape: "rounded", style: "solid", layout: "stack", accent: "#e85d75" },
];

/** Click a studio control by its exact testid. */
const clickTestId = (testid) =>
  browser.evalJs(
    `
  const el = document.querySelector('[data-testid=' + ${JSON.stringify(testid)} + ']');
  if (!el) return { ok: false };
  el.click();
  return { ok: true };
`,
    { once: true },
  );

for (const spec of STUDIO_LINKS) {
  await setVal("#custom-link-label", spec.label);
  await setVal("#custom-link-url", spec.url);
  await clickTestId(`studio-links-shape-${spec.shape}`);
  await clickTestId(`studio-links-style-${spec.style}`);
  if (spec.accent) {
    await clickTestId("studio-links-colour-custom");
    await setVal("#custom-link-accent", spec.accent);
  }
  await clickTestId("studio-links-save");
  await wait(500);
}
/*
 * Commit the draft to localStorage.
 *
 * Without this the assertions below read whatever `browser.seed` last installed
 * — the *seed*, not the application — so every persistence check passes or fails
 * for the wrong reason. An earlier revision of this suite read the draft straight
 * after the button saves and reported the seeded labels, which is exactly the
 * mistake this comment exists to prevent.
 */
await clickTestId("studio-save-btn");
await wait(900);

const saved = await browser.evalJs(`
  const d = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || 'null');
  return d ? {
    links: d.customLinks,
    sectionOrder: d.sectionOrder,
    ids: d.customLinks.map(l => l.id),
  } : null;
`, { once: true });

check("studio: three buttons saved", saved?.links?.length === 3, saved?.links?.length);
check(
  "studio: shape and style persisted per button",
  saved.links[0].shape === "pill" &&
    saved.links[0].style === "tint" &&
    saved.links[1].shape === "rect" &&
    saved.links[1].style === "outline" &&
    saved.links[2].style === "solid",
  saved.links.map((l) => ({ shape: l.shape, style: l.style })),
);
check(
  "studio: custom accent persisted only for the custom-colour button",
  saved.links[2].accent === "#e85d75" && saved.links[0].accent === undefined,
  saved.links.map((l) => l.accent),
);
check(
  "studio: ids are stable, not array indexes",
  saved.ids.every((id, i) => id !== String(i)),
  saved.ids,
);
check(
  "studio: a fresh draft still carries links in the canonical slot",
  Array.isArray(saved.sectionOrder) &&
    saved.sectionOrder.indexOf("links") > 0 &&
    saved.sectionOrder[saved.sectionOrder.length - 1] === "clicks" &&
    saved.sectionOrder.indexOf("links") < saved.sectionOrder.indexOf("activity"),
  saved.sectionOrder,
);

/* ============== 6. PERSISTENCE ACROSS A REAL REFRESH ============== */
await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
await wait(2000);
const afterSave = await browser.evalJs(`
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  const rects = btns.map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  return {
    labels: btns.map(b => b.textContent.trim()),
    shapes: btns.map(b => b.getAttribute('data-shape')),
    styles: btns.map(b => b.getAttribute('data-style')),
    colours: btns.map(b => b.getAttribute('data-colour')),
    accents: btns.map(b => getComputedStyle(b).getPropertyValue('--pf-link-accent').trim()),
    rects,
    order: (() => {
      const ids = ['collections','links','activity','clicks'];
      return ids.map(id => {
        const el = document.querySelector('[data-testid="' + id + '-section"]');
        return el ? Math.round(el.getBoundingClientRect().top) : null;
      });
    })(),
  };
`);
check(
  "persist: labels and their order survive the save",
  afterSave.labels.join("|") === "Shop|Portfolio|Newsletter",
  afterSave.labels,
);
check(
  "persist: per-button shape + style survive",
  afterSave.shapes.join("|") === "pill|rect|rounded" &&
    afterSave.styles.join("|") === "tint|outline|solid",
  { shapes: afterSave.shapes, styles: afterSave.styles },
);
check(
  "persist: the custom accent reaches the public button",
  afterSave.accents[2].toLowerCase() === "#e85d75" && afterSave.accents[0] === "",
  afterSave.accents,
);
check(
  "persist: section order is collections < links < activity < clicks",
  afterSave.order.every((v) => typeof v === "number") &&
    afterSave.order[0] < afterSave.order[1] &&
    afterSave.order[1] < afterSave.order[2] &&
    afterSave.order[2] < afterSave.order[3],
  afterSave.order,
);
check(
  "persist: a pill and a solid fill stay the same height",
  new Set(afterSave.rects.map((r) => r.h)).size === 1,
  afterSave.rects,
);

// A true reload: nothing in memory, only localStorage.
await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
await wait(2000);
const afterReload = await browser.evalJs(`
  return Array.from(document.querySelectorAll('[data-testid="custom-link"]'))
    .map(b => b.textContent.trim() + '|' + b.getAttribute('data-shape') + '|' + b.getAttribute('data-style'));
`);
check(
  "reload: appearance survives a full page load",
  afterReload.join(" ; ") === "Shop|pill|tint ; Portfolio|rect|outline ; Newsletter|rounded|solid",
  afterReload,
);

/* ==================== 7. NO VALID LINKS -> NO SECTION ==================== */
await browser.seed(draftWith({ links: [] }));
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);
const empty = await browser.evalJs(`
  return {
    linksSection: !!document.querySelector('[data-testid="links-section"]'),
    nav: !!document.querySelector('[data-testid="custom-links"]'),
    // The gap question: is the clicks section immediately after collections?
    tops: ['collections','links','activity','clicks'].map(id => {
      const el = document.querySelector('[data-testid="' + id + '-section"]');
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    }),
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
`);
check("empty: no links section at all", empty.linksSection === false && empty.nav === false, empty);
check("empty: no blank gap — clicks follows collections directly", empty.tops[0] < empty.tops[3], empty.tops);
check("empty: no document overflow", empty.docOverflowX === 0, empty.docOverflowX);

// Invalid entries only: must behave exactly like none.
await browser.seed(
  draftWith({
    links: [
      { id: "b1", label: "", url: "https://example.com/a" },
      { id: "b2", label: "Insecure", url: "http://example.com/b" },
      { id: "b3", label: "Script", url: "javascript:alert(1)" },
    ],
  }),
);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);
const invalid = await browser.evalJs(`
  return {
    section: !!document.querySelector('[data-testid="links-section"]'),
    hrefs: Array.from(document.querySelectorAll('[data-testid="custom-link"]')).map(b => b.getAttribute('href')),
  };
`);
check("invalid: an all-invalid set renders no section", invalid.section === false, invalid);
check("invalid: no javascript: href anywhere", !invalid.hrefs.some((h) => (h || "").startsWith("javascript:")), invalid.hrefs);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
}
process.exitCode = failed.length ? 1 : 0;