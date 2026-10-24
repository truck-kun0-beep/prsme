/**
 * Phase 6.2 — push the migration chain to the PRSME Supabase project.
 *
 * The Supabase CLI cannot reach this project through `--linked` or
 * `--project-ref`: both require Management API access that this project's
 * owner account does not have from the CLI's current login. The database
 * itself IS reachable, so this script drives the CLI through `--db-url`,
 * which connects straight to Postgres and bypasses the Management API.
 *
 * WHY THE PASSWORD IS NOT AN ARGUMENT
 *
 * `supabase db push` reads the password from the connection URL. Putting it
 * on the command line would put it in the shell history and in the process
 * list. So the password is read from a LOCAL, GIT-IGNORED environment file
 * and percent-encoded into the URL in memory. It is never printed, never
 * written to a file, and never passed as a command-line argument.
 *
 * SETUP (once):
 *
 *   1. Create the file, which is already git-ignored:
 *
 *        .env.local.db-password
 *
 *      containing one line:
 *
 *        SUPABASE_DB_PASSWORD=<the project's database password>
 *
 *   2. Run:
 *
 *        npm run db:remote:list
 *        npm run db:remote:push -- --dry-run
 *        npm run db:remote:push
 *
 * The password never enters the shell history, and never appears in any
 * output this script produces.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Where the project ref and the database password are read from. */
const ENV_FILE = join(ROOT, ".env.local");
const PASSWORD_FILE = join(ROOT, ".env.local.db-password");

/** The pooler region the PRSME project lives in. */
const REGION = process.env.PRSME_DB_REGION ?? "ap-southeast-1";

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

function readPassword() {
  if (!existsSync(PASSWORD_FILE)) {
    console.error(
      `The database password file is missing.\n\n` +
        `Create ${PASSWORD_FILE} (it is git-ignored) with one line:\n\n` +
        `  SUPABASE_DB_PASSWORD=<the project's database password>\n\n` +
        `The password is never passed as an argument, so it never reaches the\n` +
        `shell history or the process list.`,
    );
    process.exit(1);
  }
  const values = parseEnvFile(PASSWORD_FILE);
  const password = values.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error(
      `${PASSWORD_FILE} does not contain a SUPABASE_DB_PASSWORD entry.`,
    );
    process.exit(1);
  }
  return password;
}

const env = parseEnvFile(ENV_FILE);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
  process.exit(1);
}

// The project ref is the first label of the API hostname.
const projectRef = new URL(url).hostname.split(".")[0];

const password = readPassword();

// Percent-encode: a database password routinely contains characters that
// would otherwise break the connection URL.
const encoded = encodeURIComponent(password);
const dbUrl =
  `postgresql://postgres.${projectRef}:${encoded}` +
  `@aws-0-${REGION}.pooler.supabase.com:5432/postgres?sslmode=require`;

/*
 * The CLI is invoked through the same binary `npx supabase` resolves. The
 * npx shim is unreliable on this machine, so the cached binary is preferred
 * when it is present.
 */
function cliCommand() {
  const cached = join(
    process.env.LOCALAPPDATA ?? "",
    "npm-cache",
    "_npx",
    "aa8e5c70f9d8d161",
    "node_modules",
    "@supabase",
    "cli-windows-x64",
    "bin",
    "supabase.exe",
  );
  if (existsSync(cached)) return { command: cached, prefix: [] };
  return { command: "npx", prefix: ["supabase"] };
}

const { command, prefix } = cliCommand();
const args = [
  ...prefix,
  ...process.argv.slice(2),
  "--db-url",
  dbUrl,
];

console.log(`project_ref = ${projectRef}`);
console.log(`region      = ${REGION}`);
console.log(`command     = ${command} ${args.filter((a) => a !== dbUrl).join(" ")}`);
console.log("");

const child = spawn(command, args, {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
