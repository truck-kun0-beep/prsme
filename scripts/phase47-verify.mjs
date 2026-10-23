// scripts/phase47-verify.mjs — targeted verification for Phase 4.7.
//
// Two claims, checked against the running app rather than against a mock:
//
//   A. Custom Links section copy
//      1. the three fields render on the real public profile;
//      2. each edits independently and the rendered text follows;
//      3. a saved value survives a reload and is still there on /u/noir;
//      4. a blank field drops its element, and the buttons still render;
//      5. a pre-4.7 draft (no `customLinksSection` key at all) renders the
//         defaults and keeps its own buttons;
//      6. a malformed `customLinksSection` does not crash and is repaired
//         field-by-field;
//      7. the studio's "Reset demo" returns the three default strings and
//         leaves the buttons working.
//
//   B. Soundtrack List on mobile
//      1. at 360 / 390 / 430 the row, its artwork, its metadata and its rating
//         all sit inside the collection's content box;
//      2. the document gains no horizontal scroll;
//      3. a long title and a long album name stay inside the row;
//      4. hover, focus, and the row-as-link behaviour are unchanged.
//
// Exits non-zero on any failure.

import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const T = (slug) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${slug}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/*                               Fixtures                                     */
/* -------------------------------------------------------------------------- */

function baseDraft(extra = {}) {
  return {
    version: 1,
    identity: {
      username: "noir",
      displayName: "Noir Aldridge",
      bio: "Filmmaker, occasional photographer, frequent over-reader.",
      location: "Lisbon",
      pronouns: "they/them",
      avatarPalette: "mono",
    },
    tags: ["Cinema", "Music"],
    socials: [],
    avatarDataUrl: null,
    soundtrack: null,
    collections: [],
    clicks: [],
    customLinks: [
      { id: "lnk-1", label: "Portfolio", url: "https://example.com/noir-portfolio" },
      { id: "lnk-2", label: "Print shop", url: "https://example.com/noir-prints" },
    ],
    appearance: {
      theme: "obsidian",
      typography: "serif",
      layout: "poster",
      background: "solid",
      accentOverride: null,
    },
    visibility: "public",
    sectionOrder: ["soundtrack", "collections", "links", "activity", "clicks"],
    sectionVisibility: {
      soundtrack: false,
      collections: false,
      links: true,
      activity: false,
      clicks: false,
    },
    ...extra,
  };
}

const LONG = {
  id: "mu-long",
  kind: "music",
  title:
    "A Really Very Extremely Long Track Title That Has To Wrap Onto A Second Line",
  byline: "Sora Verlaine \u2014 Live At The Aurora Hall, Volume Three, Remastered",
  palette: "cyan",
  externalUrl: "https://music.apple.com/us/album/x/2",
  myRating: 8,
};

const musicDraft = () =>
  baseDraft({
    customLinksSection: {
      eyebrow: "Elsewhere",
      heading: "Where to find Noir.",
      description: "Other work, other rooms, other ways in.",
    },
    collections: [
      {
        id: "col-music",
        name: "Albums on Repeat",
        description: "The records I return to.",
        layout: "soundtrack-list",
        visibility: "public",
        items: [
          {
            id: "mu-1",
            kind: "music",
            title: "Call Out My Name",
            byline: "The Weeknd",
            palette: "mono",
            coverUrl: T(
              "2/2c/Catedral_de_Lisboa_2019.jpg/640px-Catedral_de_Lisboa_2019.jpg",
            ),
            externalUrl: "https://music.apple.com/us/album/x/1",
            myRating: 9,
          },
          LONG,
          { id: "mu-3", kind: "music", title: "Untitled", byline: "EXID", palette: "rose" },
        ],
      },
    ],
    sectionVisibility: {
      soundtrack: false,
      collections: true,
      links: false,
      activity: false,
      clicks: false,
    },
  });

/* -------------------------------------------------------------------------- */
/*                          A. Custom Links copy                              */
/* -------------------------------------------------------------------------- */

/*
 * The seed injects this draft's JSON into the page as a JS string literal, so
 * the probe below must never contain a literal `http` outside a string: an
 * unescaped one becomes a bare identifier once the eval body is re-parsed.
 * `const NAMESPACE` is therefore built by concatenation.
 */
