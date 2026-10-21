/**
 * Verify the three collection layouts render correctly when chosen.
 * Plus the follower/following and icon-only social controls.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const DOC_DIR = "G:\\prsme\\docs";
mkdirSync(DOC_DIR, { recursive: true });

const { goto, setViewport, evalJs, screenshot, close } = await connect();

/* helper: set the studio draft directly via localStorage so we don't need
 * to click through the studio for every variant. */
async function setDraftCollectionsLayout(layouts) {
  // Layouts is an array parallel to the demo's collection IDs.
  const json = JSON.stringify(layouts);
  await evalJs(`
    (() => {
      const raw = localStorage.getItem('prsme:profile-draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return false;
      const layouts = ${json};
      parsed.collections = parsed.collections.map((c, i) => ({
        ...c,
        layout: layouts[i] ?? c.layout,
      }));
      localStorage.setItem('prsme:profile-draft:v1', JSON.stringify(parsed));
      return true;
    })()
  `);
}

async function setThemeAndReload(themeId) {
  await evalJs(`
    (() => {
      const raw = localStorage.getItem('prsme:profile-draft:v1');
      const parsed = raw ? JSON.parse(raw) : { appearance: {} };
      parsed.appearance = { ...(parsed.appearance || {}), theme: '${themeId}' };
      // ensure no custom accent override is bleeding in
      parsed.appearance.accentOverride = null;
      localStorage.setItem('prsme:profile-draft:v1', JSON.stringify(parsed));
    })()
  `);
}

/* ----- 1. Layout rendering — set every collection to one layout, render ---- */
async function captureLayout(layoutName) {
  await setDraftCollectionsLayout([
    layoutName, layoutName, layoutName, layoutName, layoutName,
  ]);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  await setViewport(1280, 1100);
  await new Promise((r) => setTimeout(r, 500));

  const summary = await evalJs(`
    return (() => {
      const arts = [...document.querySelectorAll('article[data-collection-layout]')];
      return arts.map(a => ({
        id: a.getAttribute('aria-labelledby'),
        layout: a.getAttribute('data-collection-layout'),
        childCount: a.querySelector(':scope > div:last-child')
          ? a.querySelectorAll(':scope > div:last-child > ul li, :scope > div:last-child .pf-poster-card, :scope > div:last-child .pf-compact-row').length
          : 0,
      }));
    })();
  `);
  await screenshot(join(DOC_DIR, `phase31-fix-layout-${layoutName}.png`), { fullPage: true });
  return summary;
}

try {
  /* Reset to demo defaults first so we have a valid draft. */
  await setViewport(1280, 1100);
  await goto(`${HOST}/studio`, { waitMs: 4000 });
  // Open and reset
  await evalJs(`
    document.querySelector('[data-testid="studio-reset-btn"]')?.click();
    document.querySelector('[data-testid="studio-reset-confirm-btn"]')?.click();
  `);
  await new Promise((r) => setTimeout(r, 1000));
  await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
  await new Promise((r) => setTimeout(r, 600));

  console.log("--- poster-grid ---");
  console.log(await captureLayout("poster-grid"));
  console.log("--- featured ---");
  console.log(await captureLayout("featured"));
  console.log("--- compact ---");
  console.log(await captureLayout("compact"));

  /* ----- 2. Follower/following and social icons ----- */
  await evalJs(`
    localStorage.removeItem('prsme:profile-draft:v1');
  `);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  const stats = await evalJs(`
    return {
      followersText: document.querySelector('[data-testid="profile-followers"]')?.textContent?.trim(),
      followingText: document.querySelector('[data-testid="profile-following"]')?.textContent ?? null,
      socialsCount: document.querySelectorAll('[data-testid="profile-socials"] a').length,
      visiblePlatformText: [...document.querySelectorAll('[data-testid="profile-socials"] a')].map(a =>
        a.textContent.trim()
      ),
      socialsAriaLabels: [...document.querySelectorAll('[data-testid="profile-socials"] a')].map(a =>
        a.getAttribute('aria-label')
      ),
    };
  `);
  console.log("Stats:", stats);

  /* ----- 3. Three themes render differently at /u/noir ----- */
  await goto(`${HOST}/studio`, { waitMs: 4000 });
  for (const themeId of ['obsidian', 'midnight', 'paper']) {
    await evalJs(`
      (() => {
        const raw = localStorage.getItem('prsme:profile-draft:v1');
        const parsed = raw ? JSON.parse(raw) : { appearance: {} };
        parsed.appearance = { ...(parsed.appearance || {}), theme: '${themeId}' };
        localStorage.setItem('prsme:profile-draft:v1', JSON.stringify(parsed));
      })()
    `);
    // refresh the iframe via the studio save
    await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
    await new Promise((r) => setTimeout(r, 600));
    await goto(`${HOST}/u/noir`, { waitMs: 2500 });
    const r = await evalJs(`
      return {
        bodyBg: getComputedStyle(document.querySelector('.profile-scope')).backgroundColor,
        accent: getComputedStyle(document.querySelector('.profile-scope')).getPropertyValue('--pf-accent').trim(),
        ratingColor: (() => {
          const r = document.querySelector('.pf-rating');
          return r ? getComputedStyle(r).color : null;
        })(),
        tagBg: (() => {
          const t = document.querySelector('.pf-tag');
          return t ? getComputedStyle(t).backgroundColor : null;
        })(),
      };
    `);
    console.log(`THEME ${themeId}:`, r);
    await screenshot(join(DOC_DIR, `phase31-fix3-profile-${themeId}.png`), { fullPage: true });
  }
} finally {
  await close();
}