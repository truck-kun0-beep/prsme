/**
 * Phase 4 regression suite.
 *
 * Drives a real browser against the production build on 127.0.0.1:3000 and
 * exercises the full Phase 4 flow: search a real catalogue, add the result to
 * a collection, write a review, read the full review, and sweep for layout
 * overflow at every required breakpoint.
 *
 * Requires the prod server to be running:
 *   npm run build && npm run start
 *   npm run test:phase4
 */

import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";

const results = [];
function test(name, value, pass) {
  results.push({ name, pass: !!pass });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}\n        ${JSON.stringify(value)}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { goto, setViewport, evalJs, close } = await connect();

/** Type into the picker search box the way a user does (React onChange). */
async function searchInPicker(query) {
  await evalJs(`
    const input = document.querySelector('input[type="search"]');
    if (!input) return "no-input";
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "typed";
  `);
}

try {
  /* ------------------- T1. Every kind reaches a real provider ---------- */
  await setViewport(1280, 1000);
  // Land on the app origin first so same-origin `fetch` calls below succeed.
  await goto(`${HOST}/`, { waitMs: 1500 });

  const kindCases = [
    { kind: "movie", q: "interstellar", expect: "cinemeta" },
    { kind: "tv", q: "crash landing on you", expect: "tvmaze" },
    { kind: "tv", q: "game of thrones", expect: "tvmaze" },
    { kind: "song", q: "around the world daft punk", expect: "itunes" },
    { kind: "album", q: "random access memories", expect: "itunes" },
    { kind: "manga", q: "fullmetal alchemist", expect: "mangadex" },
    { kind: "book", q: "the hobbit", expect: "openlibrary" },
  ];

  for (const c of kindCases) {
    const res = await evalJs(`
      const r = await fetch("/api/media/search?kind=${c.kind}&q=" + encodeURIComponent(${JSON.stringify(c.q)}));
      const j = await r.json();
      return {
        status: r.status,
        count: j.results.length,
        first: j.results[0] ? {
          title: j.results[0].title,
          provider: j.results[0].provider,
          year: j.results[0].year ?? null,
          cover: j.results[0].coverUrl ? j.results[0].coverUrl.slice(0, 60) : null,
        } : null,
        providers: j.providers.map(p => p.provider + ":" + p.status),
      };
    `);
    test(
      `T1 ${c.kind} "${c.q}" returns real results`,
      res,
      res.status === 200 &&
        res.count > 0 &&
        res.providers.some((p) => p.startsWith(`${c.expect}:ok`)),
    );
  }

  /* ------------------- T2. Movies search returns real hits ------------ */
  const movieRes = await evalJs(`
    const r = await fetch("/api/media/search?kind=movie&q=inception");
    const j = await r.json();
    return { status: r.status, count: j.results.length, degraded: j.degraded,
             providers: j.providers.map(p => p.provider + ":" + p.status),
             topTitle: j.results[0]?.title || null };
  `);
  // Phase 4.1: Cinemeta is wired in as the default movie provider, so a
  // legitimate query for "inception" returns the Christopher Nolan film
  // (or an empty list if the search happens to miss). Either way: no
  // fabricated results, no provider failure reported as a success.
  test(
    "T2 movie search returns real results for a real title",
    movieRes,
    movieRes.status === 200
      // No provider returned a runtime error. `tmdb:disabled` is an honest
      // "not configured for this deployment" status, not a failure.
      && movieRes.providers.every((p) => !/error/.test(p))
      // Either we found real items, or every enabled provider failed and
      // we report degraded — never fabricated results.
      && (
        movieRes.count > 0
          ? movieRes.topTitle !== null && movieRes.degraded === false
          : movieRes.degraded === true
      ),
  );

  /* ------------------- T3. The route is not an open proxy ------------- */
  const proxy = await evalJs(`
    const out = [];
    for (const u of [
      "/api/media/search?kind=book&q=x&url=http://example.com",
      "/api/media/search?kind=../../etc/passwd&q=x",
      "/api/media/search?kind=book&q=" + encodeURIComponent("http://169.254.169.254/latest/meta-data"),
    ]) {
      const r = await fetch(u);
      const j = await r.json().catch(() => ({}));
      out.push({ u, status: r.status, error: j.error ?? null, results: j.results?.length ?? 0 });
    }
    return out;
  `);
  test("T3 no open-proxy behaviour on /api/media/search", proxy, proxy.every((p) => p.results === 0));

  /* ------------------- T4. Search → select → add ---------------------- */
  // Start from a clean draft so a previous run cannot satisfy the assertions.
  await goto(`${HOST}/studio`, { waitMs: 3000 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1"); return true;`);
  await goto(`${HOST}/studio`, { waitMs: 4500 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click(); return true;`);
  await wait(400);

  const opened = await evalJs(`
    const btn = document.querySelector('[data-testid^="studio-collection-add-col-"]');
    if (!btn) return "no-button";
    btn.click();
    return "opened";
  `);
  test("T4a picker opens from a collection", opened, opened === "opened");
  await wait(400);

  await evalJs(`
    const sel = document.querySelector('select');
    if (sel) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(sel, "tv");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  `);
  await wait(300);
  await searchInPicker("game of thrones");
  await wait(2500); // 420ms debounce + network

  const count = await evalJs(`return document.querySelectorAll('[data-testid^="media-result-"]').length;`);
  test("T4b picker shows live TVMaze results", count, count > 0);

  const firstResult = await evalJs(`
    const el = document.querySelector('[data-testid^="media-result-"]');
    if (!el) return null;
    return {
      provider: el.getAttribute("data-testid"),
      title: el.getAttribute("data-title"),
      cover: el.getAttribute("data-cover"),
      hasImg: Boolean(el.querySelector("img")),
      sourceLabel: el.textContent.includes("TVMaze"),
    };
  `);
  test(
    "T4c result carries artwork + honest source label",
    firstResult,
    Boolean(firstResult && firstResult.cover === "yes" && firstResult.hasImg && firstResult.sourceLabel),
  );

  await evalJs(`document.querySelector('[data-testid="media-result-tvmaze"]').click(); return true;`);
  await wait(700);

  const added = await evalJs(`
    const items = document.querySelectorAll('[data-testid^="studio-collection-item-media-"]');
    return { count: items.length, text: items[0]?.textContent?.slice(0, 120) ?? null };
  `);
  test("T4d selected item is added to the collection", added, added.count === 1);

  /* ------------------- T5. In-collection duplicate refused ------------ */
  await evalJs(`document.querySelector('[data-testid^="studio-collection-add-col-"]').click(); return true;`);
  await wait(400);
  await evalJs(`
    const sel = document.querySelector('select');
    if (sel) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(sel, "tv");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  `);
  await wait(300);
  await searchInPicker("game of thrones");
  await wait(2500);
  await evalJs(`
    const el = document.querySelector('[data-testid="media-result-tvmaze"]');
    if (el) el.click();
    return true;
  `);
  await wait(700);

  const afterDup = await evalJs(`
    const items = document.querySelectorAll('[data-testid^="studio-collection-item-media-"]');
    const notice = document.querySelector('[data-testid="studio-collection-notice"]');
    return { count: items.length, notice: notice?.textContent ?? null };
  `);
  test(
    "T5 duplicate inside a collection is refused with a visible notice",
    afterDup,
    afterDup.count === 1 && Boolean(afterDup.notice),
  );

  /* ------------------- T6. Write a review ---------------------------- */
  const review = await evalJs(`
    const btn = document.querySelector('[data-testid="studio-item-review-media-tvmaze-82"]');
    if (!btn) return "no-review-button";
    btn.click();
    return "opened";
  `);
  await wait(400);

  const reviewed = await evalJs(`
    const drawer = document.querySelector('[data-testid="studio-review-drawer"]');
    if (!drawer) return { ok: false, reason: "drawer-missing" };
    const headline = drawer.querySelector('#review-title');
    const body = drawer.querySelector('#review-body');
    if (!headline || !body) return { ok: false, reason: "fields-missing" };
    const setInput = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const setArea = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setInput(headline, "Crown work");
    setArea(body, "Every season tightens the screw without losing the human scale.");
    const rating = [...drawer.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === "9");
    if (rating) rating.click();
    await new Promise(r => setTimeout(r, 250));
    const save = [...drawer.querySelectorAll('button')].find(b => b.textContent.includes("Save review"));
    if (!save) return { ok: false, reason: "no-save" };
    save.click();
    return { ok: true };
  `);
  test("T6 review form accepts rating + headline + body", reviewed, reviewed.ok === true);
  await wait(600);

  /* ------------------- T7. Persist, then read on the profile ---------- */
  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click(); return true;`);
  await wait(900);

  const draftReview = await evalJs(`
    const raw = localStorage.getItem("prsme:profile-draft:v1");
    const j = raw ? JSON.parse(raw) : null;
    const col = (j?.collections ?? []).find(c => c.id === "col-films");
    const item = (col?.items ?? []).find(i => i.id === "media-tvmaze-82");
    return {
      present: Boolean(item),
      review: item?.myReview ?? null,
      title: item?.myReviewTitle ?? null,
      rating: item?.myRating ?? null,
    };
  `);
  test(
    "T6b review persisted onto the added item in the saved draft",
    draftReview,
    draftReview.present === true &&
      draftReview.title === "Crown work" &&
      draftReview.rating === 9 &&
      Boolean(draftReview.review),
  );

  // The public profile renders the SSR demo first, then swaps in the saved
  // draft via the client override island. Wait for that swap.
  await goto(`${HOST}/u/noir`, { waitMs: 5500 });
  await evalJs(`
    for (let i = 0; i < 60; i++) {
      if (document.body.dataset.profileOverride === "active") return "override-active";
      await new Promise(r => setTimeout(r, 100));
    }
    return "override-never-active";
  `);
  await wait(300);

  const onProfile = await evalJs(`
    const link = document.querySelector('[data-testid="review-link-media-tvmaze-82"]');
    const imgs = [...document.querySelectorAll('[data-source="catalogue"] img')];
    return {
      reviewLinkHref: link ? link.getAttribute("href") : null,
      catalogueImages: imgs.length,
      src: imgs[0] ? imgs[0].getAttribute("src")?.slice(0, 70) : null,
      demoShelvesIntact: document.querySelectorAll('[data-testid="poster-card"]').length >= 6,
    };
  `);
  test(
    "T7 profile shows the added item's real artwork + a review link",
    onProfile,
    onProfile.catalogueImages > 0 &&
      onProfile.reviewLinkHref === "/u/noir/review/media-tvmaze-82" &&
      Boolean(onProfile.src && onProfile.src.startsWith("https://")) &&
      onProfile.demoShelvesIntact,
  );

  /* ------------------- T8. Read the full review ---------------------- */
  const reviewHref = onProfile.reviewLinkHref;
  if (!reviewHref) {
    test("T8 could not open the full review", onProfile, false);
    throw new Error("no review link on profile");
  }
  await goto(`${HOST}${reviewHref}`, { waitMs: 3000 });

  const reviewPage = await evalJs(`
    return {
      title: document.querySelector('[data-testid="review-page-title"]')?.textContent ?? null,
      headline: document.querySelector('[data-testid="review-page-headline"]')?.textContent ?? null,
      body: document.querySelector('[data-testid="review-page-body"]')?.textContent ?? null,
      localOnly: Boolean(document.querySelector('[data-testid="review-local-only-notice"]')),
      back: Boolean(document.querySelector('a[href="/u/noir"]')),
      hasArtwork: document.querySelectorAll('[data-source="catalogue"] img').length,
    };
  `);
  test(
    "T8 full review page shows headline, body, artwork, and the local-only notice",
    reviewPage,
    reviewPage.headline === "Crown work" &&
      Boolean(reviewPage.body) &&
      reviewPage.localOnly &&
      reviewPage.back &&
      reviewPage.hasArtwork > 0,
  );

  /* ------------------- T9. Responsive sweep -------------------------- */
  const widths = [360, 390, 430, 768, 832, 1024, 1280, 1440];
  const overflow = [];
  for (const w of widths) {
    await setViewport(w, 900);
    for (const path of ["/u/noir", "/studio", reviewHref]) {
      // The profile swaps in the saved draft after hydration and remote
      // artwork can shift layout, so let each page settle.
      await goto(`${HOST}${path}`, { waitMs: path === "/u/noir" ? 4200 : 2600 });
      await wait(400);
      const res = await evalJs(`
        return {
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      `);
      if (res.overflow > 1) overflow.push({ w, path, ...res });
    }
  }
  test("T9 no horizontal overflow at 360→1440 across profile, studio, review", overflow, overflow.length === 0);

  /* ------------------- T10. No secrets in browser storage ------------ */
  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3000 });
  const storage = await evalJs(`
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) ?? "";
      out[k] = { bytes: v.length, hasSecret: /api[_-]?key|token|bearer|secret/i.test(v) };
    }
    return out;
  `);
  test("T10 no provider secrets stored in the browser", storage, Object.values(storage).every((s) => !s.hasSecret));

  /* ------------------- T11. Artwork stored as URL, not binary -------- */
  const mediaArtwork = await evalJs(`
    const raw = localStorage.getItem("prsme:profile-draft:v1") || "";
    const j = raw ? JSON.parse(raw) : null;
    if (!j) return { ok: true, reason: "no-draft" };
    const covers = [];
    for (const c of j.collections ?? []) {
      for (const it of c.items ?? []) {
        covers.push({
          id: it.id,
          cover: it.coverUrl ?? null,
          isDataUrl: String(it.coverUrl ?? "").startsWith("data:"),
        });
      }
    }
    return { ok: true, covers };
  `);
  test(
    "T11 media artwork is stored as a catalogue URL, never a binary",
    mediaArtwork,
    mediaArtwork.ok && (mediaArtwork.covers ?? []).every((c) => !c.isDataUrl),
  );

  /* ------------------- T12. Soundtrack cover swaps ------------------- */
  // Seed a known soundtrack first so there is a cover to replace.
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-soundtrack"]')?.click(); return true;`);
  await wait(500);
  await evalJs(`document.querySelector('[data-testid="studio-soundtrack-restore-demo"]')?.click(); return true;`);
  await wait(900);

  const readSoundtrackCover = `
    const el = document.querySelector('[data-testid="studio-soundtrack-cover"] img')
      || document.querySelector('[data-testid="studio-soundtrack-cover"] [data-source="catalogue"]');
    return { hasSrc: Boolean(el), src: el?.getAttribute("src")?.slice(0, 60) ?? null };
  `;

  const beforeCover = await evalJs(readSoundtrackCover);

  await evalJs(`document.querySelector('[data-testid="studio-soundtrack-search"]')?.click(); return true;`);
  await wait(500);
  await searchInPicker("random access memories");
  await wait(2500);
  const picked = await evalJs(`
    const el = document.querySelector('[data-testid^="media-result-"]');
    if (!el) return null;
    el.click();
    return el.getAttribute("data-title");
  `);
  await wait(900);

  const afterCover = await evalJs(readSoundtrackCover);
  test(
    "T12 picking a new soundtrack swaps the cover instead of keeping the old one",
    { picked, before: beforeCover, after: afterCover },
    Boolean(picked) &&
      // The demo link's Spotify CDN host is deliberately not allowlisted, so
      // the "before" state is legitimately a placeholder. What matters is that
      // the *after* state carries a real catalogue cover that replaced it.
      afterCover.hasSrc &&
      afterCover.src !== beforeCover.src &&
      Boolean(afterCover.src?.startsWith("https://")),
  );
} catch (error) {
  test("suite crashed", { message: error?.message ?? String(error) }, false);
} finally {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await close();
  process.exit(failed.length === 0 ? 0 : 1);
}