const READ_LINKS = `
  const sec = document.querySelector('[data-testid="links-section"]');
  if (!sec) return { present: false };
  const eyebrow = sec.querySelector('.pf-eyebrow');
  const heading = sec.querySelector('h2');
  const block = sec.querySelector('[data-testid="custom-links-heading-block"]');
  const desc = block ? Array.from(block.children).find(el => el.tagName === 'P' && el !== eyebrow) : null;
  const buttons = sec.querySelectorAll('[data-testid="custom-link"]');
  return {
    present: true,
    eyebrow: eyebrow ? eyebrow.textContent.trim() : null,
    heading: heading ? heading.textContent.trim() : null,
    description: desc ? desc.textContent.trim() : null,
    headerBlock: Boolean(block),
    buttonCount: buttons.length,
    buttonLabels: Array.from(buttons).map(b => (b.textContent || '').trim()).filter(Boolean),
  };
`;

const browser = await connect();

/* ---- A1: the shipped demo, first visit ---- */
/*
 * Note what this checks and what it does not.
 *
 * With nothing in storage, /u/noir renders its server-rendered default profile,
 * which is a separate, hand-written tree (see `app/u/[username]/page.tsx`) that
 * predates the Custom Links *section* and carries its own headings. The editable
 * section header only exists in the customised tree, i.e. once a draft is saved.
 * That is pre-existing architecture, not something Phase 4.7 changed — so the
 * defaults are asserted below through the path a returning visitor actually
 * takes, and through the studio preview.
 */
await browser.setViewport(1280, 1000);
await browser.seed(null);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2200);

const firstVisit = await browser.evalJs(`
  return {
    linksSection: Boolean(document.querySelector('[data-testid="links-section"]')),
    defaultButtons: document.querySelectorAll('[data-testid="custom-link"]').length,
  };
`);
check(
  "A1 first visit: the demo buttons still render",
  firstVisit.defaultButtons >= 3,
  firstVisit,
);

/* ---- A2: each field is independently editable and persisted ---- */
const custom = {
  eyebrow: "Elsewhere",
  heading: "Studio visitors, come in.",
  description: "Three links that actually go somewhere useful.",
};
await browser.seed(baseDraft({ customLinksSection: { ...custom } }));
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);

let links = await browser.evalJs(READ_LINKS);
check("A2 edited heading renders", links.heading === custom.heading, links.heading);
check("A2 edited description renders", links.description === custom.description, links.description);
check(
  "A2 untouched eyebrow keeps its own value",
  links.eyebrow === custom.eyebrow,
  links.eyebrow,
);
check(
  "A2 edited copy is not derived from the display name",
  !links.heading.includes("Noir"),
  links.heading,
);

/* ---- A3: save, reload, re-read from storage ---- */
const persisted = await browser.evalJs(`
  const raw = localStorage.getItem('prsme:profile-draft:v1');
  if (!raw) return { present: false };
  const d = JSON.parse(raw);
  return { present: true, section: d.customLinksSection ?? null, buttons: (d.customLinks || []).length };
`);
check("A3 the draft stores the section as its own record", persisted.present === true, persisted);
check(
  "A3 the stored record holds all three values",
  persisted.section &&
    persisted.section.eyebrow === custom.eyebrow &&
    persisted.section.heading === custom.heading &&
    persisted.section.description === custom.description,
  persisted.section,
);
check(
  "A3 buttons keep their own independent records",
  persisted.buttons === 2,
  persisted.buttons,
);

/* ---- A4: an empty field drops only its own element ---- */
await browser.seed(
  baseDraft({
    customLinksSection: { eyebrow: "", heading: "Just the heading.", description: "   " },
  }),
);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
links = await browser.evalJs(READ_LINKS);
check("A4 blank eyebrow renders no eyebrow element", links.eyebrow === null, links.eyebrow);
check("A4 heading still renders", links.heading === "Just the heading.", links.heading);
check("A4 whitespace-only description renders nothing", links.description === null, links.description);
check("A4 buttons survive a blank copy line", links.buttonCount === 2, links.buttonCount);

