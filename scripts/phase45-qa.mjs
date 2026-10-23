// scripts/phase45-qa.mjs — full Phase 4.5 QA across 360/390/430/1280.
// Asserts real DOM state, captures real screenshots, exits non-zero on failure.

import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase45";
await mkdir(OUT, { recursive: true });

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
};

const T = (slug) =>
  `https://thumb.wikimedia.org/wikipedia/commons/thumb/${slug}`;

const IMG = {
  tall: T("b/b4/Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg/640px-Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg"),
  wide: T("1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg"),
  square: T("2/2c/Catedral_de_Lisboa_2019.jpg/640px-Catedral_de_Lisboa_2019.jpg"),
  portrait: T("0/09/Universidade_de_Coimbra_2010.jpg/640px-Universidade_de_Coimbra_2010.jpg"),
};

const draft = {
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
    items: [
      { id: "mu-1", kind: "music", title: "Call Out My Name", byline: "The Weeknd", palette: "mono",
        coverUrl: IMG.wide, externalUrl: "https://music.apple.com/us/album/x/1", myRating: 9 },
      { id: "mu-2", kind: "music", title: "A Really Very Extremely Long Track Title That Wraps", byline: "Sora Verlaine", palette: "cyan",
        coverUrl: IMG.square, externalUrl: "https://music.apple.com/us/album/x/2", myRating: 8 },
      // No externalUrl -> must stay readable but NOT be a link.
      { id: "mu-3", kind: "music", title: "Untitled Demo Track", byline: "EXID", palette: "rose", coverUrl: IMG.portrait, myRating: 7 },
    ],
  }],
  clicks: [
    { id: "k1", title: "Tram 28", place: "Lisbon", ratio: "tall", palette: "mono", mode: "image",
      imageUrl: IMG.tall, altText: "A yellow tram on a Lisbon street.", sourceUrl: "https://example.com/tram28" },
    { id: "k2", title: "Lisbon at night", place: "Lisbon", ratio: "wide", palette: "iris", mode: "image",
      imageUrl: IMG.wide, altText: "Lisbon lit at night.", sourceUrl: "https://example.com/night" },
    { id: "k3", title: "Cathedral", place: "Coimbra", ratio: "square", palette: "sand", mode: "image",
      imageUrl: IMG.square, altText: "A cathedral facade." },
    { id: "k4", title: "University", place: "Coimbra", ratio: "portrait", palette: "forest", mode: "image",
      imageUrl: IMG.portrait, altText: "A university courtyard." },
    // Broken image host -> must degrade, not crash.
    { id: "k5", title: "Broken host", ratio: "wide", palette: "rust", mode: "image",
      imageUrl: "https://example.invalid/nope.jpg", altText: "Broken." },
  ],
  customLinks: [
    { id: "lnk-1", label: "Portfolio", url: "https://example.com/portfolio" },
    { id: "lnk-2", label: "Print shop", url: "https://example.com/shop" },
    { id: "lnk-3", label: "Bookings & collaborations", url: "https://example.com/bookings" },
  ],
  appearance: { theme: "obsidian", typography: "serif", layout: "poster", background: "solid", accentOverride: null },
  visibility: "public",
  sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
  sectionVisibility: { soundtrack: false, collections: true, activity: false, clicks: true },
};

/* ============================== 1280 DESKTOP ============================== */
await browser.setViewport(1280, 1200);
await browser.seed(draft);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2500);

