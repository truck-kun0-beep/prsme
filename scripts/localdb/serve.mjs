/**
 * Phase 6.1 — start the application against the local database.
 *
 * Reads the environment the local stack generated and runs `next dev` with
 * it, so the app talks to the local Postgres instead of degrading to the
 * no-database demo.
 *
 * Usage:
 *   node scripts/localdb/serve.mjs
 *
 * The environment is read from `.tmp-localdb/env.local`, which is
 * git-ignored and never contains a production credential.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");
const ENV_FILE = join(LOCAL_DIR, "env.local");
const PORT = Number(process.env.PRSME_APP_PORT ?? 3100);

/** Parse a `.env` style file into a plain object. */
function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return values;
}

const env = {
  ...process.env,
  ...parseEnvFile(ENV_FILE),
  PORT: String(PORT),
};

mkdirSync(LOCAL_DIR, { recursive: true });

/*
 * On Windows, spawning a `.cmd` shim detached fails with EINVAL, so the
 * Next.js CLI is invoked through node directly — the same entry point
 * `npm run dev` uses — and the child's output goes to files rather than
 * pipes.
 */
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

const child = spawn(
  process.execPath,
  [NEXT_BIN, "dev", "--port", String(PORT)],
  {
    cwd: ROOT,
    env,
    detached: true,
    stdio: [
      "ignore",
      openSync(join(LOCAL_DIR, "app.out.txt"), "a"),
      openSync(join(LOCAL_DIR, "app.err.txt"), "a"),
    ],
    windowsHide: true,
  },
);
child.unref();

console.log(`[app] starting next dev on port ${PORT}`);

/*
 * The readiness probe carries an `AbortSignal.timeout`, so the process must
 * not be torn down while those timers are pending — `process.exit()` here
 * trips a libuv assertion on Windows. Setting `exitCode` and letting the
 * loop drain is the same outcome with no assertion.
 */
let ready = false;

for (let attempt = 0; attempt < 180; attempt += 1) {
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

if (ready) {
  process.exitCode = 0;
  await new Promise((resolve) => setTimeout(resolve, 50));
} else {
  console.log("[app] the server did not answer in time");
  process.exitCode = 1;
}