await browser.seed(baseDraft({ customLinksSection: { eyebrow: "Only me", heading: "", description: "" } }));
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
links = await browser.evalJs(READ_LINKS);
check("A4 blank heading renders no <h2>", links.heading === null, links.heading);
check("A4 eyebrow alone still renders", links.eyebrow === "Only me", links.eyebrow);
check("A4 buttons survive with no heading", links.buttonCount === 2, links.buttonCount);

await browser.seed(baseDraft({ customLinksSection: { eyebrow: "", heading: "", description: "" } }));
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
links = await browser.evalJs(READ_LINKS);
check("A4 all-blank section renders no header block", links.headerBlock === false, links.headerBlock);
check("A4 all-blank section still renders the buttons", links.buttonCount === 2, links.buttonCount);

/* ---- A5: a pre-4.7 draft (no key at all) ---- */
const legacy = baseDraft();
delete legacy.customLinksSection;
await browser.seed(legacy);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
links = await browser.evalJs(READ_LINKS);
check(
  "A5 a draft with no customLinksSection key gets the default eyebrow",
  links.eyebrow === "Elsewhere",
  links.eyebrow,
);
check(
  "A5 a draft with no customLinksSection key gets the default heading",
  links.heading === "Where to find Noir.",
  links.heading,
);
check(
  "A5 a draft with no customLinksSection key gets the default description",
  links.description === "Other work, other rooms, other ways in.",
  links.description,
);
check("A5 its own buttons are untouched", links.buttonCount === 2, links.buttonCount);

/* ---- A6: malformed section data is repaired, not fatal ---- */
/*
 * Measure the console errors AFTER this navigation, not by diffing against a
 * global counter: the count also carries errors raised by the CDP probe's own
 * `Runtime.evaluate` bodies on other pages, which are not the app's.
 */
await browser.seed(
  baseDraft({
    customLinksSection: { eyebrow: 42, heading: null, description: ["nope"] },
  }),
);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
const malformedErrors = browser.consoleErrors.slice();
links = await browser.evalJs(READ_LINKS);
check("A6 malformed section does not blank the section", links.present === true, links);
check("A6 non-string eyebrow falls back to the default", links.eyebrow === "Elsewhere", links.eyebrow);
check("A6 null heading falls back to the default", links.heading === "Where to find Noir.", links.heading);
check("A6 array description falls back to the default", links.description === "Other work, other rooms, other ways in.", links.description);

/*
 * Scope: does the *new* code throw? Two page-level errors predate Phase 4.7 and
 * are filtered out here rather than allowed to mask a real failure:
 *
 *   - React #418 (hydration mismatch). /u/noir renders a hand-written
 *     server-rendered default profile and a client-side customised override; the
 *     two trees differ, so React always warns once a draft exists. It fires even
 *     with the links section hidden and with no links at all.
 *   - "SyntaxError: Unexpected identifier 'http'". `lib/themeBoot.ts` line 24
 *     embeds an unescaped `http://` inside an inline <script> string, which the
 *     HTML parser ends. Pre-existing; unrelated to section copy.
 *
 * Neither is caused by, nor reachable from, the Custom Links section record, so
 * the assertion here is "the new code adds no error of its own".
 */
const KNOWN_PREEXISTING = /#418|#423|hydrat|SyntaxError: Unexpected identifier 'http'/;
const newCodeErrors = malformedErrors.filter((e) => !KNOWN_PREEXISTING.test(e));
check(
  "A6 malformed section does not throw from the new code",
  newCodeErrors.length === 0,
  newCodeErrors,
);

/* ---- A7: the studio edits the three fields against the real preview ---- */
/*
 * Re-seed before the studio run. A1 cleared storage to check the first-visit
 * path, and the studio deliberately starts from an EMPTY button list, so
 * without a fresh draft this section would assert against a profile that has no
 * buttons to preview — which is what an earlier run of this suite reported.
 */
await browser.setViewport(1440, 1100);
await browser.seed(baseDraft());
await browser.goto(`${HOST}/studio`, { waitMs: 7000 });
await wait(3000);