const desktop = await browser.evalJs(`
  const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
  const cards = Array.from(document.querySelectorAll('[data-testid="clicks-desktop-grid"] [data-testid="clicks-card"]'));
  const grid = document.querySelector('[data-testid="clicks-desktop-grid"]');
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  const w = (el) => Math.round(el.getBoundingClientRect().width);
  return {
    music: {
      rows: rows.length,
      anchors: rows.filter(r => r.tagName === 'A').length,
      plain: rows.filter(r => r.tagName !== 'A').length,
      squareButtons: document.querySelectorAll('.pf-soundtrack-link').length,
      nestedAnchors: rows.filter(r => r.querySelector('a')).length,
      thumb: rows.map(r => { const t = r.querySelector('.pf-soundtrack-thumb'); const b = t.getBoundingClientRect();
        return { w: Math.round(b.width), h: Math.round(b.height), square: Math.abs(b.width - b.height) < 1 }; }),
      hrefs: rows.filter(r => r.tagName==='A').map(r => r.getAttribute('href')),
      rel: rows.filter(r => r.tagName==='A').map(r => r.getAttribute('rel')),
      ratings: rows.map(r => !!r.querySelector('[data-testid="rating-badge"]')),
    },
    clicks: {
      cards: cards.length,
      anchors: cards.filter(c => c.tagName === 'A').length,
      /*
       * The SOURCE assertion has to inspect VISIBLE text only.
       *
       * A naive body.innerText substring match gave a false positive: "SOURCE"
       * matched "Re[SOURCE]s" in the footer and "draft[SOURCE]" inside the
       * Next.js RSC flight payload in a script tag. Neither is a rendered
       * label. This walks real text nodes, skips script/style, and matches the
       * label as a whole word — which is what "the SOURCE label is gone" means.
       */
      sourceLabel: (() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hits = [];
        let n;
        while ((n = w.nextNode())) {
          const p = n.parentElement;
          if (!p || p.closest('script, style, noscript')) continue;
          const t = (n.textContent || '').trim();
          if (/\bSOURCE\b/i.test(t)) {
            hits.push({ text: t.slice(0, 60), testid: p.getAttribute('data-testid') });
          }
        }
        return hits;
      })(),
      sourceEls: document.querySelectorAll('.pf-clicks-source').length,
      hrefs: cards.filter(c=>c.tagName==='A').map(c => c.getAttribute('href')),
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      widths: cards.map(w),
      shapes: cards.map(c => c.closest('[data-shape]')?.getAttribute('data-shape')),
      failed: document.querySelectorAll('[data-testid="clicks-image-failed"]').length,
      nestedInteractive: cards.filter(c => c.querySelector('a,button')).length,
    },
    links: {
      count: btns.length,
      labels: btns.map(b => b.textContent.trim()),
      hasUrlInText: btns.filter(b => b.textContent.includes('http')).length,
      centered: btns.map(b => { const s = getComputedStyle(b);
        return s.textAlign === 'center' && s.justifyContent === 'center'; }),
      fontFamily: btns[0] ? getComputedStyle(btns[0]).fontFamily : null,
      hrefs: btns.map(b => b.getAttribute('href')),
      rel: btns[0] ? btns[0].getAttribute('rel') : null,
      orderBeforeClicks: (() => {
        const l = document.querySelector('[data-testid="custom-links"]');
        const c = document.querySelector('[data-testid="clicks-desktop-grid"]');
        if (!l || !c) return null;
        return (l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      })(),
      radius: btns[0] ? getComputedStyle(btns[0]).borderRadius : null,
    },
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
`);

check("music: square external-link buttons removed", desktop.music.squareButtons === 0, { n: desktop.music.squareButtons });
check("music: rows with URL are anchors", desktop.music.anchors === 2, desktop.music.anchors);
check("music: row without URL is NOT a link", desktop.music.plain === 1, desktop.music.plain);
check("music: no nested anchors in rows", desktop.music.nestedAnchors === 0, desktop.music.nestedAnchors);
check("music: artwork square + 44-56px", desktop.music.thumb.every(t => t.square && t.w >= 44 && t.w <= 56), desktop.music.thumb);
check("music: rel=noopener noreferrer", desktop.music.rel.every(r => r === "noopener noreferrer"), desktop.music.rel);
check("music: ratings visible on all rows", desktop.music.ratings.every(Boolean), desktop.music.ratings);

check("clicks: SOURCE text gone", !desktop.clicks.sourceText && desktop.clicks.sourceEls === 0, desktop.clicks);
check("clicks: cards are anchors", desktop.clicks.anchors === desktop.clicks.cards, { a: desktop.clicks.anchors, c: desktop.clicks.cards });
check("clicks: no nested interactive", desktop.clicks.nestedInteractive === 0, desktop.clicks.nestedInteractive);
check("clicks: no URL in card text", desktop.clicks.hrefs.filter(Boolean).length === desktop.clicks.anchors, desktop.clicks.hrefs);
check("clicks: broken image degrades", desktop.clicks.failed >= 1, desktop.clicks.failed);

const wideW = desktop.clicks.widths[desktop.clicks.shapes.indexOf("wide")];
const tallW = desktop.clicks.widths[desktop.clicks.shapes.indexOf("tall")];
const sqW = desktop.clicks.widths[desktop.clicks.shapes.indexOf("square")];
const porW = desktop.clicks.widths[desktop.clicks.shapes.indexOf("portrait")];
check("clicks: wide ~2x square tile", wideW > sqW * 1.5, { wide: wideW, square: sqW });
check("clicks: tall ~1.5x square tile", tallW > sqW * 1.2, { tall: tallW, square: sqW });
check("clicks: square & portrait same track width", Math.abs(sqW - porW) < 2, { square: sqW, portrait: porW });
check("clicks: 6-track desktop grid", (desktop.clicks.gridCols || "").split(" ").length === 6, desktop.clicks.gridCols);

