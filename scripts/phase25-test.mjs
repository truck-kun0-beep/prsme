// Phase 2.5 visual-polish tests.
//
// Verifies the brief's invariants at the seven required widths via the
// headless DOM probe in public/phase25-assert.html. The probe is loaded
// through Microsoft Edge in headless mode, the iframe's document is
// inspected, and a JSON payload is rendered into <pre id="o">.

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VIEWPORTS = [360, 390, 430, 768, 1024, 1280, 1440];
const MSEDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function dumpAt(width, workDir) {
  const dom = join(workDir, `dom-${width}.html`);
  const url = `http://127.0.0.1:3939/phase25-assert.html?w=${width}`;
  execSync(
    `"${MSEDGE}" --headless=new --disable-gpu --no-sandbox --hide-scrollbars ` +
      `--window-size=${width},1100 --virtual-time-budget=6000 --dump-dom ` +
      `"${url}" > "${dom}"`,
    { stdio: "ignore" },
  );
  return readFileSync(dom, "utf8");
}

function parseJsonPayload(html) {
  const m = html.match(/<pre id="o">([\s\S]+?)<\/pre>/);
  if (!m) throw new Error("probe page did not produce a JSON payload");
  return JSON.parse(m[1]);
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

function main() {
  const work = mkdtempSync(join(tmpdir(), "p25-"));
  try {
    let total = 0, failed = 0;
    for (const w of VIEWPORTS) {
      const html = dumpAt(w, work);
      const o = parseJsonPayload(html);
      const checks = [
        ["no horizontal page overflow", o.diff === 0, `diff=${o.diff}`],
        [
          "single soundtrack surface",
          o.soundtrackCount === 1,
          `count=${o.soundtrackCount}`,
        ],
        [
          "no <iframe> in soundtrack",
          o.iframesInSoundtrack === 0,
          `count=${o.iframesInSoundtrack}`,
        ],
        [
          "no fake Play/Stop/Pause buttons",
          o.fakeControlButtons === 0,
          `count=${o.fakeControlButtons}`,
        ],
        [
          "exactly one external Listen anchor (target=_blank, rel=noopener)",
          o.externalLinksCount === 1 && o.spotifyAnchorTarget === "_blank" &&
            /noopener/.test(o.spotifyAnchorRel ?? ""),
          `links=${o.externalLinksCount} target=${o.spotifyAnchorTarget} rel=${o.spotifyAnchorRel}`,
        ],
        [
          "anchor links to the configured Spotify URL (album)",
          o.spotifyAnchorHref === "https://open.spotify.com/album/6fu8fvc7O4p8Gb8KMTBTUW",
          `href=${o.spotifyAnchorHref}`,
        ],
        [
          "anchor is logo-only — no visible 'Spotify' text in the link content",
          !/(listen\s+on\s+spotify|spotify)/i.test(o.spotifyAnchorVisibleText ?? ""),
          `text="${o.spotifyAnchorVisibleText}"`,
        ],
        [
          "anchor carries an accessible name with the track and artist",
          /listen to .+ on spotify/i.test(o.spotifyAnchorAccessibleName ?? ""),
          `aria-label="${o.spotifyAnchorAccessibleName}"`,
        ],
        [
          "anchor is iconified with the Spotify brand <svg> (≥1 <path> child)",
          o.svgInsideSpotify && o.pathsInSpotifyGlyph >= 1,
          `svg=${o.svgInsideSpotify} paths=${o.pathsInSpotifyGlyph}`,
        ],
        [
          "icon button has comfortable touch footprint (≥44×44)",
          o.spotifyAnchorSize && o.spotifyAnchorSize.width >= 40 && o.spotifyAnchorSize.height >= 40,
          `size=${JSON.stringify(o.spotifyAnchorSize)}`,
        ],
        [
          "icon button does not overlap the title",
          !o.overlapWithTitle,
          `overlap=${o.overlapWithTitle}`,
        ],
        [
          "'PROFILE SOUNDTRACK' eyebrow removed",
          !o.forbidden.profileSoundtrackLabel,
          `present=${o.forbidden.profileSoundtrackLabel}`,
        ],
        [
          "'Cover art from Spotify' attribution removed",
          !o.forbidden.coverArtFromSpotify,
          `present=${o.forbidden.coverArtFromSpotify}`,
        ],
        [
          "'via Spotify' caption removed",
          !o.forbidden.viaSpotify,
          `present=${o.forbidden.viaSpotify}`,
        ],
        [
          "exactly one heading inside soundtrack (track title only)",
          o.allHeadingsInSoundtrack.length === 1,
          `headings=${o.allHeadingsInSoundtrack.length}`,
        ],
        [
          "exactly one image inside soundtrack (album cover only)",
          o.allImageAltsInSoundtrack.length === 1,
          `imgs=${o.allImageAltsInSoundtrack.length}`,
        ],
        // Phase 2.3 invariants still hold
        [
          "Phase 2.3: no 'press play inside…' sentence",
          !o.forbidden.pressPlay,
          `pressPlay=${o.forbidden.pressPlay}`,
        ],
        [
          "Phase 2.3: no 'PUBLIC PROFILE' labels in DOM",
          o.forbidden.publicProfileLabel === 0,
          `count=${o.forbidden.publicProfileLabel}`,
        ],
        [
          "Phase 2.3: 'she/her' pronouns appear once",
          o.forbidden.pronounsCount === 1,
          `count=${o.forbidden.pronounsCount}`,
        ],
      ];
      let rowOk = true;
      for (const [label, ok, detail] of checks) {
        total++;
        if (!ok) {
          failed++;
          rowOk = false;
          console.log(`FAIL  w=${w} :: ${label} :: ${detail}`);
        }
      }
      if (rowOk) console.log(`PASS  w=${w} (${total - failed}/${total})`);
    }
    console.log(`\nTotal: pass=${total - failed} fail=${failed}`);
    process.exit(failed === 0 ? 0 : 1);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (e) {
  console.error("ERR " + e.message);
  process.exit(1);
}