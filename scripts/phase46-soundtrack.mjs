// scripts/phase46-soundtrack.mjs — Soundtrack List hover-stability suite.
//
// The brief's central instruction is "do not assume the overflow is an image
// sizing issue; inspect computed dimensions before, during, and after hovering".
// This does exactly that, with a real CDP mouse move — a dispatched `mouseover`
// event does NOT engage `:hover`, which is what made the Phase 4.5-era probes
// report "geometry identical" regardless of the actual bug.
//
// For every row at 390px and 1280px it records, at rest and during hover:
//   - the row's and the thumbnail's bounding rect;
//   - computed width / height / padding / margin / transform;
//   - the position of every neighbouring row, to catch reflow;
//   - list scrollWidth vs clientWidth, i.e. real overflow;
//   - document-level horizontal overflow;
// then returns the pointer to rest and re-measures, so a transient effect that
// outlives the hover is also caught.
//
// Exits non-zero on any failure.

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

/*
 * Four music items chosen to cover every row state the brief cares about:
 *   0 — linked row, short title, has a rating;
 *   1 — linked row, very long title (wraps to two lines), wide artwork;
 *   2 — NOT linked and NO review: neither --link nor :has(a) applies;
 *   3 — not linked, but has a review, so :has(a) applies.
 * Rows 2 and 3 are the interesting ones: the old bleed rule keyed off
 * `--link, :has(a)`, so rows 0/1/3 were all wider than their container while
 * row 2 was not.
 */
const MUSIC_ITEMS = [
  { id: "mu-1", kind: "music", title: "Call Out My Name", byline: "The Weeknd", palette: "mono",
    coverUrl: T("2/2c/Catedral_de_Lisboa_2019.jpg/640px-Catedral_de_Lisboa_2019.jpg"),
    externalUrl: "https://music.apple.com/us/album/x/1", myRating: 9 },
  { id: "mu-2", kind: "music",
    title: "A Really Very Extremely Long Track Title That Wraps Onto Two Lines",
    byline: "Sora Verlaine", palette: "cyan",
    coverUrl: T("1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg"),
    externalUrl: "https://music.apple.com/us/album/x/2", myRating: 8 },
  { id: "mu-3", kind: "music", title: "Untitled Demo Track", byline: "EXID", palette: "rose", myRating: 7 },
  { id: "mu-4", kind: "music", title: "Reviewed, Not Linked", byline: "Mika Sørensen", palette: "forest",
    myRating: 6, myReview: "A quiet record that rewards a second pass." },
];

const draft = {
  version: 1,
  identity: {
    username: "noir", displayName: "Noir Aldridge",
    bio: "Filmmaker, occasional photographer, frequent over-reader.",
    location: "Lisbon", pronouns: "they/them", avatarPalette: "mono",
  },
  tags: ["Cinema", "Music"], socials: [], avatarDataUrl: null, soundtrack: null,
  collections: [{
    id: "col-music", name: "Albums on Repeat",
    description: "The records I return to when the rest of the world gets too loud.",
    layout: "soundtrack-list", visibility: "public",
    items: MUSIC_ITEMS,
  }],
  clicks: [], customLinks: [],
  appearance: { theme: "obsidian", typography: "serif", layout: "poster", background: "solid", accentOverride: null },
  visibility: "public",
  sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
  sectionVisibility: { soundtrack: false, collections: true, activity: false, clicks: false },
};

async function moveTo(x, y) {
  await browser.call("Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y, button: "none", buttons: 0, clickCount: 0,
  });
}

const MEASURE = `
  const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
  const list = document.querySelector('.pf-soundtrack-list');
  const r2 = (el) => {
    const b = el.getBoundingClientRect();
    return { w: +b.width.toFixed(2), h: +b.height.toFixed(2), x: +b.left.toFixed(2), y: +b.top.toFixed(2) };
  };
  const lb = list ? list.getBoundingClientRect() : null;
  return {
    listOverflowsBy: list ? list.scrollWidth - list.clientWidth : null,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: rows.map(row => {
      const cs = getComputedStyle(row);
      const thumb = row.querySelector('.pf-soundtrack-thumb');
      const img = thumb ? thumb.querySelector('img') : null;
      const meta = row.querySelector('.pf-soundtrack-meta');
      const rating = row.querySelector('.pf-soundtrack-rating');
      const lb2 = lb;
      return {
        rect: r2(row),
        margin: cs.marginLeft + '/' + cs.marginRight,
        padding: cs.paddingTop + '/' + cs.paddingRight + '/' + cs.paddingBottom + '/' + cs.paddingLeft,
        transform: cs.transform,
        overflowsList: lb2 ? +(row.getBoundingClientRect().right - lb2.right).toFixed(2) : null,
        outsideListLeft: lb2 ? +(lb2.left - row.getBoundingClientRect().left).toFixed(2) : null,
        thumb: thumb ? { ...r2(thumb), transform: getComputedStyle(thumb).transform,
                         overflow: getComputedStyle(thumb).overflow } : null,
        img: img ? { ...r2(img), transform: getComputedStyle(img).transform } : null,
        meta: meta ? r2(meta) : null,
        rating: rating ? r2(rating) : null,
      };
    }),
  };
`;