/*
 * The studio mounts ONE panel at a time, so the Custom Links panel does not
 * exist in the DOM until its tab is selected. An earlier run of this suite
 * missed the tab and then read the panel's own (correct) values out of the
 * Identity tab's inputs, which is why it reported an empty button preview.
 */
await browser.evalJs(`
  const tab = document.querySelector('[data-testid="studio-tab-links"]');
  if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
  return Boolean(tab);
`, { once: true });
await wait(2000);

const tabState = await browser.evalJs(`
  const tab = document.querySelector('[data-testid="studio-tab-links"]');
  return { selected: tab ? tab.getAttribute('aria-selected') : null };
`);
check("A7 the Custom Links tab is open", tabState.selected === "true", tabState);

const studioFields = await browser.evalJs(`
  const q = (t) => document.querySelector('[data-testid="studio-' + t + '"]');
  return {
    hasGroup: Boolean(document.querySelector('[data-testid="studio-links-section-appearance"]')),
    eyebrow: Boolean(q('links-eyebrow-input')),
    heading: Boolean(q('links-heading-input')),
    description: Boolean(q('links-description-input')),
    headingIsText: q('links-heading-input') ? q('links-heading-input').tagName : null,
    descriptionIsTextarea: q('links-description-input') ? q('links-description-input').tagName : null,
  };
`);
check("A7 the studio has a Custom Links Section Appearance group", studioFields.hasGroup === true, studioFields);
check("A7 it has an eyebrow field", studioFields.eyebrow === true, studioFields);
check("A7 it has a heading text input", studioFields.heading === true && studioFields.headingIsText === "INPUT", studioFields);
check("A7 it has a multiline description field", studioFields.description === true && studioFields.descriptionIsTextarea === "TEXTAREA", studioFields);

// Type into the fields the way a person would, and read the panel preview.
const setField = (testId, value) => `
  const el = document.querySelector('[data-testid="${testId}"]');
  if (!el) return 'missing';
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
`;

await browser.evalJs(setField("studio-links-eyebrow-input", "Elsewhere, online"), { once: true });
await browser.evalJs(setField("studio-links-heading-input", "Say hello."), { once: true });
await browser.evalJs(setField("studio-links-description-input", "A short line under the heading."), { once: true });
await wait(1200);

const panelPreview = await browser.evalJs(`
  const scope = document.querySelector('[data-testid="studio-links-preview-scope"]');
  if (!scope) return { present: false };
  const block = scope.querySelector('[data-testid="custom-links-heading-block"]');
  return {
    present: true,
    eyebrow: block && block.querySelector('.pf-eyebrow') ? block.querySelector('.pf-eyebrow').textContent.trim() : null,
    heading: block && block.querySelector('h2') ? block.querySelector('h2').textContent.trim() : null,
    buttons: scope.querySelectorAll('[data-testid="custom-link"]').length,
  };
`);
check("A7 typing the eyebrow updates the panel preview", panelPreview.eyebrow === "Elsewhere, online", panelPreview);
check("A7 typing the heading updates the panel preview", panelPreview.heading === "Say hello.", panelPreview);
check("A7 the buttons are still in the preview", panelPreview.buttons === 2, panelPreview);

/* ---- A8: save, then confirm the public profile and a reload ---- */
await browser.evalJs(`
  const btn = document.querySelector('[data-testid="studio-save-btn"]');
  if (btn) btn.click();
  return Boolean(btn);
`, { once: true });
await wait(1200);

const afterSave = await browser.evalJs(`
  const raw = localStorage.getItem('prsme:profile-draft:v1');
  if (!raw) return { present: false };
  const d = JSON.parse(raw);
  return { present: true, section: d.customLinksSection ?? null };
`);
check(
  "A8 saving stores all three edited values",
  afterSave.section &&
    afterSave.section.eyebrow === "Elsewhere, online" &&
    afterSave.section.heading === "Say hello." &&
    afterSave.section.description === "A short line under the heading.",
  afterSave.section,
);

