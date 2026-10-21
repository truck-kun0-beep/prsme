/**
 * Phase 4 screenshot capture — the §14 evidence set.
 *
 * Produces real browser screenshots of:
 *   - media search results (one per catalogue kind with a live provider)
 *   - a selected item with its real poster on the public profile
 *   - a manga result and a book result
 *   - a review excerpt and the complete review
 *   - the studio collections panel with real items
 *
 * Requires the prod server on 127.0.0.1:3000 and Edge on the CDP port.
 *   npm run build && npm run start
 *   node scripts/capture-phase4.mjs
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase4";

mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { goto, setViewport, evalJs, screenshot, close } = await connect();

async function shot(name, { fullPage = false } = {}) {
  const path = join(OUT, `${name}.png`);
  await screenshot(path, { fullPage });
  console.log("  saved", path);
}

/** Set a <select> value the way a user would, so React's onChange fires. */
async function setPickerKind(kind) {
  await evalJs(`
    const sel = document.querySelector('select');
    if (!sel) return "no-select";
    const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    s.call(sel, ${JSON.stringify(kind)});
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return "set";
  `);
  await wait(300);
}

/** Type a query into the picker search box. */
async function typeQuery(query) {
  const res = await evalJs(`
    const input = document.querySelector('input[type="search"]');
    if (!input) return "no-input";
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    s.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "typed";
  `);
  if (res !== "typed") throw new Error(`could not type into the picker: ${res}`);
  await wait(2600); // 420ms debounce + provider round trip
}

/**
 * Add one catalogue record to one collection inside a single studio session.
 * `collectionId` targets a specific shelf so each item lands somewhere sensible.
 */
async function addToCollection(collectionId, kind, query, resultTestId) {
  await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click(); return true;`);
  await wait(400);
  const opened = await evalJs(`
    const btn = document.querySelector('[data-testid="studio-collection-add-${collectionId}"]');
    if (!btn) return "no-button";
    btn.click();
    return "opened";
  `);
  if (opened !== "opened") throw new Error(`no add button for ${collectionId}: ${opened}`);
  await wait(400);

  await setPickerKind(kind);
  await typeQuery(query);

  const picked = await evalJs(`
    const el = document.querySelector('[data-testid="${resultTestId}"]');
    if (!el) return null;
    const title = el.getAttribute("data-title");
    el.click();
    return title;
  `);
  await wait(700);
  if (!picked) throw new Error(`no result to pick for ${kind} "${query}"`);
  console.log(`  added ${kind} → ${collectionId}: ${picked}`);
}

/** Write a review on a specific item. */
async function writeReview(itemId, headline, body, rating) {
  await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click(); return true;`);
  await wait(500);
  const opened = await evalJs(`
    const btn = document.querySelector('[data-testid="studio-item-review-${itemId}"]');
    if (!btn) return "no-button";
    btn.click();
    return "clicked";
  `);
  if (opened !== "clicked") throw new Error(`no review button for ${itemId}: ${opened}`);
  await wait(600);

  const filled = await evalJs(`
    const d = document.querySelector('[data-testid="studio-review-drawer"]');
    if (!d) return "no-drawer";
    const setInput = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const setArea = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setInput(d.querySelector('#review-title'), ${JSON.stringify(headline)});
    setArea(d.querySelector('#review-body'), ${JSON.stringify(body)});
    const rating = [...d.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === ${JSON.stringify(String(rating))});
    if (rating) rating.click();
    await new Promise(r => setTimeout(r, 300));
    return "filled";
  `);
  if (filled !== "filled") throw new Error(`review drawer not usable: ${filled}`);
}

/** Wait for the public profile's client override island to take over. */
async function waitForProfileOverride() {
  return evalJs(`
    for (let i = 0; i < 70; i++) {
      if (document.body.dataset.profileOverride === "active") return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  `);
}