for (const vw of [390, 1280]) {
  await browser.setViewport(vw, 1600);
  await browser.seed(draft);
  await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
  await wait(2500);

  await browser.evalJs(`
    const list = document.querySelector('.pf-soundtrack-list');
    list.scrollIntoView({ block: 'center' });
    return true;
  `);
  await wait(600);
  await moveTo(2, 2);
  await wait(600);

  const rest = await browser.evalJs(MEASURE);
  const rowCount = rest.rows.length;

  check(`@${vw}px: ${rowCount} music rows render`, rowCount === 4, rowCount);

  // --- the headline finding, stated as a check ---
  check(
    `@${vw}px: list does not overflow at REST`,
    rest.listOverflowsBy === 0,
    { listOverflowsBy: rest.listOverflowsBy, docOverflowX: rest.docOverflowX },
  );
  check(
    `@${vw}px: no row escapes its list at REST`,
    rest.rows.every((r) => r.overflowsList <= 0.5 && r.outsideListLeft <= 0.5),
    rest.rows.map((r) => ({ over: r.overflowsList, left: r.outsideListLeft })),
  );
  check(
    `@${vw}px: no document-level horizontal scroll`,
    rest.docOverflowX === 0,
    rest.docOverflowX,
  );

  const restRects = rest.rows.map((r) => r.rect);

  // Hover each row's artwork, in turn.
  for (let i = 0; i < rowCount; i++) {
    const pt = await browser.evalJs(`
      const row = document.querySelectorAll('[data-testid="soundtrack-row"]')[${i}];
      const t = row.querySelector('.pf-soundtrack-thumb');
      const b = t ? t.getBoundingClientRect() : row.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    `);
    await moveTo(pt.x, pt.y);
    await wait(650);

    const hover = await browser.evalJs(MEASURE);
    const engaged = await browser.evalJs(`
      const row = document.querySelectorAll('[data-testid="soundtrack-row"]')[${i}];
      return { rowHover: row.matches(':hover'), tag: row.tagName };
    `);

    check(`@${vw}px row ${i}: hover actually engaged (${engaged.tag})`, engaged.rowHover === true, engaged);

    const same = JSON.stringify(hover.rows.map((r) => r.rect)) === JSON.stringify(restRects);
    check(
      `@${vw}px row ${i}: every row rect identical before vs during hover`,
      same,
      same ? undefined : { rest: restRects[i], hover: hover.rows[i].rect },
    );

    check(
      `@${vw}px row ${i}: thumbnail box identical before vs during hover`,
      JSON.stringify(hover.rows[i].thumb?.w !== undefined
        ? [hover.rows[i].thumb.w, hover.rows[i].thumb.h]
        : null) ===
        JSON.stringify([rest.rows[i].thumb?.w, rest.rows[i].thumb?.h]),
      { rest: rest.rows[i].thumb, hover: hover.rows[i].thumb },
    );

    check(
      `@${vw}px row ${i}: no layout property changed on hover`,
      hover.rows[i].margin === rest.rows[i].margin &&
        hover.rows[i].padding === rest.rows[i].padding &&
        hover.rows[i].transform === rest.rows[i].transform,
      {
        margin: [rest.rows[i].margin, hover.rows[i].margin],
        padding: [rest.rows[i].padding, hover.rows[i].padding],
        transform: [rest.rows[i].transform, hover.rows[i].transform],
      },
    );

    check(
      `@${vw}px row ${i}: no overflow during hover`,
      hover.listOverflowsBy === 0 &&
        hover.rows.every((r) => r.overflowsList <= 0.5 && r.outsideListLeft <= 0.5) &&
        hover.docOverflowX === 0,
      { list: hover.listOverflowsBy, doc: hover.docOverflowX },
    );

    check(
      `@${vw}px row ${i}: artwork stays square`,
      !hover.rows[i].thumb || hover.rows[i].thumb.w === hover.rows[i].thumb.h,
      hover.rows[i].thumb ? { w: hover.rows[i].thumb.w, h: hover.rows[i].thumb.h } : null,
    );

    // The thumbnail CONTAINER must be unchanged even if the inner image scaled.
    if (hover.rows[i].img && hover.rows[i].img.transform !== "none") {
      check(
        `@${vw}px row ${i}: contained artwork scale stays inside the frame`,
        hover.rows[i].thumb.overflow === "hidden" &&
          hover.rows[i].thumb.w === rest.rows[i].thumb.w &&
          hover.rows[i].thumb.h === rest.rows[i].thumb.h,
        { overflow: hover.rows[i].thumb.overflow, imgTransform: hover.rows[i].img.transform },
      );
    }

    check(
      `@${vw}px row ${i}: rating does not collide with the title`,
      !hover.rows[i].rating || !hover.rows[i].meta ||
        hover.rows[i].meta.x + hover.rows[i].meta.w <= hover.rows[i].rating.x + 0.5,
      hover.rows[i].rating ? { metaRight: hover.rows[i].meta.x + hover.rows[i].meta.w, ratingLeft: hover.rows[i].rating.x } : "no rating",
    );
  }

  // Screenshots: at rest, then during a hover.
  await moveTo(2, 2);
  await wait(700);
  const listBox = await browser.evalJs(`
    const list = document.querySelector('.pf-soundtrack-list');
    list.scrollIntoView({ block: 'center' });
    return true;
  `);
  void listBox;
  await wait(400);
  await browser.screenshot(`${OUT}/soundtrack-before-hover-${vw}.png`, { fullPage: false });

  const hoverPt = await browser.evalJs(`
    const t = document.querySelectorAll('[data-testid="soundtrack-row"] .pf-soundtrack-thumb')[0];
    const b = t.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  `);
  await moveTo(hoverPt.x, hoverPt.y);
  await wait(700);
  await browser.screenshot(`${OUT}/soundtrack-during-hover-${vw}.png`, { fullPage: false });

  // --- and back to rest ---
  await moveTo(2, 2);
  await wait(700);
  const after = await browser.evalJs(MEASURE);
  check(
    `@${vw}px: geometry returns to rest after the pointer leaves`,
    JSON.stringify(after.rows.map((r) => r.rect)) === JSON.stringify(restRects),
    undefined,
  );
}

