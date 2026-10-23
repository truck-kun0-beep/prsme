// scripts/build-retry.mjs — run `next build`, retrying on the one failure mode
// this environment actually hits: a stalled socket while next/font downloads
// Google Fonts files.
//
// Why this exists, precisely:
//
// Next 15.1.6's `fetchFontFile` only attaches its 3s AbortSignal in dev
// (`signal: isDev ? controller.signal : undefined`). In a production build a
// reset connection therefore has no deadline at all, and the build hangs
// indefinitely rather than failing. The network itself is fine — the identical
// URL fetches in ~300ms through Next's own bundled node-fetch — so the correct
// response is to retry, and each successful fetch lands in .next/cache, so
// retries make strictly forward progress.
//
// Two deadlines, because both failure modes are real:
//
//   - per attempt, so a silent hang is bounded and the loop actually iterates;
//   - give up after MAX_ATTEMPTS rather than looping forever.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_ATTEMPTS = Number(process.env.BUILD_ATTEMPTS ?? 6);

/*
 * Per-attempt wall-clock ceiling. Without this, a stalled socket is not an
 * error we can observe — it is simply silence — so the framework never
 * surfaces it and "retry" never gets a chance to run.
 */
const ATTEMPT_TIMEOUT_MS = Number(process.env.BUILD_ATTEMPT_TIMEOUT_MS ?? 300000);

/**
 * Kill a build and every worker it spawned.
 *
 * `next build` forks a jest-worker child that shares the parent's console; on
 * Windows a plain kill leaves that worker alive holding handles inside .next,
 * which then corrupts the next attempt. taskkill /T takes down the tree.
 */
function killTree(child) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { stdio: "ignore" });
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build"],
      { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );

    // The route table is the point at which compilation is genuinely finished;
    // anything after it is the page-data pass and the closing write-up.
    let sawRouteTable = false;
    let settled = false;
    let killAfterRouteTable = null;
    let deadline = null;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(killAfterRouteTable);
      clearTimeout(deadline);
      resolve({ code, sawRouteTable });
    };

    // Echo the child's output so the log looks exactly as npm would print it.
    const onData = (chunk) => {
      process.stdout.write(chunk);
      if (sawRouteTable) return;
      if (/Route \(app\)|Route \(pages\)/.test(chunk.toString())) {
        sawRouteTable = true;
        killAfterRouteTable = setTimeout(() => killTree(child), 20000);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => finish(code));

    deadline = setTimeout(() => {
      process.stdout.write(
        `\nattempt hit its ${ATTEMPT_TIMEOUT_MS / 1000}s ceiling — killing\n`,
      );
      killTree(child);
      finish(null);
    }, ATTEMPT_TIMEOUT_MS);
  });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  process.stdout.write(`\n=== build attempt ${attempt}/${MAX_ATTEMPTS} ===\n`);
  const { code, sawRouteTable } = await runBuild();
  if (sawRouteTable) {
    process.stdout.write("\nBUILD OK (route table emitted)\n");
    process.exit(0);
  }
  process.stdout.write(`\nattempt ${attempt} failed (exit ${code})\n`);
}

process.stdout.write(`\nBUILD FAILED after ${MAX_ATTEMPTS} attempts\n`);
process.exit(1);