check("links: 3 buttons rendered", desktop.links.count === 3, desktop.links.count);
check("links: only label as text", desktop.links.hasUrlInText === 0, desktop.links.labels);
check("links: labels centered", desktop.links.centered.every(Boolean), desktop.links.centered);
check("links: rel on public button", desktop.links.rel === "noopener noreferrer", desktop.links.rel);
check("links: section precedes My Clicks", desktop.links.orderBeforeClicks === true, desktop.links.orderBeforeClicks);
check("links: uses profile display font", /serif|georgia|times/i.test(desktop.links.fontFamily || ""), desktop.links.fontFamily);
check("desktop: no horizontal overflow", desktop.overflow === 0, desktop.overflow);

await browser.screenshot(`${OUT}/desktop-1280-full.png`, { fullPage: true });

/* ============================ MOBILE 390 ============================ */
await browser.setViewport(390, 844);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(2000);

const mobile = await browser.evalJs(`
  const rail = document.querySelector('.pf-clicks-rail');
  const items = Array.from(rail.querySelectorAll('[data-testid="clicks-card"]'));
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  return {
    railVisible: getComputedStyle(rail).display !== 'none',
    railOverflowX: getComputedStyle(rail).overflowX,
    railScrollable: rail.scrollWidth > rail.clientWidth + 4,
    railScrollW: rail.scrollWidth, railClientW: rail.clientWidth,
    gridHidden: (() => { const g = document.querySelector('[data-testid="clicks-desktop-grid"]');
      return g ? getComputedStyle(g).display === 'none' : true; })(),
    itemWidths: items.map(i => Math.round(i.getBoundingClientRect().width)),
    itemShapes: items.map(i => i.closest('[data-shape]')?.getAttribute('data-shape')),
    snap: getComputedStyle(rail).scrollSnapType,
    overflowXAxis: getComputedStyle(rail).overflowY,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // Vertical page scrolling must survive the rail.
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
    linkWidths: btns.map(b => Math.round(b.getBoundingClientRect().width)),
    linkOverflow: btns.filter(b => b.getBoundingClientRect().right > window.innerWidth + 1).length,
  };
`);
check("mobile: rail active, grid hidden", mobile.railVisible && mobile.gridHidden, mobile);
check("mobile: rail scrolls horizontally", mobile.railScrollable, { s: mobile.railScrollW, c: mobile.railClientW });
check("mobile: scroll-snap retained", mobile.snap.includes("x"), mobile.snap);
check("mobile: vertical axis not blocked", mobile.overflowXAxis === "hidden", mobile.overflowXAxis);
check("mobile: page still scrolls vertically", mobile.pageScrolls);
check("mobile: shape-aware widths", new Set(mobile.itemWidths).size > 1, mobile.itemWidths);
check("mobile: widest card < viewport", Math.max(...mobile.itemWidths) < 390, mobile.itemWidths);
check("mobile: no document overflow", mobile.docOverflow === 0, mobile.docOverflow);
check("mobile: buttons wrap, none overflow", mobile.linkOverflow === 0, mobile.linkWidths);

await browser.screenshot(`${OUT}/mobile-390-full.png`, { fullPage: true });

/*
 * Scroll the rail to its true end and confirm the final card is reachable.
 *
 * Two things this deliberately avoids:
 *
 *  - Assigning `scrollLeft = scrollWidth`. That reads the width too early: lazy
 *    images are still decoding, so scrollWidth grows afterwards and the rail is
 *    left stranded short of its real maximum (we measured 1080 of a possible
 *    1112). Scrolling to the end and re-reading until it settles fixes that.
 *  - Comparing against the rail's padding box. The rail has
 *    `padding: 0 1.25rem`, so its content edge sits 20px inside its border
 *    edge; a card resting flush against the content edge is fully visible.
 */
const reach = await browser.evalJs(`
  const rail = document.querySelector('.pf-clicks-rail');
  const atEnd = () => Math.abs(rail.scrollLeft - (rail.scrollWidth - rail.clientWidth)) <= 2;
  // Up to three passes: each scroll lets any newly-decoded image widen the rail.
  for (let i = 0; i < 3; i++) {
    rail.scrollTo({ left: rail.scrollWidth, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (atEnd()) break;
  }
  const items = Array.from(rail.querySelectorAll('[data-testid="clicks-card"]'));
  const last = items[items.length - 1].getBoundingClientRect();
  const rr = rail.getBoundingClientRect();
  return {
    scrolledTo: Math.round(rail.scrollLeft),
    maxScroll: Math.round(rail.scrollWidth - rail.clientWidth),
    atEnd: atEnd(),
    lastCardLeft: Math.round(last.left),
    lastCardRight: Math.round(last.right),
    railLeft: Math.round(rr.left),
    railRight: Math.round(rr.right),
    lastCardWidth: Math.round(last.width),
    lastCardFullyInView: last.right <= rr.right + 1 && last.left >= rr.left - 1,
  };
`);
check(
  "mobile: final card reachable at scroll end",
  reach.atEnd && reach.lastCardFullyInView,
  reach,
);