/* ================= KEYBOARD FOCUS + EXTERNAL NAVIGATION ================= */
await browser.setViewport(1280, 1200);
await browser.seed(draft);
await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
await wait(2500);
await browser.evalJs(`
  document.querySelector('.pf-soundtrack-list').scrollIntoView({ block: 'center' });
  return true;
`);
await wait(500);

const restBeforeFocus = await browser.evalJs(MEASURE);
await browser.evalJs(`
  const row = document.querySelector('[data-testid="soundtrack-row"]');
  row.focus();
  return true;
`, { once: true });
await wait(500);
const afterFocus = await browser.evalJs(MEASURE);
check(
  "keyboard: focusing a row does not change its geometry",
  JSON.stringify(afterFocus.rows.map((r) => r.rect)) === JSON.stringify(restBeforeFocus.rows.map((r) => r.rect)),
  { rest: restBeforeFocus.rows[0].rect, focus: afterFocus.rows[0].rect },
);
check(
  "keyboard: focus does not introduce overflow",
  afterFocus.listOverflowsBy === 0 && afterFocus.docOverflowX === 0,
  { list: afterFocus.listOverflowsBy, doc: afterFocus.docOverflowX },
);
await browser.screenshot(`${OUT}/soundtrack-keyboard-focus-1280.png`, { fullPage: false });

const nav = await browser.evalJs(`
  const rows = Array.from(document.querySelectorAll('[data-testid="soundtrack-row"]'));
  return rows.map(r => ({
    tag: r.tagName,
    href: r.tagName === 'A' ? r.getAttribute('href') : null,
    target: r.tagName === 'A' ? r.getAttribute('target') : null,
    rel: r.tagName === 'A' ? r.getAttribute('rel') : null,
    nestedAnchors: r.querySelectorAll('a').length,
  }));
`);
check(
  "navigation: a linked row is one coherent <a> with rel=noopener noreferrer",
  nav[0].tag === "A" &&
    (nav[0].href || "").startsWith("https://") &&
    nav[0].target === "_blank" &&
    nav[0].rel === "noopener noreferrer" &&
    nav[0].nestedAnchors === 0,
  nav[0],
);
check(
  "navigation: no separate square external-link button is reintroduced",
  nav.every((n) => n.tag === "A" || n.tag === "DIV"),
  nav.map((n) => n.tag),
);
check(
  "navigation: a row with no external URL is not a link",
  nav[2].tag !== "A" || !nav[2].href,
  nav[2],
);
check(
  "navigation: the reviewed-but-unlinked row keeps its review link",
  nav[3].nestedAnchors >= 1,
  nav[3],
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
}
process.exitCode = failed.length ? 1 : 0;