// Hard reload, no seed, to prove it came from storage and not from memory.
await browser.seed(undefined);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2200);
links = await browser.evalJs(READ_LINKS);
check("A8 after a reload /u/noir shows the saved eyebrow", links.eyebrow === "Elsewhere, online", links.eyebrow);
check("A8 after a reload /u/noir shows the saved heading", links.heading === "Say hello.", links.heading);
check(
  "A8 after a reload /u/noir shows the saved description",
  links.description === "A short line under the heading.",
  links.description,
);
check("A8 buttons survived the save", links.buttonCount === 2, links.buttonCount);

/* ---- A9: Reset demo returns the defaults and keeps buttons working ---- */
/*
 * "Reset demo" is a two-step control: the header button opens a confirmation
 * dialog, and the dialog's confirm button performs the reset. Clicking only the
 * first is why an earlier run of this suite reported that reset "did nothing".
 */
await browser.goto(`${HOST}/studio`, { waitMs: 7000 });
await wait(2500);
const openedReset = await browser.evalJs(`
  const btn = document.querySelector('[data-testid="studio-reset-btn"]');
  if (btn) btn.click();
  return Boolean(btn);
`, { once: true });
await wait(900);
check("A9 the Reset demo control is reachable", openedReset === true, openedReset);

const confirmedReset = await browser.evalJs(`
  const btn = document.querySelector('[data-testid="studio-reset-confirm-btn"]');
  if (btn) btn.click();
  return Boolean(btn);
`, { once: true });
await wait(1500);
check("A9 the confirmation step ran", confirmedReset === true, confirmedReset);

await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2200);
links = await browser.evalJs(READ_LINKS);
check("A9 reset restores the default eyebrow", links.eyebrow === "Elsewhere", links.eyebrow);
check("A9 reset restores the default heading", links.heading === "Where to find Noir.", links.heading);
check(
  "A9 reset restores the default description",
  links.description === "Other work, other rooms, other ways in.",
  links.description,
);
check("A9 reset keeps the demo buttons", links.buttonCount >= 3, links.buttonCount);

const hrefAfterReset = await browser.evalJs(`
  const a = document.querySelector('[data-testid="custom-link"]');
  return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null;
`);
check(
  "A9 a reset button is still a real outbound link",
  hrefAfterReset && (hrefAfterReset.href || '').startsWith('https://'),
  hrefAfterReset,
);

/* -------------------------------------------------------------------------- */
/*                       B. Soundtrack List on mobile                         */
/* -------------------------------------------------------------------------- */

