/**
 * Capture all §14 screenshots for Phase 3.1 evidence.
 * Output: docs/screenshots/phase31/*.png
 */
import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase31";

await mkdir(OUT, { recursive: true });

const { goto, setViewport, evalJs, screenshot, close } = await connect();

async function shoot(name, opts = {}) {
  await new Promise((r) => setTimeout(r, opts.delay ?? 600));
  await screenshot(`${OUT}/${name}.png`, {
    fullPage: opts.fullPage ?? false,
  });
  console.log("✓", name);
}

// Helper to set the saved draft so the public profile reflects the chosen
// theme/typo/layout. We write the JSON directly into localStorage so we can
// visit /u/noir with any combination we want.
async function setDraft(patch) {
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`
    (() => {
      const raw = localStorage.getItem('prsme:profile-draft:v1');
      const current = raw ? JSON.parse(raw) : null;
      const fresh = current ?? ${await require.resolve("./fixtures.js").catch(() => "null")};
      return true;
    })();
  `);
}

async function setAppearance(themeId, typo = "instrument-serif", layout = "balanced") {
  await goto(`${HOST}/studio`, { waitMs: 3500 });
  await evalJs(`document.querySelector('[data-testid="studio-tab-appearance"]')?.click();`);
  await new Promise((r) => setTimeout(r, 250));
  await evalJs(`
    document.querySelector('[data-testid="studio-theme-${themeId}"] input')?.click();
  `);
  await new Promise((r) => setTimeout(r, 700));
  await evalJs(`
    document.querySelector('[data-testid="studio-typography-${typo}"] input')?.click();
  `);
  await new Promise((r) => setTimeout(r, 700));
  await evalJs(`
    document.querySelector('[data-testid="studio-layout-${layout}"] input')?.click();
  `);
  await new Promise((r) => setTimeout(r, 700));
  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
  await new Promise((r) => setTimeout(r, 900));
}

// ---- Studio at 390 and 1280 ----
console.log("--- Studio (controls panel) ---");
await setViewport(390, 1000);
await goto(`${HOST}/studio`, { waitMs: 4000 });
await shoot("studio-390-controls", { delay: 800 });
await evalJs(`document.querySelector('[data-testid="studio-mobile-tab-preview"]')?.click();`);
await new Promise((r) => setTimeout(r, 600));
await shoot("studio-390-preview", { delay: 1200 });

await setViewport(1280, 1000);
await goto(`${HOST}/studio`, { waitMs: 4000 });
await shoot("studio-1280-controls", { delay: 800 });
await evalJs(`document.querySelector('[data-testid="studio-preview-tab"]')?.click();`);
await new Promise((r) => setTimeout(r, 600));
await shoot("studio-1280-preview", { delay: 1200 });

// ---- Public profile: all 5 themes at 1280 ----
console.log("--- Themes ---");
const themes = [
  ["obsidian", "instrument-serif", "balanced"],
  ["violet", "instrument-serif", "balanced"],
  ["midnight", "instrument-serif", "balanced"],
  ["rose-noir", "instrument-serif", "balanced"],
  ["paper", "instrument-serif", "balanced"],
];
for (const [theme, typo, layout] of themes) {
  await setAppearance(theme, typo, layout);
  await setViewport(1280, 2200);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  await shoot(`theme-${theme}-1280`, { fullPage: true, delay: 800 });
}

// ---- Layouts ----
console.log("--- Layouts ---");
const layouts = ["balanced", "editorial", "compact"];
for (const layout of layouts) {
  await setAppearance("obsidian", "instrument-serif", layout);
  await setViewport(1280, 2400);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  await shoot(`layout-${layout}-1280`, { fullPage: true, delay: 800 });
}

// ---- Mobile -- 390 across themes ----
console.log("--- Mobile 390 ---");
for (const [theme] of themes) {
  await setAppearance(theme, "instrument-serif", "balanced");
  await setViewport(390, 2400);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  await shoot(`theme-${theme}-390`, { fullPage: true, delay: 800 });
}

// ---- Poster shelf zoomed ----
await setAppearance("obsidian", "serif", "poster");
await setViewport(1280, 900);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
await evalJs(`document.querySelector('article[data-collection-id="col-films"]')?.scrollIntoView({block: 'center'});`);
await new Promise((r) => setTimeout(r, 600));
await shoot("collection-poster-shelf-1280");

// Featured zoom
await evalJs(`document.querySelector('article[data-collection-layout="featured"]')?.scrollIntoView({block: 'center'});`).catch(() => {});
await new Promise((r) => setTimeout(r, 400));
await shoot("collection-featured-1280");

// Compact zoom
await evalJs(`document.querySelector('article[data-collection-layout="compact"]')?.scrollIntoView({block: 'center'});`).catch(() => {});
await new Promise((r) => setTimeout(r, 400));
await shoot("collection-compact-1280");

// ---- Cleanup ----
await goto(`${HOST}/studio`, { waitMs: 3500 });
await evalJs(`localStorage.removeItem('prsme:profile-draft:v1');`);

console.log("\nAll screenshots saved to", OUT);
await close();
