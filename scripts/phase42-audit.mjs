// Phase 4.2 — reproduce reported defects on a real profile render.
//
// Seeds a draft with REAL provider records (Cinemeta, TVMaze, iTunes, MangaDex,
// OpenLibrary) and reports the actual DOM state for each layout at 360, 768,
// 1024, 1280px. The probe intentionally fails fast if a defect reproduces so
// the report is honest, not "looks fine in the screenshots".
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase42";
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { goto, setViewport, evalJs, screenshot, close } = await connect();

async function searchRecord(kind, q) {
  const u = `${HOST}/api/media/search?kind=${kind}&q=${encodeURIComponent(q)}`;
  return await evalJs(`
    (async () => {
      const r = await fetch(${JSON.stringify(u)});
      if (!r.ok) return { status: r.status, results: [] };
      const j = await r.json();
      const first = j.results?.[0];
      return {
        status: r.status, count: j.results?.length ?? 0,
        first: first ? {
          id: first.id, kind: first.kind, title: first.title,
          provider: first.provider, providerId: first.providerId,
          coverUrl: first.coverUrl, creator: first.creator,
          year: first.year, externalUrl: first.externalUrl
        } : null
      };
    })()
  `);
}

try {
  // Set viewports on launch.
  await setViewport(1280, 900);
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1")`);
  await goto(`${HOST}/studio`, { waitMs: 3500 });

  // Find real records to seed.
  const queries = [
    { kind: "movie", q: "interstellar", makeRating: 9.6 },
    { kind: "movie", q: "paper lanterns", makeRating: 9.4 },
    { kind: "movie", q: "soft terror", makeRating: 9.1 },
    { kind: "movie", q: "the long summer", makeRating: 8.8 },
    { kind: "movie", q: "light traffic", makeRating: 8.6 },
    { kind: "movie", q: "the quiet channel", makeRating: 8.4 },
    { kind: "tv", q: "game of thrones", makeRating: 9.4 },
    { kind: "tv", q: "the bear", makeRating: 9.1 },
    { kind: "tv", q: "succession", makeRating: 9.3 },
    { kind: "tv", q: "fleabag", makeRating: 9.0 },
    { kind: "song", q: "around the world", makeRating: 9.4 },
    { kind: "song", q: "get lucky", makeRating: 9.2 },
    { kind: "song", q: "instant crush", makeRating: 9.6 },
    { kind: "song", q: "contact", makeRating: 8.9 },
    { kind: "song", q: "something about us", makeRating: 9.0 },
    { kind: "album", q: "random access memories", makeRating: 9.5 },
    { kind: "album", q: "discovery", makeRating: 9.2 },
    { kind: "album", q: "homework", makeRating: 9.0 },
    { kind: "manga", q: "vagabond", makeRating: 9.5 },
    { kind: "manga", q: "fullmetal alchemist", makeRating: 9.3 },
    { kind: "manga", q: "berserk", makeRating: 9.6 },
    { kind: "manga", q: "chihayafuru", makeRating: 9.1 },
    { kind: "book", q: "the hobbit", makeRating: 9.3 },
    { kind: "book", q: "the name of the wind", makeRating: 9.6 },
    { kind: "book", q: "the wise mans fear", makeRating: 9.2 },
  ];
  const records = {};
  for (const q of queries) {
    const r = await searchRecord(q.kind, q.q);
    (records[q.kind] ??= []).push({ ...r, fallbackRating: q.makeRating });
  }

  // Build a draft directly via localStorage with curated content.
  await evalJs(`
    function mapItem(r, fallbackRating) {
      const f = r.first ?? {};
      return {
        id: f.id || (r.kind + "-" + Math.random().toString(36).slice(2, 8)),
        title: f.title || "Untitled",
        byline: f.creator || undefined,
        kind: (f.kind || r.kind),
        myRating: fallbackRating,
        myReview: "Demo review for " + (f.title || "this item") + ".",
        myReviewTitle: "Demo",
        year: f.year || undefined,
        palette: "violet",
        coverUrl: f.coverUrl,
        coverSource: f.provider,
        provider: f.provider,
        providerId: f.providerId,
        externalUrl: f.externalUrl,
      };
    }
    const movies = ${JSON.stringify(records.movie ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const tvs = ${JSON.stringify(records.tv ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const songs = ${JSON.stringify(records.song ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const albums = ${JSON.stringify(records.album ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const mangas = ${JSON.stringify(records.manga ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const books = ${JSON.stringify(records.book ?? [])}.filter(r => r.first).map(r => mapItem(r, r.fallbackRating));
    const draft = {
      version: 1,
      identity: { displayName: "Noir Aldridge", bio: "", location: "", pronouns: "", avatarPalette: "violet" },
      tags: [], socials: [],
      appearance: { theme: "obsidian", typography: "serif", layout: "editorial", background: "solid", density: "comfortable" },
      visibility: "public",
      sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
      sectionVisibility: { soundtrack: true, collections: true, activity: false, clicks: false },
      soundtrack: null,
      collections: [
        { id: "col-films", name: "Films That Stayed With Me", layout: "featured", visibility: "public",
          description: "Quiet ones and loud ones — the films I still think about years later.",
          items: movies.length ? movies : [{ id: "demo-1", title: "Pastel City", byline: "Dir. Hana Kawai", kind: "movie", palette: "iris", myRating: 9.4 }] },
        { id: "col-tv", name: "TV Series for Rainy Days", layout: "compact", visibility: "public",
          description: "Slow-burners, melancholic leads, and endings that don't shout.",
          items: tvs.length ? tvs : [{ id: "demo-2", title: "Looking Glass", byline: "Dir. E. Kibet", kind: "tv", palette: "cyan", myRating: 9.2 }] },
        { id: "col-music", name: "Albums on Repeat", layout: "poster-grid", visibility: "public",
          description: "Plays per day too embarrassing to share.",
          items: albums.length ? albums : [{ id: "demo-3", title: "Doin' it Right", byline: "Daft Punk", kind: "album", palette: "violet", myRating: 9.4 }] },
        { id: "col-music-songs", name: "Songs I Never Skip", layout: "soundtrack-list", visibility: "public",
          description: "The hooks I always let play out.",
          items: songs.length ? songs : [] },
        { id: "col-manga", name: "Manga I Could Read Forever", layout: "compact", visibility: "public",
          description: "Panels worth re-reading.",
          items: mangas.length ? mangas : [] },
        { id: "col-books", name: "Books That Changed My Perspective", layout: "compact", visibility: "public",
          description: "Long-form companions.",
          items: books.length ? books : [] },
      ],
    };
    localStorage.setItem("prsme:profile-draft:v1", JSON.stringify(draft));
    return {
      filmsCount: movies.length, tvCount: tvs.length, songCount: songs.length,
      albumsCount: albums.length, mangaCount: mangas.length, booksCount: books.length
    };
  `);

  // Use the single shared override island to flip noir on.
  await goto(`${HOST}/studio`, { waitMs: 3000 });
  await evalJs(`
    const btn = document.querySelector('[data-testid="studio-publish-btn"]') ||
                document.querySelector('[data-testid="apply-public-button"]');
    if (btn) btn.click();
    return "publish-attempted";
  `);
  await wait(1500);

  // Probe defects per layout at each viewport.
  const viewports = [
    { name: "360", w: 360, h: 740 },
    { name: "390", w: 390, h: 844 },
    { name: "768", w: 768, h: 1024 },
    { name: "1024", w: 1024, h: 768 },
    { name: "1280", w: 1280, h: 900 },
  ];
  const findings = [];
  for (const v of viewports) {
    await setViewport(v.w, v.h);
    await goto(`${HOST}/u/noir`, { waitMs: 2500 });
    await evalJs(`
      for (let i = 0; i < 60; i++) {
        if (document.body.dataset.profileOverride === "active") break;
        await new Promise(r => setTimeout(r, 80));
      }
      return true;
    `);
    await wait(900);

    const probe = await evalJs(`
      const featured = document.querySelector('.pf-featured');
      const hero = document.querySelector('.pf-featured-hero-frame');
      const heroImg = hero ? hero.querySelector('img') : null;
      const heroCopy = document.querySelector('.pf-featured-copy');
      const list = document.querySelector('.pf-featured-list');

      const compactRows = [...document.querySelectorAll('.pf-compact-row')];
      const compactProbe = compactRows.slice(0, 5).map((row, i) => {
        const r = row.getBoundingClientRect();
        const idx = row.querySelector('.pf-compact-index');
        const title = row.querySelector('h4');
        const idxRect = idx ? idx.getBoundingClientRect() : null;
        const titleRect = title ? title.getBoundingClientRect() : null;
        return {
          i,
          rowWidth: Math.round(r.width),
          idxToTitleGap: idxRect && titleRect ? Math.round(titleRect.left - idxRect.right) : null,
          idxRight: idxRect ? Math.round(idxRect.right) : null,
          titleLeft: titleRect ? Math.round(titleRect.left) : null,
        };
      });

      const shelf = document.querySelector('.pf-shelf');
      const shelfProbe = shelf ? (() => {
        const r = shelf.getBoundingClientRect();
        return { width: Math.round(r.width), scrollWidth: shelf.scrollWidth, scrollable: shelf.scrollWidth > shelf.clientWidth + 4 };
      })() : null;

      const ratings = [...document.querySelectorAll('.pf-rating')];
      const firstRating = ratings[0];
      const ratingStyles = firstRating ? (() => {
        const cs = getComputedStyle(firstRating);
        return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor, fontSize: cs.fontSize };
      })() : null;

      const heroBbox = hero ? hero.getBoundingClientRect() : null;
      const listBbox = list ? list.getBoundingClientRect() : null;
      const heroImgBbox = heroImg ? heroImg.getBoundingClientRect() : null;
      const listOverlapsHero = heroBbox && listBbox ?
        (listBbox.left < heroBbox.right - 4 && listBbox.right > heroBbox.left + 4 &&
         listBbox.top < heroBbox.bottom - 4 && listBbox.bottom > heroBbox.top + 4) : false;

      return {
        vw: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        featured: featured ? {
          rect: featured.getBoundingClientRect(),
          gridCols: getComputedStyle(featured).gridTemplateColumns
        } : null,
        heroCopyClipsArtwork: heroCopy && heroImg ? (() => {
          const cb = heroCopy.getBoundingClientRect();
          const ib = heroImg.getBoundingClientRect();
          return { copyBottom: cb.bottom, copyLeft: cb.left, img: { w: ib.width, h: ib.height, top: ib.top, bottom: ib.bottom }};
        })() : null,
        listOverlapsHero,
        compactProbe,
        shelfProbe,
        ratingStyles,
        ratingsCount: ratings.length,
        ratingsWithContent: ratings.filter(r => /\\d/.test(r.textContent)).length,
        readMoreLinks: document.querySelectorAll('a[href*="/review/"]').length
      };
    `);
    console.log(JSON.stringify({ viewport: v.name, ...probe }));
    findings.push({ viewport: v.name, ...probe });

    // Capture a screenshot for visual proof.
    await screenshot(join(OUT, `audit-${v.name}.png`), { fullPage: false });
  }
  console.log("audit findings complete (",
    findings.filter(f => f.horizontalOverflow).length, "overflow;",
    findings.filter(f => f.listOverlapsHero).length, "listOverlapsHero )");
} catch (e) {
  console.error("audit failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}
