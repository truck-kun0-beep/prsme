/**
 * Phase 6.1 — start a headless browser with the DevTools Protocol open.
 *
 * The project already drives Edge over CDP (scripts/cdp.mjs), so this uses
 * the same browser and the same port the existing suites expect.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");
const PORT = Number(process.env.PRSME_CDP_PORT ?? 9334);
const PROFILE = join(LOCAL_DIR, "edge-profile");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!existsSync(EDGE)) {
  console.error(`Edge not found at ${EDGE}`);
  process.exit(1);
}

mkdirSync(LOCAL_DIR, { recursive: true });

const child = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  {
    cwd: ROOT,
    detached: true,
    stdio: [
      "ignore",
      openSync(join(LOCAL_DIR, "edge.out.txt"), "a"),
      openSync(join(LOCAL_DIR, "edge.err.txt"), "a"),
    ],
    windowsHide: true,
  },
);
child.unref();

for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    const body = await res.json();
    console.log(`[browser] ready on ${PORT} — ${body.Browser}`);
    process.exit(0);
  } catch {
    // Not up yet.
  }
}

console.error("[browser] the browser did not open its debugging port in time");
process.exit(1);
