/**
 * Run a project script with the local database's environment loaded.
 *
 * The Phase 5 and Phase 6 suites skip their live sections unless
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set.
 * This loads them from the environment file the local stack generated, so
 * the live sections actually run.
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

const script = process.argv[2];
if (!script) {
  console.error("usage: node scripts/localdb/with-db.mjs <script> [args...]");
  process.exit(1);
}

/*
 * The exit is the child's code, and the process is NOT torn down with
 * `process.exit()`: the child inherits the environment, and the pending
 * handles that a `fetch` leaves behind would trip Node's Windows event-loop
 * assertion if the parent were killed mid-flight.
 */
const child = spawn(process.execPath, [script, ...process.argv.slice(3)], {
  cwd: ROOT,
  env: { ...process.env, ...parseEnvFile(ENV_FILE) },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
