/**
 * Phase 6.1 — local database harness.
 *
 * Starts a real PostgreSQL server (the `embedded-postgres` package ships the
 * actual `postgres.exe`), applies the Supabase bootstrap, then applies the
 * project's REAL migration chain in filename order.
 *
 * Nothing here is a mock. The migrations are the committed files, unmodified.
 * The RLS policies under test are the project's own.
 *
 * The database is local only. This harness never links to, or pushes to, a
 * remote project.
 */

import { readFileSync, readdirSync, existsSync, rmSync, openSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

/** Where the local cluster lives. Inside the repo, git-ignored. */
export const DATA_DIR = join(ROOT, ".tmp-localdb", "data");
export const PG_PORT = Number(process.env.PRSME_LOCAL_PG_PORT ?? 54322);
export const PG_USER = "postgres";
export const PG_PASSWORD = "postgres";
export const PG_DATABASE = "prsme";

/**
 * The Postgres binaries the `embedded-postgres` package ships.
 *
 * `pg_ctl` is the tool Postgres ships for starting and stopping a cluster by
 * its data directory, which is how the detached cluster is stopped.
 */
const PG_BIN_DIR = join(
  ROOT,
  "node_modules",
  "@embedded-postgres",
  "windows-x64",
  "native",
  "bin",
);

/** The local PostgREST endpoint. */
export const REST_PORT = Number(process.env.PRSME_LOCAL_REST_PORT ?? 54321);

/** The local gateway origin — the one URL the application is configured with. */
export const GATEWAY_PORT = Number(process.env.PRSME_LOCAL_GATEWAY_PORT ?? 54324);
export const REST_URL = `http://127.0.0.1:${GATEWAY_PORT}`;

/**
 * The local "publishable key".
 *
 * On a real Supabase project this is an opaque string that Kong turns into
 * an anonymous JWT before PostgREST sees it. Here the key IS that JWT: a
 * real HS256 token signed with the secret PostgREST trusts, so PostgREST
 * verifies it and switches to the `anon` role itself.
 *
 * The value is built in `gateway.mjs`, which owns the signing secret.
 */
export const ANON_KEY = (await import("./gateway.mjs")).ANON_JWT;

export function log(message) {
  console.log(`[localdb] ${message}`);
}

/**
 * The committed migration files, in filename order.
 *
 * This is the chain the brief asks to be applied to a clean database.
 */
export function migrationFiles() {
  const dir = join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(dir, name));
}

/** The Supabase-equivalent bootstrap that precedes the project's own chain. */
export function bootstrapFile() {
  return join(HERE, "00-bootstrap.sql");
}

/** A fresh client against the local cluster, as the superuser. */
export function adminClient(database = PG_DATABASE) {
  return new pg.Client({
    host: "127.0.0.1",
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database,
  });
}

/**
 * Is the local cluster already listening?
 *
 * The cluster outlives the script that started it, so a second invocation
 * must not try to start it again.
 */
export async function clusterIsUp() {
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: "postgres",
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Start the local cluster, if it is not already running.
 *
 * The cluster runs in its own detached process (`postgres-detached.mjs`),
 * because `embedded-postgres` stops the cluster when the process that
 * started it exits — and the stack has to outlive the script that starts it.
 */
export async function startCluster() {
  if (await clusterIsUp()) {
    log(`postgres is already running on port ${PG_PORT}`);
    return;
  }

  const { spawn } = await import("node:child_process");

  const child = spawn(
    process.execPath,
    [join(HERE, "postgres-detached.mjs")],
    {
      cwd: ROOT,
      detached: true,
      stdio: [
        "ignore",
        openSync(join(ROOT, ".tmp-localdb", "postgres.out.txt"), "a"),
        openSync(join(ROOT, ".tmp-localdb", "postgres.err.txt"), "a"),
      ],
      windowsHide: true,
      env: process.env,
    },
  );
  child.unref();

  // Wait for the cluster to accept connections.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await clusterIsUp()) {
      log(`postgres is running on port ${PG_PORT}`);
      return;
    }
  }

  throw new Error("the local postgres cluster did not start listening in time");
}

/**
 * Stop the cluster and (optionally) delete its data.
 *
 * The cluster runs detached, so it cannot be stopped through the
 * `embedded-postgres` instance that spawned it. The data directory's
 * `postmaster.pid` names the process, which is what `pg_ctl` — the tool
 * Postgres ships for exactly this — stops.
 */
export async function stopCluster(deleteData = false) {
  const { execFileSync } = await import("node:child_process");

  if (existsSync(join(DATA_DIR, "PG_VERSION"))) {
    try {
      execFileSync(
        join(PG_BIN_DIR, "pg_ctl.exe"),
        ["-D", DATA_DIR, "-m", "fast", "stop"],
        { stdio: "ignore" },
      );
    } catch {
      // A cluster that is not running is not an error for a teardown path.
    }
  }

  if (deleteData) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

/**
 * Stop whatever is listening on a local port.
 *
 * The stack's services are detached, so they cannot be stopped through the
 * handle that spawned them. The port identifies the process, which is what
 * `Get-NetTCPConnection` answers.
 *
 * Returns the pids it stopped.
 */
export async function stopByPort(port) {
  const { execFileSync } = await import("node:child_process");

  let output = "";
  try {
    output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen ` +
          `-ErrorAction SilentlyContinue).OwningProcess`,
      ],
      { encoding: "utf8" },
    );
  } catch {
    return [];
  }

  const pids = [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+$/.test(line)),
    ),
  ];

  for (const pid of pids) {
    try {
      process.kill(Number(pid));
    } catch {
      // A service that already exited is not an error for a teardown path.
    }
  }

  return pids;
}

/**
 * Drop and recreate the application database.
 *
 * This is what makes "apply the migration chain to a CLEAN database" mean
 * something: every run starts from nothing, so a migration that depends on
 * state left by an earlier run would fail loudly instead of passing by
 * accident.
 */
export async function recreateDatabase() {
  const maintenance = new pg.Client({
    host: "127.0.0.1",
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: "postgres",
  });

  await maintenance.connect();
  await maintenance.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
      where datname = $1 and pid <> pg_backend_pid()`,
    [PG_DATABASE],
  );
  await maintenance.query(`drop database if exists "${PG_DATABASE}"`);
  await maintenance.query(`create database "${PG_DATABASE}"`);
  await maintenance.end();
}

/**
 * Apply the bootstrap and then the project's migration chain, in order.
 *
 * Returns the per-file outcome so a failure names the file that failed.
 */
export async function applyMigrations() {
  const results = [];

  const bootstrap = new pg.Client({
    host: "127.0.0.1",
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
  });

  await bootstrap.connect();
  await bootstrap.query(readFileSync(bootstrapFile(), "utf8"));
  await bootstrap.end();
  results.push({ file: "00-bootstrap.sql", ok: true });

  for (const file of migrationFiles()) {
    const client = adminClient();
    await client.connect();
    try {
      await client.query(readFileSync(file, "utf8"));
      results.push({ file: file.split(/[\\/]/).pop(), ok: true });
    } catch (error) {
      results.push({
        file: file.split(/[\\/]/).pop(),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      await client.end();
      return results;
    }
    await client.end();
  }

  return results;
}