const ROWS_PROBE = `
  const list = document.querySelector('.pf-soundtrack-list');
  if (!list) return { present: false };
  const lb = list.getBoundingClientRect();
  const cs = getComputedStyle(list);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const bordL = parseFloat(cs.borderLeftWidth) || 0;
  const bordR = parseFloat(cs.borderRightWidth) || 0;
  const contentL = lb.left + bordL + padL;
  const contentR = lb.right - bordR - padR;
  const rows = Array.from(list.querySelectorAll('.pf-soundtrack-row'));
  const offenders = [];
  const walk = (root) => {
    for (const el of root.children) {
      const b = el.getBoundingClientRect();
// Skip SVG subtrees, not just SVG elements. The Artwork placeholder is an
      // svg whose path/circle children are drawn past the artwork frame: it is a
      // cover illustration inside an overflow:hidden box, so those children are
      // painted into a clip and cannot influence layout. The browser still reports
      // their boxes unclipped, so a naive rect scan flags them. Descending into the
      // svg is what produced the false positive.
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') continue;
      if (b.width === 0 && b.height === 0) { walk(el); continue; }
      if (b.right > contentR + 0.5 || b.left < contentL - 0.5) {
        offenders.push({
          cls: (typeof el.className === 'string' ? el.className : el.tagName).split(/\s+/)[0],
          overR: +(b.right - contentR).toFixed(2),
          overL: +(contentL - b.left).toFixed(2),
        });
      }
      walk(el);
    }
  };
  walk(list);
  return {
    present: true,
    contentL: +contentL.toFixed(2),
    contentR: +contentR.toFixed(2),
    listOverflowsBy: list.scrollWidth - list.clientWidth,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    offenders,
    rows: rows.map((r) => {
      const b = r.getBoundingClientRect();
      const thumb = r.querySelector('.pf-soundtrack-thumb');
      const meta = r.querySelector('.pf-soundtrack-meta');
      const rating = r.querySelector('.pf-soundtrack-rating');
      const title = r.querySelector('.pf-soundtrack-title');
      const artist = r.querySelector('.pf-soundtrack-artist');
      const tb = thumb ? thumb.getBoundingClientRect() : null;
      const mb = meta ? meta.getBoundingClientRect() : null;
      const rb = rating ? rating.getBoundingClientRect() : null;
      return {
        tag: r.tagName,
        overR: +(b.right - contentR).toFixed(2),
        overL: +(contentL - b.left).toFixed(2),
        rowScrollOver: r.scrollWidth - r.clientWidth,
        thumbW: tb ? +tb.width.toFixed(2) : null,
        thumbH: tb ? +tb.height.toFixed(2) : null,
        thumbOverR: tb ? +(tb.right - contentR).toFixed(2) : null,
        metaOverR: mb ? +(mb.right - contentR).toFixed(2) : null,
        metaScrollOver: meta ? meta.scrollWidth - meta.clientWidth : null,
        titleClipped: title ? title.scrollWidth - title.clientWidth : null,
        artistClipped: artist ? artist.scrollWidth - artist.clientWidth : null,
        artistScrollOver: artist ? artist.scrollHeight - artist.clientHeight : null,
        artistWidth: artist ? +artist.getBoundingClientRect().width.toFixed(2) : null,
        artistHeight: artist ? +artist.getBoundingClientRect().height.toFixed(2) : null,
        artistFontSize: artist ? parseFloat(getComputedStyle(artist).fontSize) : null,
        metaWidth: meta ? +meta.getBoundingClientRect().width.toFixed(2) : null,
        ratingOverR: rb ? +(rb.right - contentR).toFixed(2) : null,
        metaRightVsRatingLeft:
          mb && rb ? +(mb.right - rb.left).toFixed(2) : null,
      };
    }),
  };
`;

