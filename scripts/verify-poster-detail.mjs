import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, screenshot, close } = await connect();

async function setLayouts(all) {
  const json = JSON.stringify(all);
  await evalJs(`
    (() => {
      const raw = localStorage.getItem('prsme:profile-draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return false;
      const layouts = ${json};
      parsed.collections = parsed.collections.map((c, i) => ({ ...c, layout: layouts[i] ?? c.layout }));
      localStorage.setItem('prsme:profile-draft:v1', JSON.stringify(parsed));
      return true;
    })()
  `);
}

await setViewport(1280, 1100);
await goto(`${HOST}/studio`, { waitMs: 4000 });
await evalJs(`
  document.querySelector('[data-testid="studio-reset-btn"]')?.click();
  document.querySelector('[data-testid="studio-reset-confirm-btn"]')?.click();
`);
await new Promise(r => setTimeout(r, 900));
await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
await new Promise(r => setTimeout(r, 700));

/* poster-grid on desktop */
await setLayouts(["poster-grid", "compact", "compact", "compact", "compact"]);
await setViewport(1280, 1100);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
const desk = await evalJs(`
  return (() => {
    const frame = [...document.querySelectorAll('.pf-poster-frame')].filter(f => f.getBoundingClientRect().width > 0)[0];
    if (!frame) return { err: 'no frame' };
    const r = frame.getBoundingClientRect();
    const card = frame.closest('.pf-poster-card');
    const cr = card.getBoundingClientRect();
    return {
      frameW: Math.round(r.width),
      frameH: Math.round(r.height),
      frameRatio: (r.width / r.height).toFixed(4),
      cardW: Math.round(cr.width),
      cardH: Math.round(cr.height),
      aspectRule: getComputedStyle(frame).aspectRatio,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })();
`);
console.log("DESKTOP poster frame:", desk);
await screenshot("G:\\prsme\\docs\\phase31-poster-desktop.png", { fullPage: true });

/* mobile 390 */
await setViewport(390, 844);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
const mob = await evalJs(`
  return (() => {
    const shelf = [...document.querySelectorAll('.pf-shelf')].filter(s => s.getBoundingClientRect().width > 0)[0];
    if (!shelf) return { err: 'no shelf' };
    const sr = shelf.getBoundingClientRect();
    const cards = [...shelf.querySelectorAll('.pf-poster-card')].map(c => {
      const r = c.getBoundingClientRect();
      const fr = c.querySelector('.pf-poster-frame').getBoundingClientRect();
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), frameW: Math.round(fr.width), frameH: Math.round(fr.height) };
    });
    const fully = cards.filter(c => c.left >= sr.left - 2 && c.right <= sr.right + 2).length;
    return {
      shelfW: Math.round(sr.width),
      shelfScrollW: shelf.scrollWidth,
      cardW: cards[0]?.w,
      frameW: cards[0]?.frameW,
      frameH: cards[0]?.frameH,
      frameRatio: cards[0] ? (cards[0].frameW / cards[0].frameH).toFixed(4) : null,
      cardCount: cards.length,
      fullyVisibleAtOnce: fully,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })();
`);
console.log("MOBILE 390 poster frame:", mob);
await screenshot("G:\\prsme\\docs\\phase31-poster-mobile-390.png", { fullPage: true });

/* featured mobile */
await setLayouts(["featured", "featured", "compact", "compact", "compact"]);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
const featMob = await evalJs(`
  return (() => {
    const f = [...document.querySelectorAll('.pf-featured')].filter(x => x.getBoundingClientRect().width > 0)[0];
    if (!f) return { err: 'none' };
    const fr = f.getBoundingClientRect();
    const hero = f.querySelector('.pf-featured-hero-frame').getBoundingClientRect();
    const copy = f.querySelector('.pf-featured-copy').getBoundingClientRect();
    return {
      featuredW: Math.round(fr.width),
      heroW: Math.round(hero.width),
      heroH: Math.round(hero.height),
      copyW: Math.round(copy.width),
      copyBottom: Math.round(copy.bottom),
      heroBottom: Math.round(hero.bottom),
      copyInsideHero: copy.bottom <= hero.bottom + 1,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })();
`);
console.log("MOBILE featured:", featMob);
await screenshot("G:\\prsme\\docs\\phase31-featured-mobile-390.png", { fullPage: true });

/* compact at 390 */
await setLayouts(["compact", "compact", "compact", "compact", "compact"]);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
const compMob = await evalJs(`
  return (() => {
    const row = [...document.querySelectorAll('.pf-compact-row')].filter(x => x.getBoundingClientRect().width > 0)[0];
    if (!row) return { err: 'none' };
    const idx = row.querySelector('.pf-compact-index').getBoundingClientRect();
    const main = row.querySelector('.pf-compact-main').getBoundingClientRect();
    const side = row.querySelector('.pf-compact-side').getBoundingClientRect();
    return {
      rowW: Math.round(row.getBoundingClientRect().width),
      indexW: Math.round(idx.width),
      gapIndexToTitle: Math.round(main.left - idx.right),
      sideRight: Math.round(side.right),
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })();
`);
console.log("MOBILE compact row:", compMob);
await screenshot("G:\\prsme\\docs\\phase31-compact-mobile-390.png", { fullPage: true });

await close();