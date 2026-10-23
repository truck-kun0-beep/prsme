// Custom Links must inherit the profile's real theme + typography, and the
// Apple Music glyph must render in every theme.
import { connect } from "./cdp.mjs";
import { mkdir } from "node:fs/promises";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const OUT = "docs/screenshots/phase45";
await mkdir(OUT, { recursive: true });

const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => {
  if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l} :: ${JSON.stringify(d)}`); }
};

const draft = (theme, typography) => ({
  version: 1,
  identity: { username: "noir", displayName: "Noir Aldridge", bio: "Filmmaker.",
    location: "Lisbon", pronouns: "they/them", avatarPalette: "mono" },
  tags: [], socials: [], avatarDataUrl: null, soundtrack: null,
  collections: [],
  clicks: [{ id: "k1", title: "Lisbon at night", place: "Lisbon", ratio: "wide",
    palette: "iris", mode: "image",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Lisbon_at_night_%2824301569479%29.jpg/640px-Lisbon_at_night_%2824301569479%29.jpg",
    altText: "Lisbon lit at night.", sourceUrl: "https://example.com/night" }],
  customLinks: [
    { id: "lnk-1", label: "Portfolio", url: "https://example.com/portfolio" },
    { id: "lnk-2", label: "Bookings & collaborations", url: "https://example.com/bookings" },
  ],
  appearance: { theme, typography, layout: "poster", background: "solid", accentOverride: null },
  visibility: "public",
  sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
  sectionVisibility: { soundtrack: false, collections: false, activity: false, clicks: true },
});

const seen = {};
/*
 * Typography ids must be real `TypographyId`s (`serif | modern | mono-led |
 * contemporary | soft-editorial | manrope | archive | playful`). An unknown id
 * such as "mono" or "sans" is silently coerced to the default by `readDraft`,
 * so the page would render the serif demo and every comparison would pass
 * against the wrong baseline.
 */
for (const [theme, typography] of [
  ["obsidian", "serif"], ["paper", "modern"], ["midnight", "mono-led"], ["rose-noir", "manrope"],
]) {
  await browser.setViewport(1280, 1000);
  await browser.seed(draft(theme, typography));
  await browser.goto(`${HOST}/u/noir`, { waitMs: 5000 });
  await wait(1800);

  const r = await browser.evalJs(`
    const b = document.querySelector('[data-testid="custom-link"]');
    if (!b) return null;
    const s = getComputedStyle(b);
    return {
      font: s.fontFamily,
      color: s.color,
      bg: s.backgroundColor,
      border: s.borderTopColor,
      radius: s.borderTopLeftRadius,
      centered: s.textAlign === 'center',
    };
  `);
  seen[theme] = r;
  ok(`theme "${theme}" renders the button`, Boolean(r), r);
  ok(`theme "${theme}": label centered`, r && r.centered, r);
  ok(`theme "${theme}": distinct button background`, r && r.bg && r.bg !== "rgba(0, 0, 0, 0)", r && r.bg);
}

/* Typography must actually change the rendered font. */
ok("typography changes the button font",
  seen.obsidian.font !== seen.paper.font && seen.obsidian.font !== seen.midnight.font,
  { obsidian: seen.obsidian.font, paper: seen.paper.font, midnight: seen.midnight.font });

/* Themes must actually change the colours — not one hardcoded lavender. */
const colors = Object.values(seen).map((v) => v.bg);
ok("theme changes the button background",
  new Set(colors).size === colors.length, colors);
const borders = Object.values(seen).map((v) => v.border);
ok("theme changes the button border", new Set(borders).size === borders.length, borders);

/* Apple Music glyph across every theme. */
for (const theme of ["obsidian", "paper", "midnight", "rose-noir"]) {
  const d = draft(theme, "serif");
  d.soundtrack = {
    trackTitle: "Prelude for Piano No. 11",
    trackArtist: "Eduard Abramyan",
    albumTitle: "Music of the Spheres",
    trackUrl: "https://music.apple.com/us/album/x/1?i=2",
    palette: "mono",
    caption: "Profile soundtrack",
  };
  d.sectionVisibility.soundtrack = true;
  await browser.seed(d);
  await browser.goto(`${HOST}/u/noir`, { waitMs: 6000 });
  await browser.evalJs(`
    const t = Date.now();
    while (Date.now() - t < 8000) {
      if (document.body.dataset.profileOverride === 'active' &&
          document.querySelector('[data-testid="profile-soundtrack"]')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 500));
    return true;
  `, { once: true });

  const g = await browser.evalJs(`
    const a = document.querySelector('[data-testid="profile-soundtrack-link"]');
    if (!a) return null;
    const svg = a.querySelector('svg');
    const sr = svg.getBoundingClientRect();
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const el of svg.querySelectorAll('path, ellipse, circle')) {
      const b = el.getBoundingClientRect();
      minX=Math.min(minX,b.left); minY=Math.min(minY,b.top);
      maxX=Math.max(maxX,b.right); maxY=Math.max(maxY,b.bottom);
    }
    return {
      provider: a.getAttribute('data-provider'),
      href: a.getAttribute('href'),
      aria: a.getAttribute('aria-label'),
      title: a.getAttribute('title'),
      clipped: minX < sr.left-0.5 || minY < sr.top-0.5 || maxX > sr.right+0.5 || maxY > sr.bottom+0.5,
      shapes: svg.querySelectorAll('path, ellipse, circle').length,
      // The card must not carry provider/attribution suffixes.
      cardText: document.querySelector('[data-testid="profile-soundtrack"]').innerText.replace(/\\s+/g,' ').trim(),
    };
  `);
  ok(`soundtrack "${theme}": glyph renders uncut`, g && !g.clipped && g.shapes > 0, g);
  ok(`soundtrack "${theme}": icon matches the Apple destination`,
    g && g.provider === "apple" && g.href.startsWith("https://music.apple.com/"), g && { p: g.provider, h: g.href });
  ok(`soundtrack "${theme}": accessible name present`,
    g && /Apple Music/.test(g.aria || "") && Boolean(g.title), g && g.aria);
  ok(`soundtrack "${theme}": no provider suffix in the card text`,
    g && !/Apple artwork|via Apple Music/i.test(g.cardText), g && g.cardText);
}

console.log(`\n--- ${pass} pass, ${fail} fail ---`);
await browser.close();
process.exitCode = fail ? 1 : 0;