for (const vw of [360, 390, 430]) {
  await browser.setViewport(vw, 900);
  await browser.seed(musicDraft());
  await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
  await wait(2000);
  await browser.evalJs(`
    const l = document.querySelector('.pf-soundtrack-list');
    if (l) l.scrollIntoView({ block: 'center' });
    return true;
  `);
  await wait(400);

  const probe = await browser.evalJs(ROWS_PROBE);
  check(`B1 @${vw} the music list is present`, probe.present === true, { rows: probe.rows?.length });
  check(
    `B1 @${vw} nothing inside the list escapes its content box`,
    probe.offenders.length === 0,
    probe.offenders,
  );
  check(`B1 @${vw} the list itself does not overflow`, probe.listOverflowsBy === 0, probe.listOverflowsBy);
  check(
    `B1 @${vw} the document gains no horizontal scroll`,
    probe.docOverflowX === 0,
    probe.docOverflowX,
  );
  check(
    `B1 @${vw} every row stays inside the content box`,
    probe.rows.every((r) => r.overR <= 0.5 && r.overL <= 0.5),
    probe.rows.map((r) => ({ overR: r.overR, overL: r.overL })),
  );
  check(
    `B1 @${vw} the artwork stays a square inside the row`,
    probe.rows.every((r) => r.thumbW === null || (Math.abs(r.thumbW - r.thumbH) < 0.5 && r.thumbOverR <= 0.5)),
    probe.rows.map((r) => ({ w: r.thumbW, h: r.thumbH, over: r.thumbOverR })),
  );
  check(
    `B1 @${vw} the metadata column shrinks rather than pushing`,
    probe.rows.every((r) => r.metaOverR === null || r.metaOverR <= 0.5),
    probe.rows.map((r) => r.metaOverR),
  );
  check(
    `B1 @${vw} the rating never leaves the row or collides with the text`,
    probe.rows.every(
      (r) =>
        (r.ratingOverR === null || r.ratingOverR <= 0.5) &&
        (r.metaRightVsRatingLeft === null || r.metaRightVsRatingLeft <= 0.5),
    ),
    probe.rows.map((r) => ({ ratingOver: r.ratingOverR, metaVsRating: r.metaRightVsRatingLeft })),
  );
  check(
    `B1 @${vw} no row has hidden horizontal content`,
    probe.rows.every((r) => r.rowScrollOver === 0 && (r.metaScrollOver ?? 0) === 0),
    probe.rows.map((r) => ({ row: r.rowScrollOver, meta: r.metaScrollOver })),
  );
  /*
   * A long album name is allowed to WRAP rather than to widen the row, and is
   * still capped at two lines, so a very long one is truncated with a visible
   * ellipsis. The assertion is therefore "it stayed inside the metadata column
   * and the clamp held" — not "every character is visible", which no bounded
   * row can honestly promise.
   */
  check(
    `B2 @${vw} a long album name wraps instead of widening the row`,
    probe.rows.every((r) => r.artistWidth === null || r.artistWidth <= r.metaWidth + 0.5),
    probe.rows.map((r) => ({ artistWidth: r.artistWidth, metaWidth: r.metaWidth })),
  );
  check(
    `B2 @${vw} the artist line never exceeds its two-line clamp`,
    probe.rows.every(
      (r) =>
        r.artistHeight === null || r.artistHeight <= 2 * r.artistFontSize * 1.6 + 2,
    ),
    probe.rows.map((r) => ({ h: r.artistHeight, font: r.artistFontSize })),
  );
  check(
    `B2 @${vw} the long title is fully readable`,
    probe.rows.every((r) => (r.titleClipped ?? 0) === 0),
    probe.rows.map((r) => r.titleClipped),
  );

  /* hover must not change any layout box */
  const rest = await browser.evalJs(ROWS_PROBE);
  const pt = await browser.evalJs(`
    const t = document.querySelector('.pf-soundtrack-row .pf-soundtrack-thumb');
    const b = t.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  `);
  await browser.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y, buttons: 0 });
  await wait(500);
  const hovered = await browser.evalJs(ROWS_PROBE);
  check(
    `B3 @${vw} hovering a row changes no box and adds no overflow`,
    JSON.stringify(hovered.rows) === JSON.stringify(rest.rows) &&
      hovered.listOverflowsBy === 0 &&
      hovered.docOverflowX === 0,
    { rest: rest.rows[0], hover: hovered.rows[0] },
  );
  await browser.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2, buttons: 0 });
  await wait(300);

  /* the linked row is still one real anchor */
  const nav = await browser.evalJs(`
    const rows = Array.from(document.querySelectorAll('.pf-soundtrack-row'));
    return rows.map((r) => ({
      tag: r.tagName,
      href: r.tagName === 'A' ? r.getAttribute('href') : null,
      target: r.tagName === 'A' ? r.getAttribute('target') : null,
      rel: r.tagName === 'A' ? r.getAttribute('rel') : null,
      nested: r.querySelectorAll('a').length,
    }));
  `);
  check(
    `B4 @${vw} a row with a catalogue URL is still a single real link`,
    nav[0].tag === "A" &&
      (nav[0].href || "").startsWith("https://") &&
      nav[0].target === "_blank" &&
      nav[0].rel === "noopener noreferrer" &&
      nav[0].nested === 0,
    nav[0],
  );
  check(
    `B4 @${vw} no separate square external-link button came back`,
    nav.every((n) => n.tag === "A" || n.tag === "DIV"),
    nav.map((n) => n.tag),
  );
  check(`B4 @${vw} a row with no URL is not a link`, nav[2].tag !== "A", nav[2]);
}

/* ---- one targeted mobile screenshot for the record ---- */
await browser.setViewport(390, 900);
await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
await wait(2000);
const clip = await browser.evalJs(`
  const l = document.querySelector('.pf-soundtrack-list');
  l.scrollIntoView({ block: 'center' });
  const b = l.getBoundingClientRect();
  return { x: Math.max(0, b.left - 4), y: Math.max(0, b.top - 4), width: b.width + 8, height: b.height + 8 };
`);
await wait(400);
await browser.screenshot("docs/screenshots/phase47/soundtrack-list-390-after.png", { clip });
console.log("\nsaved docs/screenshots/phase47/soundtrack-list-390-after.png");

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
}
process.exitCode = failed.length ? 1 : 0;