/**
 * Phase 6.1 — serve the PRODUCTION build against the local database.
 *
 * The dev server and the production build share `.next`, so a build run while
 * `next dev` is serving corrupts the dev server's chunks and produces
 * MODULE_NOT_FOUND errors that look like application bugs. This phase serves
 * the production build, which is what the brief asks to be verified anyway.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");
const ENV_FILE = join(LOCAL_DIR, "env.local");
const PORT = Number(process.env.PRSME_APP_PORT ?? 3100);

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
  NODE_ENV: "production",
};

mkdirSync(LOCAL_DIR, { recursive: true });

const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [NEXT_BIN, "start", "--port", String(PORT)], {
  cwd: ROOT,
  env,
  detached: true,
  stdio: [
    "ignore",
    openSync(join(LOCAL_DIR, "app-prod.out.txt"), "a"),
    openSync(join(LOCAL_DIR, "app-prod.err.txt"), "a"),
  ],
  windowsHide: true,
});
child.unref();

console.log(`[app] starting next start on port ${PORT}`);

/*
 * The readiness probe carries an `AbortSignal.timeout`, so the process must
 * not be torn down while those timers are pending — `process.exit()` here
 * trips a libuv assertion on Windows. Setting `exitCode` and letting the
 * loop drain is the same outcome with no assertion.
 */
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

if (ready) {
  process.exitCode = 0;
  await new Promise((resolve) => setTimeout(resolve, 50));
} else {
  console.log("[app] the server did not answer in time");
  process.exitCode = 1;
}