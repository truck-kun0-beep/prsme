/**
 * Serve the production build with the environment the way `next start` reads
 * it: from `.env.local` in the project root.
 *
 * `serve-prod.mjs` serves the app against the LOCAL stack, which is what the
 * Phase 6–10 database suites need. The Phase 5–7 suites, on the other hand,
 * talk to the REAL project, so the app has to be served against the real
 * project's environment while they run.
 */
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PRSME_APP_PORT ?? 3100);
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [NEXT_BIN, "start", "--port", String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production" },
  detached: true,
  stdio: [
    "ignore",
    openSync(join(ROOT, ".tmp-localdb", "app-remote.out.txt"), "a"),
    openSync(join(ROOT, ".tmp-localdb", "app-remote.err.txt"), "a"),
  ],
  windowsHide: true,
});
child.unref();

console.log(`[app] starting next start on port ${PORT}`);

let ready = false;

for (let attempt = 0; attempt < 120; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/discover`, {
      signal: AbortSignal.timeout(5000),
    });
    await res.text();
    if (res.status > 0) {
      console.log(`[app] ready on http://127.0.0.1:${PORT}`);
      ready = true;
      break;
    }
  } catch {
    // Not up yet.
  }
}

process.exitCode = ready ? 0 : 1;
