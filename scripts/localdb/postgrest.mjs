/**
 * Phase 6.1 — PostgREST process management.
 *
 * PostgREST is the REST gateway the application talks to. It is the real
 * binary (v16.5), configured to trust the local auth shim's JWT secret, so
 * a token the app sends is verified at the database boundary exactly as it
 * would be against a real Supabase project.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PG_PORT, REST_PORT, ANON_KEY } from "./harness.mjs";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");
const POSTGREST_BIN = join(ROOT, ".tmp-tools", "postgrest", "postgrest.exe");
const POSTGREST_CONF = join(LOCAL_DIR, "postgrest.conf");

export const JWT_SECRET =
  process.env.PRSME_LOCAL_JWT_SECRET
  ?? "prsme-phase6-local-development-jwt-secret-32chars";

/** PostgREST's configuration, in the HOCON it expects. */
export function writePostgrestConfig() {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(
    POSTGREST_CONF,
    [
      `db-uri = "postgres://authenticator:postgres@127.0.0.1:${PG_PORT}/prsme"`,
      /*
       * `auth` must be in the schema list.
       *
       * `media_reviews.user_id` and `profiles.user_id` both reference
       * `auth.users.id`. PostgREST can only detect that as an EMBED relationship
       * — the `profiles!inner(...)` join the review queries use — if the
       * referenced table is in its schema cache. With `auth` excluded, PostgREST
       * sees three unrelated tables and every embed fails with "Could not find a
       * relationship ... in the schema cache".
       *
       * A real Supabase project has `auth` exposed for exactly this reason.
       */
      'db-schemas = "public, auth"',
      'db-anon-role = "anon"',
      "db-pool = 10",
      `jwt-secret = "${JWT_SECRET}"`,
      `server-port = ${REST_PORT}`,
      'server-host = "127.0.0.1"',
      'log-level = "error"',
      "",
    ].join("\n"),
    "utf8",
  );
  return POSTGREST_CONF;
}

/** Is the REST gateway answering? */
export async function restIsUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${REST_PORT}/`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(3000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * Tell PostgREST to reload its schema cache.
 *
 * PostgREST caches the database's schema in memory, and a `NOTIFY` on the
 * `pgrst` channel is how it learns the schema changed. Recreating the
 * database replaces every table, so the cache has to be reloaded or every
 * query fails with "Could not find the table … in the schema cache".
 */
export async function reloadSchemaCache() {
  const { default: pg } = await import("pg");
  const { PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE } = await import(
    "./harness.mjs"
  );

  const client = new pg.Client({
    host: "127.0.0.1",
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
  });

  await client.connect();
  await client.query("notify pgrst, 'reload schema'");
  await client.end();
}

/** Start PostgREST as a detached child and wait until it answers. */
export async function startPostgrest() {
  if (await restIsUp()) return;

  if (!existsSync(POSTGREST_BIN)) {
    throw new Error(
      `PostgREST binary not found at ${POSTGREST_BIN}. ` +
        "Run scripts/localdb/fetch-tools.mjs first.",
    );
  }

  const conf = writePostgrestConfig();
  mkdirSync(LOCAL_DIR, { recursive: true });

  const child = spawn(POSTGREST_BIN, [conf], {
    cwd: ROOT,
    detached: true,
    stdio: [
      "ignore",
      openSync(join(LOCAL_DIR, "postgrest.out.txt"), "a"),
      openSync(join(LOCAL_DIR, "postgrest.err.txt"), "a"),
    ],
    windowsHide: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await restIsUp()) return;
  }

  throw new Error("PostgREST did not start listening in time");
}
