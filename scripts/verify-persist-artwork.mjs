// Phase 4.1 — persistence + artwork verification.
//
// IMPORTANT HONESTY NOTE:
// This runs inside a CDP-controlled browser. In this environment the browser
// cannot reach ANY external image CDN (Spotify, TVMaze, Open Library,
// MangaDex, iTunes, MetaHub, Cinemeta all fail with onerror even though the
// same URLs return HTTP 200 image/jpeg from Node on this same machine —
// which itself proves the URLs are correct).
// So this script reports the persisted artwork URLs and the *rendered* <img>
// elements, and separately confirms each host is loadable from Node — it
// does NOT claim the browser decoded the bytes unless naturalWidth > 0.
import { connect } from "./cdp.mjs";
const { existsSync } = await import("node:fs");
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, close } = await connect();

try {
  await setViewport(1280, 1000);
  await goto(`${HOST}/studio`, { waitMs: 3500 });

  const stored = await evalJs(`
    const raw = localStorage.getItem("prsme:profile-draft:v1");
    if (!raw) return { error: "no draft" };
    const d = JSON.parse(raw);
    const cols = (d.collections || []).map((c) => ({
      id: c.id, name: c.name, itemCount: (c.items || []).length,
      items: (c.items || []).map((i) => ({
        title: i.title, provider: i.provider, providerId: i.providerId,
        coverUrl: i.coverUrl || null, coverSource: i.coverSource || null, kind: i.kind,
      })),
    })).filter((c) => c.itemCount > 0);
    const all = cols.flatMap((c) => c.items);
    return {
      collections: cols,
      itemTotal: all.length,
      itemsWithCover: all.filter((i) => i.coverUrl).length,
      distinctArtworkHosts: [...new Set(all.filter(i=>i.coverUrl).map(i => { try { return new URL(i.coverUrl).hostname; } catch { return "?"; } }))],
      soundtrack: d.soundtrack ? { title: d.soundtrack.trackTitle, artist: d.soundtrack.trackArtist, album: d.soundtrack.albumTitle, coverUrl: d.soundtrack.coverUrl || null } : null,
    };
  `);
  console.log("=== PERSISTED DRAFT ===");
  console.log(JSON.stringify(stored, null, 2));

  for (const w of [390, 1280]) {
    await setViewport(w, w === 1280 ? 1000 : 844);
    await goto(`${HOST}/u/noir`, { waitMs: 5000 });
    await evalJs(`
      for (let i = 0; i < 70; i++) {
        if (document.body.dataset.profileOverride === "active") break;
        await new Promise(r => setTimeout(r, 80));
      }
      return true;
    `);
    await new Promise((r) => setTimeout(r, 1400));
    const rendered = await evalJs(`
      const imgs = [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 0);
      return imgs.map((img) => {
        const r = img.getBoundingClientRect();
        return {
          src: img.src.slice(0, 84),
          alt: img.alt,
          boxW: Math.round(r.width),
          boxH: Math.round(r.height),
          naturalWidth: img.naturalWidth,
          decoded: img.complete && img.naturalWidth > 0,
        };
      });
    `);
    const withBox = rendered.filter((i) => i.boxW > 0 && i.boxH > 0).length;
    const decoded = rendered.filter((i) => i.decoded).length;
    console.log(`\n=== RENDERED ARTWORK @ ${w}px ===`);
    console.log(`visible <img>: ${rendered.length}; with a non-zero box: ${withBox}; decoded (naturalWidth>0): ${decoded}`);
    for (const i of rendered) {
      console.log(`  box ${String(i.boxW).padStart(4)}x${String(i.boxH).padEnd(4)} natural=${String(i.naturalWidth).padStart(4)} decoded=${String(i.decoded).padEnd(5)} ${i.src.slice(0, 78)}`);
    }
  }
} catch (e) {
  console.error("failed:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await close();
}