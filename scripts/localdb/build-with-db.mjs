/**
 * Phase 6.1 — build the app against the LOCAL database.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the bundle at BUILD time, not at
 * run time. A production build made without them therefore has `undefined`
 * where the Supabase URL and key should be — and the app renders its "connect
 * a Supabase project" state while the database is sitting there, fully
 * populated, four ports away.
 *
 * This runs `next build` with the local stack's environment loaded, which is
 * what makes `npm run db:test:flow` and `npm run db:test:browser` able to
 * drive the real application.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ENV_FILE = join(ROOT, ".tmp-localdb", "env.local");

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

if (!existsSync(ENV_FILE)) {
  console.error(
    "the local stack has not written its environment file yet.\n" +
      "Run `npm run db:start` first.",
  );
  process.exit(1);
}

const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [NEXT_BIN, "build"], {
  cwd: ROOT,
  env: { ...process.env, ...parseEnvFile(ENV_FILE) },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
