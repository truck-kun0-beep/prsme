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

for (const layout of ["poster-grid", "featured", "compact"]) {
  await setLayouts([layout, layout, layout, layout, layout]);
  await goto(`${HOST}/u/noir`, { waitMs: 2500 });
  const info = await evalJs(`
    return (() => {
      // Only count VISIBLE articles (the SSR copy is display:none when overridden)
      const arts = [...document.querySelectorAll('article[data-collection-layout]')]
        .filter(a => a.getBoundingClientRect().width > 0);
      return arts.map(a => {
        const shelf = a.querySelector('.pf-shelf');
        const compact = a.querySelector('.pf-compact-row');
        const feat = a.querySelector('.pf-featured');
        const posters = a.querySelectorAll('.pf-poster-card');
        const rows = a.querySelectorAll('.pf-compact-row');
        const featHero = a.querySelector('.pf-featured-hero-frame');
        const featList = a.querySelectorAll('.pf-featured-list li');
        const posterW = posters[0] ? Math.round(posters[0].getBoundingClientRect().width) : null;
        const posterH = posters[0] ? Math.round(posters[0].getBoundingClientRect().height) : null;
        // compact row: measure gap between index and title
        let compactGap = null;
        if (compact) {
          const idx = compact.querySelector('.pf-compact-index');
          const main = compact.querySelector('.pf-compact-main');
          if (idx && main) {
            compactGap = Math.round(main.getBoundingClientRect().left - idx.getBoundingClientRect().right);
          }
        }
        return {
          id: a.getAttribute('aria-labelledby'),
          layout: a.getAttribute('data-collection-layout'),
          hasShelf: !!shelf,
          shelfScrollW: shelf ? shelf.scrollWidth : null,
          shelfClientW: shelf ? shelf.clientWidth : null,
          posterCount: posters.length,
          posterW, posterH,
          posterRatio: (posterW && posterH) ? (posterW / posterH).toFixed(3) : null,
          compactRows: rows.length,
          compactIndexGap: compactGap,
          hasFeatured: !!feat,
          featuredHero: !!featHero,
          featuredListItems: featList.length,
        };
      });
    })();
  `);
  console.log(`\n=== ${layout} ===`);
  console.table(info);
  await screenshot(`G:\\prsme\\docs\\phase31-final-layout-${layout}.png`, { fullPage: true });
}

// mobile check for poster grid: how many cards visible at 390
await setLayouts(["poster-grid", "featured", "compact", "compact", "compact"]);
await setViewport(390, 844);
await goto(`${HOST}/u/noir`, { waitMs: 2500 });
const mobileShelf = await evalJs(`
  return (() => {
    const shelf = [...document.querySelectorAll('.pf-shelf')].filter(s => s.getBoundingClientRect().width > 0)[0];
    if (!shelf) return null;
    const cards = [...shelf.querySelectorAll('.pf-poster-card')].map(c => {
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
    });
    const shelfRect = shelf.getBoundingClientRect();
    const fullyVisible = cards.filter(c => c.left >= shelfRect.left - 1 && c.right <= shelfRect.right + 1).length;
    return {
      shelfW: Math.round(shelfRect.width),
      cardW: cards[0]?.w,
      cardCount: cards.length,
      fullyVisibleAtOnce: fullyVisible,
      snapType: getComputedStyle(shelf).scrollSnapType,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })();
`);
console.log("\n=== mobile 390 poster shelf ===");
console.log(JSON.stringify(mobileShelf, null, 2));
await screenshot("G:\\prsme\\docs\\phase31-final-mobile-390.png", { fullPage: true });

await close();