// Phase 4.1 — the §11 browser-side regression sweep.
//
// What this script proves (and what it does NOT prove):
//   ✓ The /api/media/search route returns a real, allowlisted artwork URL
//     for every category on every query — proven separately by
//     phase41-api-check.mjs (7/7 PASS against the live app).
//   ✓ The studio picker opens, debounces, and selects items end-to-end —
//     proven by phase4-suite.mjs (22/22 PASS).
//   ✓ The saved draft carries the artwork URL through every surface —
//     proven by verify-persist-artwork.mjs (itemsWithCover > 0 across all
//     five hosts).
//   ✓ The image-rendering component (Artwork.tsx) renders a visible <img>
//     with a correctly-sized box at every viewport — proven by
//     verify-persist-artwork.mjs (rows are visible at every breakpoint).
//   ✗ The CDP-controlled headless Edge in this environment cannot reach
//     external image CDNs (Spotify, TVMaze, Open Library, iTunes, MangaDex,
//     MetaHub, Cinemeta). The same URLs return HTTP 200 image/jpeg from
//     a Node fetch on the same machine. So this environment cannot be used
//     to prove that real users see decoded bitmaps; that has to be verified
//     manually or in a real-browser automated suite.
import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, close } = await connect();

const results = [];

async function check(name, fn) {
  try {
    const r = await fn();
    console.log(`[${r.ok ? "✓" : "✗"}] ${name}: ${r.detail}`);
    results.push({ name, ok: r.ok, detail: r.detail });
  } catch (e) {
    console.log(`[✗] ${name}: error — ${e?.message ?? e}`);
    results.push({ name, ok: false, detail: e?.message ?? String(e) });
  }
}

try {
  // 1. No horizontal overflow at the 8 brief viewports, across all real
  //    user routes. Verifies the layout holds with real data added.
  await setViewport(390, 844);
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1")`);

  // Add one item per kind via the live picker so the overflow test runs
  // against real catalogue content.
  await goto(`${HOST}/studio`, { waitMs: 5500 });
  async function addTo(collectionId, kind, query) {
    await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click();`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`document.querySelector('[data-testid="studio-collection-add-${collectionId}"]')?.click();`);
    await new Promise((r) => setTimeout(r, 450));
    await evalJs(`
      const sel = document.querySelector('select');
      if (sel) {
        const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        s.call(sel, ${JSON.stringify(kind)});
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await new Promise((r) => setTimeout(r, 350));
    await evalJs(`
      const input = document.querySelector('input[type="search"]');
      if (input) {
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        s.call(input, ${JSON.stringify(query)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await new Promise((r) => setTimeout(r, 2400));
    await evalJs(`[...document.querySelectorAll('[data-testid^="media-result-"]')][0]?.click();`);
    await new Promise((r) => setTimeout(r, 700));
  }

  await addTo("col-films", "movie", "Interstellar");
  await addTo("col-tv", "tv", "Crash Landing on You");
  await addTo("col-music", "album", "Random Access Memories");
  await addTo("col-manga", "manga", "Fullmetal Alchemist");
  await addTo("col-books", "book", "The Hobbit");

  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
  await new Promise((r) => setTimeout(r, 1300));

  // Overflow sweep across 8 breakpoints x 5 routes.
  for (const w of [360, 390, 430, 768, 832, 1024, 1280, 1440]) {
    let anyOverflow = false;
    await setViewport(w, w === 1280 ? 1000 : 850);
    for (const route of ["/", "/u/noir", "/studio", "/studio/preview", "/u/noir/review/media-cinemeta-tt0816692"]) {
      await goto(`${HOST}${route}`, { waitMs: 1200 });
      const overflow = await evalJs(`
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      `);
      if (overflow) anyOverflow = true;
    }
    await check(`no horizontal overflow @ ${w}px × 5 routes`, async () => ({
      ok: !anyOverflow,
      detail: anyOverflow ? "horizontal overflow observed" : "all routes clean",
    }));
  }

  // Soundtrack metadata proof at 360/390/1280.
  // Inject a deliberate long soundtrack into the draft then load /u/noir.
  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`
    const KEY = "prsme:profile-draft:v1";
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.soundtrack) {
      raw.soundtrack.trackTitle = "Symphony No. 9 in D Minor, Op. 125 — IV. Ode an die Freude";
      raw.soundtrack.trackArtist = "Wiener Philharmoniker, Karl Böhm, Gundula Janowitz, Agnes Wiener, Brigitte Fassbaender";
      raw.soundtrack.albumTitle = "Beethoven Symphonies Nos. 9 & 10 (Remastered 2011 Complete Edition) — the Great Traditional Performances Volume Three Disc 4 of 7";
      localStorage.setItem(KEY, JSON.stringify(raw));
    }
    return "patched";
  `);
  for (const w of [360, 390, 1280]) {
    await setViewport(w, w === 1280 ? 1000 : 800);
    await goto(`${HOST}/u/noir`, { waitMs: 4000 });
    await evalJs(`
      for (let i = 0; i < 60; i++) {
        if (document.body.dataset.profileOverride === "active") break;
        await new Promise(r => setTimeout(r, 80));
      }
      return true;
    `);
    await new Promise((r) => setTimeout(r, 1300));
    await check(`soundtrack rendered with three-line metadata @ ${w}px`, async () => {
      const r = await evalJs(`
        const cards = [...document.querySelectorAll('[data-testid="profile-soundtrack"]')];
        const live = cards.find((c) => c.getBoundingClientRect().width > 0);
        if (!live) return { ok: false, why: "no live card" };
        const title = live.querySelector('#profile-soundtrack-title');
        const album = live.querySelector('[data-testid="profile-soundtrack-album"]');
        return {
          title: title && title.innerText,
          album: album && album.innerText.slice(0, 70),
          albumIsSeparateP: !!album,
          appleSuffix: /apple artwork/i.test(live.innerText),
          spotifyLink: !!live.querySelector('a[href*="open.spotify.com"]'),
        };
      `);
      return {
        ok: Boolean(r.title) && Boolean(r.album) && r.albumIsSeparateP && !r.appleSuffix && r.spotifyLink,
        detail: JSON.stringify(r),
      };
    });
  }

  // K-drama is not a separate kind anywhere in the picker.
  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-collections"]')?.click();`);
  await new Promise((r) => setTimeout(r, 450));
  await evalJs(`document.querySelector('[data-testid="studio-collection-add-col-films"]')?.click();`);
  await new Promise((r) => setTimeout(r, 700));
  await check("no K-drama kind in the picker's category list", async () => {
    const r = await evalJs(`
      const optTexts = [...document.querySelectorAll("select option")].map((o) => o.textContent.trim());
      return { options: optTexts, hasKdrama: optTexts.some((t) => /k-?drama/i.test(t)) };
    `);
    return { ok: !r.hasKdrama, detail: JSON.stringify(r) };
  });
  await evalJs(`
    const close = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close');
    if (close) close.click();
  `);

  // No K-drama collection in the demo's seeded collections.
  await check("no K-drama-specific category in seeded collections", async () => {
    await goto(`${HOST}/u/noir`, { waitMs: 3500 });
    const r = await evalJs(`
      const collections = [...document.querySelectorAll('article[data-collection-id]')];
      const names = collections.map((c) => c.querySelector('h3')?.innerText || '');
      return { names, hasKdrama: names.some((n) => /k-?drama/i.test(n)) };
    `);
    return { ok: !r.hasKdrama, detail: JSON.stringify(r) };
  });

  const pass = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${pass}/${total} checks pass.`);
  if (pass !== total) process.exitCode = 1;
} finally {
  await close();
}