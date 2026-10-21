// Phase 4.1 — inject a long-title soundtrack into the saved draft, render
// it on the public profile, prove the album wraps, then capture screenshots.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase41";
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { goto, setViewport, evalJs, screenshot, close } = await connect();

const LONG = {
  trackTitle: "Symphony No. 9 in D Minor, Op. 125 — IV. Ode an die Freude",
  trackArtist: "Wiener Philharmoniker, Karl Böhm, Gundula Janowitz, Agnes Wiener, Brigitte Fassbaender",
  albumTitle: "Beethoven Symphonies Nos. 9 & 10 (Remastered 2011 Complete Edition) — the Great Traditional Performances Volume Three Disc 4 of 7",
};

try {
  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3500 });

  // Build a profile draft from scratch with the long soundtrack pre-configured.
  const seeded = await evalJs(`
    const KEY = "prsme:profile-draft:v1";
    const draft = {
      version: 1,
      identity: { displayName: "Noir Aldridge", bio: "", location: "", pronouns: "", avatarPalette: "violet" },
      tags: [],
      socials: [],
      appearance: { theme: "obsidian", typography: "serif", layout: "editorial", background: "solid", density: "comfortable" },
      visibility: "public",
      sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
      sectionVisibility: { soundtrack: true, collections: true, activity: true, clicks: true },
      soundtrack: {
        provider: "spotify",
        trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
        trackTitle: ${JSON.stringify(LONG.trackTitle)},
        trackArtist: ${JSON.stringify(LONG.trackArtist)},
        albumTitle: ${JSON.stringify(LONG.albumTitle)},
        coverUrl: "https://i.scdn.co/image/ab67616d0000b2734f61e186facbb486f79e9fd9",
        coverSource: "Spotify",
        palette: "violet",
        externalUrl: "https://open.spotify.com/album/6fu8fvc7O4p8Gb8KMTBTUW",
      },
      collections: [],
    };
    localStorage.setItem(KEY, JSON.stringify(draft));
    return "seeded";
  `);
  console.log("seeded:", seeded);

  for (const w of [360, 390, 430, 768, 1024, 1280, 1440]) {
    await setViewport(w, w === 1280 ? 1000 : 900);
    await goto(`${HOST}/u/noir`, { waitMs: 3500 });
    await evalJs(`
      for (let i = 0; i < 60; i++) {
        if (document.body.dataset.profileOverride === "active") break;
        await new Promise(r => setTimeout(r, 80));
      }
      return true;
    `);
    await wait(900);

    const probe = await evalJs(`
      const cards = [...document.querySelectorAll('[data-testid="profile-soundtrack"]')];
      const live = cards.find((c) => c.getBoundingClientRect().width > 0) || cards[cards.length - 1];
      const albumEl = live ? live.querySelector('[data-testid="profile-soundtrack-album"]') : null;
      const titleEl = live ? live.querySelector('#profile-soundtrack-title') : null;
      const bodyText = live ? live.innerText : "";
      const cardRect = live ? live.getBoundingClientRect() : null;
      return {
        viewport: window.innerWidth,
        cardWidth: cardRect ? Math.round(cardRect.width) : null,
        cardHeight: cardRect ? Math.round(cardRect.height) : null,
        titleText: titleEl ? titleEl.innerText.slice(0, 80) : null,
        artistText: live ? (live.querySelectorAll('p')[0]?.innerText || null) : null,
        albumText: albumEl ? albumEl.innerText.slice(0, 80) : null,
        albumWrapped: albumEl ? albumEl.scrollWidth > albumEl.clientWidth + 2 : null,
        albumHeight: albumEl ? Math.round(albumEl.getBoundingClientRect().height) : null,
        hasAppleSuffix: /apple artwork/i.test(bodyText),
        hasArtistLine: !!albumEl,
        threeLines: live ? [...live.querySelectorAll('h3, p')].length : null,
        spotifyLink: live ? !!live.querySelector('a[href*="open.spotify.com"]') : null,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    `);
    console.log("vw", w, JSON.stringify(probe));
    await screenshot(join(OUT, `soundtrack-long-${w}.png`), { fullPage: false });
    console.log("  saved", `soundtrack-long-${w}.png`);
  }
} catch (e) {
  console.error("failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}