try {
  /* ============ 1. Search results, one per catalogue ================= */
  console.log("capturing search results…");
  const searches = [
    { name: "search-tv", kind: "tv", query: "game of thrones" },
    { name: "search-crash-landing", kind: "tv", query: "crash landing on you" },
    { name: "search-song", kind: "song", query: "billie jean" },
    { name: "search-album", kind: "album", query: "random access memories" },
    { name: "search-manga", kind: "manga", query: "vagabond" },
    { name: "search-book", kind: "book", query: "left hand of darkness" },
  ];

  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3000 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1"); return true;`);

  for (const s of searches) {
    await goto(`${HOST}/studio`, { waitMs: 4000 });
    await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click(); return true;`);
    await wait(400);
    await evalJs(`document.querySelector('[data-testid^="studio-collection-add-col-"]')?.click(); return true;`);
    await wait(400);
    await setPickerKind(s.kind);
    await typeQuery(s.query);
    await shot(`01-${s.name}-1280`);
    // Close the dialog so the next navigation is clean.
    await evalJs(`
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Close');
      if (btn) btn.click();
      return true;
    `);
    await wait(250);
  }

  // Mobile picker proof.
  await setViewport(390, 844);
  await goto(`${HOST}/studio`, { waitMs: 4000 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click(); return true;`);
  await wait(400);
  await evalJs(`document.querySelector('[data-testid^="studio-collection-add-col-"]')?.click(); return true;`);
  await wait(400);
  await setPickerKind("song");
  await typeQuery("billie jean");
  await shot("02-search-song-390");
  await setViewport(1280, 1000);

  /* ============ 2. Add real items and review one ====================== */
  console.log("adding real catalogue items…");
  await goto(`${HOST}/studio`, { waitMs: 3000 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1"); return true;`);
  await goto(`${HOST}/studio`, { waitMs: 5000 });

  // Each goes to the shelf whose category matches it — the realistic flow.
  await addToCollection("col-films", "tv", "game of thrones", "media-result-tvmaze");
  await addToCollection("col-manga", "manga", "vagabond", "media-result-mangadex");
  await addToCollection("col-books", "book", "left hand of darkness", "media-result-openlibrary");
  await addToCollection("col-music", "album", "random access memories", "media-result-itunes");

  await shot("03-studio-collections-with-real-items-1280");

  console.log("writing a review…");
  await writeReview(
    "media-tvmaze-82",
    "Crown work",
    "Every season tightens the screw without losing the human scale.\n\nThe pacing is confident, the cast is generous with each other, and the last hour of season one is among the best television made in this century.",
    "9",
  );
  await shot("04-review-editor-1280");

  await evalJs(`
    const d = document.querySelector('[data-testid="studio-review-drawer"]');
    const save = d && [...d.querySelectorAll('button')].find(b => b.textContent.includes("Save review"));
    if (save) save.click();
    return true;
  `);
  await wait(700);
  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click(); return true;`);
  await wait(1000);

  /* ============ 3. Public profile with real artwork ================== */
  console.log("capturing the public profile…");
  await setViewport(1280, 1100);
  await goto(`${HOST}/u/noir`, { waitMs: 5500 });
  await waitForProfileOverride();
  await wait(600);
  await shot("05-profile-real-artwork-1280");

  await evalJs(`
    const card = document.querySelector('[data-source="catalogue"]');
    if (card) card.scrollIntoView({ block: "center" });
    return true;
  `);
  await wait(600);
  await shot("06-profile-selected-item-closeup-1280");

  /* ============ 4. The complete review page ========================== */
  console.log("capturing the full review…");
  const reviewHref = await evalJs(`
    const a = document.querySelector('[data-testid="review-link-media-tvmaze-82"]');
    return a ? a.getAttribute("href") : null;
  `);
  if (!reviewHref) {
    throw new Error("no review link on the public profile — the review did not save");
  }

  await goto(`${HOST}${reviewHref}`, { waitMs: 3500 });
  await shot("07-full-review-1280", { fullPage: true });

  await setViewport(390, 844);
  await goto(`${HOST}${reviewHref}`, { waitMs: 3000 });
  await shot("08-full-review-390", { fullPage: true });
  await setViewport(1280, 1100);

  /* ============ 5. Mobile profile ===================================== */
  await setViewport(390, 844);
  await goto(`${HOST}/u/noir`, { waitMs: 5500 });
  await waitForProfileOverride();
  await wait(500);
  await shot("09-profile-390", { fullPage: true });

  console.log("done.");
} catch (error) {
  console.error("capture failed:", error?.message ?? error);
  process.exitCode = 1;
} finally {
  await close();
}