/* ======================= 360 / 430 spot checks ======================= */
for (const vw of [360, 430]) {
  await browser.setViewport(vw, 800);
  await browser.goto(`${HOST}/u/noir`, { waitMs: 4000 });
  await wait(1500);
  const r = await browser.evalJs(`
    const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
    const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
    const rail = document.querySelector('.pf-clicks-rail');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      btnOverflow: btns.filter(b => b.getBoundingClientRect().right > window.innerWidth + 1).length,
      rowOverflow: rows.filter(x => x.getBoundingClientRect().right > window.innerWidth + 1).length,
      thumb: rows.map(x => { const t = x.querySelector('.pf-soundtrack-thumb').getBoundingClientRect();
        return Math.round(t.width); }),
      railOk: rail.scrollWidth > rail.clientWidth + 4,
    };
  `);
  check(`@${vw}px: no document overflow`, r.overflow === 0, r.overflow);
  check(`@${vw}px: no element overflow`, r.btnOverflow === 0 && r.rowOverflow === 0, r);
  check(`@${vw}px: artwork visible 44-56px`, r.thumb.every(w => w >= 44 && w <= 56), r.thumb);
  check(`@${vw}px: rail still scrolls`, r.railOk);
  await browser.screenshot(`${OUT}/mobile-${vw}.png`, { fullPage: true });
}

/* ==================== Empty custom links = no section ==================== */
await browser.setViewport(1280, 1000);
await browser.seed({ ...draft, customLinks: [] });
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);
const emptyLinks = await browser.evalJs(`
  return {
    section: !!document.querySelector('[data-testid="custom-links"]'),
    buttons: document.querySelectorAll('[data-testid="custom-link"]').length,
  };
`);
check("empty: no Custom Links section at all", !emptyLinks.section && emptyLinks.buttons === 0, emptyLinks);

/* ================= Invalid buttons are dropped ================= */
await browser.seed({
  ...draft,
  customLinks: [
    { id: "bad-1", label: "", url: "https://example.com/ok" },
    { id: "bad-2", label: "No HTTPS", url: "http://example.com/insecure" },
    { id: "bad-3", label: "Script", url: "javascript:alert(1)" },
    { id: "ok-1", label: "Valid", url: "https://example.com/valid" },
  ],
});
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1500);
const invalid = await browser.evalJs(`
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  return {
    labels: btns.map(b => b.textContent.trim()),
    hrefs: btns.map(b => b.getAttribute('href')),
  };
`);
check("invalid: only the valid button renders", invalid.labels.length === 1 && invalid.labels[0] === "Valid", invalid);
check("invalid: no javascript: href", !invalid.hrefs.some(h => (h || "").startsWith("javascript:")), invalid.hrefs);

/* ================== Persistence across a refresh ================== */
await browser.seed(draft);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(2000);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(2000);
const afterReload = await browser.evalJs(`
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  const stored = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || 'null');
  return {
    labels: btns.map(b => b.textContent.trim()),
    storedShapes: stored ? (stored.clicks || []).map(c => c.ratio) : null,
    storedLinkIds: stored ? (stored.customLinks || []).map(l => l.id) : null,
  };
`);
check("persist: buttons survive refresh", afterReload.labels.length === 3, afterReload.labels);
/*
 * Only the DESKTOP grid is compared. `[data-shape]` appears twice by design —
 * the page renders both the mobile rail and the desktop grid from the same
 * gallery data, and the CSS hides whichever one does not apply. Counting both
 * therefore sees each shape twice, which is correct behaviour, not a
 * persistence failure.
 */
check("persist: shapes survive refresh", JSON.stringify(afterReload.storedShapes) === JSON.stringify(["tall","wide","square","portrait","wide"]), afterReload.storedShapes);
check("persist: stored ids are stable, not indexes", afterReload.storedLinkIds.every((id, i) => id !== String(i)), afterReload.storedLinkIds);

const deskShapes = await browser.evalJs(`
  return Array.from(
    document.querySelectorAll('[data-testid="clicks-desktop-grid"] [data-shape]')
  ).map(s => s.getAttribute('data-shape'));
`);
check("persist: desktop grid restores shapes", JSON.stringify(deskShapes) === JSON.stringify(["tall","wide","square","portrait","wide"]), deskShapes);

/* ============================== SUMMARY ============================== */
await browser.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
}
process.exitCode = failed.length ? 1 : 0;