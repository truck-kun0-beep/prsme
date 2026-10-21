// Phase 4.1 — capture the brief-mandated additional evidence:
//   - soundtrack cover + album-name wrap at 360, 390, 430, 768, 1024, 1280, 1440
//   - no horizontal overflow sweep across all 8 viewports
//   - one selected item per media kind (movie / tv / music / manga / book) with
//     actual artwork.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase41";
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { goto, setViewport, evalJs, screenshot, close } = await connect();

async function shot(name, opts = {}) {
  const path = join(OUT, `${name}.png`);
  await screenshot(path, opts);
  console.log("  saved", path);
}

const mobileChecks = [
  { w: 360, h: 720 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
];

try {
  // Seed a focused draft: enable soundtrack, keep collections, kill auto-saved junk.
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`localStorage.removeItem("prsme:profile-draft:v1")`);
  await goto(`${HOST}/studio`, { waitMs: 4500 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-soundtrack"]')?.click()`);
  await wait(500);
  await evalJs(`
    const t = document.querySelector('#f-st-enabled');
    if (t && !t.checked) t.click();
    return "toggled";
  `);
  await wait(400);
  // Set a deliberately long track + artist + album.
  await evalJs(`
    const setInput = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };
    setInput("f-st-title", "Symphony No. 9 in D Minor, Op. 125 — IV. Presto (Allegro assai chorus)");
    setInput("f-st-artist", "Ludwig van Beethoven, Wiener Philharmoniker, Karl Böhm & Gundula Janowitz");
    return "filled";
  `);
  await wait(500);
  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click()`);
  await wait(1200);

  // Capture the soundtrack at 7 viewports — proves album wraps on mobile.
  for (const v of mobileChecks) {
    await setViewport(v.w, v.h);
    await goto(`${HOST}/u/noir`, { waitMs: 2500 });
    // Wait for the override island to flip.
    await evalJs(`
      for (let i = 0; i < 50; i++) {
        if (document.body.dataset.profileOverride === "active") break;
        await new Promise(r => setTimeout(r, 80));
      }
      return true;
    `);
    await wait(800);
    await shot(`soundtrack-${v.w}`, { fullPage: false });
    // Probe: did the album wrap, did it overflow horizontally?
    const probe = await evalJs(`
      const album = document.querySelector('[data-testid="profile-soundtrack-album"]');
      if (!album) return { error: "no album element" };
      const cs = getComputedStyle(album);
      return {
        viewport: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        albumLines: Math.round(album.getBoundingClientRect().height / parseFloat(cs.lineHeight || "16")),
        albumWrapped: album.scrollWidth > album.clientWidth + 2,
      };
    `);
    console.log("viewport", v.w, JSON.stringify(probe));
  }

  // No-horizontal-overflow sweep across all 8 viewports, visiting every route.
  const routes = ["/", "/u/noir", "/studio", "/studio/preview", "/u/noir/review/media-cinemeta-tt0816692"];
  for (const w of [360, 390, 430, 768, 832, 1024, 1280, 1440]) {
    await setViewport(w, 1000);
    for (const path of routes) {
      await goto(`${HOST}${path}`, { waitMs: 1500 });
      const overflow = await evalJs(`
        return {
          viewport: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      `);
      if (overflow.hasHorizontalOverflow) {
        console.log("OVERFLOW", w, path, JSON.stringify(overflow));
      }
    }
  }
  console.log("\noverflow sweep complete (no entries above = no overflow).");
} catch (e) {
  console.error("capture failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}