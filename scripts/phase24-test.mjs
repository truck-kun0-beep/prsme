// Phase 2.4 tests.
//
// These tests assert the structural guarantees the brief asks for at the
// DOM level. They reach into the rendered HTML via a small headless probe
// served by `npx next start`. The probe in public/phase24-assert.html
// inspects the in-iframe document, evaluates a single JSON result, and
// writes it into <pre id="o">. This script fetches the page, walks each
// viewports dump, and asserts the invariants:
//
//   - exactly ONE soundtrack surface per page (no duplicate card),
//   - zero <iframe> inside the soundtrack (no inline Spotify player),
//   - zero fake play/pause/stop buttons inside the soundtrack,
//   - exactly ONE primary external Listen link, target=_blank,
//   - exactly ONE heading and ONE <img> inside the soundtrack (no duplicate
//     title or artwork),
//   - no horizontal page overflow at the eight required widths.

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VIEWPORTS = [360, 390, 430, 768, 832, 1024, 1280, 1440];
const MSEDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function getServerStatusCode(url) {
  const out = execSync(
    `powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing -Uri '${url}' -TimeoutSec 8).StatusCode"`,
    { encoding: "utf8" },
  ).trim();
  return parseInt(out.split(/\r?\n/).pop(), 10);
}

function dumpAt(width, workDir) {
  const dom = join(workDir, `dom-${width}.html`);
  const url = `http://127.0.0.1:3939/phase24-assert.html?w=${width}`;
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
  const health = getServerStatusCode("http://127.0.0.1:3939/u/noir");
  assert(health === 200, `server not reachable (status=${health})`);

  const work = mkdtempSync(join(tmpdir(), "p24-"));
  try {
    let total = 0, failed = 0;
    for (const w of VIEWPORTS) {
      const html = dumpAt(w, work);
      const o = parseJsonPayload(html);
      const checks = [
        ["no page overflow", o.diff === 0, `diff=${o.diff}`],
        [
          "exactly one soundtrack surface",
          o.soundtrackCount === 1,
          `soundtrackCount=${o.soundtrackCount}`,
        ],
        [
          "no iframe inside soundtrack",
          o.iframesInSoundtrack === 0,
          `iframesInSoundtrack=${o.iframesInSoundtrack}`,
        ],
        [
          "no fake play/pause/stop buttons",
          o.fakeControlButtons === 0,
          `fakeControlButtons=${o.fakeControlButtons}`,
        ],
        [
          "exactly one primary external listen link",
          o.externalLinksCount === 1 &&
            /^https:\/\/open\.spotify\.com\//.test(o.externalLinkHref ?? ""),
          `externalLinks=${o.externalLinksCount} href=${o.externalLinkHref}`,
        ],
        [
          "one set of track details (one heading, one image)",
          o.allHeadingsInSoundtrack.length === 1 &&
            o.allImageAltsInSoundtrack.length === 1,
          `headings=${o.allHeadingsInSoundtrack.length} imgs=${o.allImageAltsInSoundtrack.length}`,
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
      if (rowOk) console.log(`PASS  w=${w}`);
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