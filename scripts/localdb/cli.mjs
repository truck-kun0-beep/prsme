/**
 * Phase 6.1 — bring the whole local stack up.
 *
 *   node scripts/localdb/cli.mjs start [--fresh]
 *   node scripts/localdb/cli.mjs stop [--purge]
 *   node scripts/localdb/cli.mjs status
 *   node scripts/localdb/cli.mjs env
 *
 * The stack is three processes:
 *
 *   PostgreSQL 18   the real database server
 *   PostgREST 16.5  the real REST gateway
 *   the auth shim   a GoTrue-compatible HTTP service (GoTrue ships no
 *                   Windows binary, and there is no Docker or WSL here)
 *
 * The auth shim issues real HS256 JWTs signed with the secret PostgREST
 * trusts, so the database boundary is genuinely exercised.
 */

import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startCluster,
  stopCluster,
  stopByPort,
  clusterIsUp,
  recreateDatabase,
  applyMigrations,
  PG_PORT,
  REST_PORT,
  PG_DATABASE,
  ANON_KEY,
} from "./harness.mjs";
import {
  startPostgrest,
  restIsUp,
  reloadSchemaCache,
  writePostgrestConfig,
} from "./postgrest.mjs";
import { AUTH_PORT } from "./auth-server.mjs";
import { GATEWAY_PORT } from "./gateway.mjs";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");

export const STACK = {
  pgPort: PG_PORT,
  restPort: REST_PORT,
  authPort: AUTH_PORT,
  gatewayPort: GATEWAY_PORT,
  restUrl: `http://127.0.0.1:${REST_PORT}`,
  authUrl: `http://127.0.0.1:${AUTH_PORT}/auth/v1`,
  gatewayUrl: `http://127.0.0.1:${GATEWAY_PORT}`,
};

export function log(message) {
  console.log(`[stack] ${message}`);
}

/** Is the auth shim answering? */
export async function authIsUp() {
  try {
    const res = await fetch(`${STACK.authUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

/** Is the gateway answering? */
export async function gatewayIsUp() {
  try {
    const res = await fetch(`${STACK.gatewayUrl}/`, {
      signal: AbortSignal.timeout(3000),
    });
    // Read the body so the socket is released promptly.
    await res.text();
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * Start the gateway as a detached child process.
 *
 * It has to be a separate process rather than an in-process listener so that
 * it survives the exit of whichever script started it — the same way the
 * database and PostgREST do.
 */
export async function startGatewayDetached() {
  if (await gatewayIsUp()) return;

  mkdirSync(LOCAL_DIR, { recursive: true });

  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts", "localdb", "gateway-detached.mjs")],
    {
      cwd: ROOT,
      detached: true,
      stdio: [
        "ignore",
        openSync(join(LOCAL_DIR, "gateway.out.txt"), "a"),
        openSync(join(LOCAL_DIR, "gateway.err.txt"), "a"),
      ],
      windowsHide: true,
      env: process.env,
    },
  );
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await gatewayIsUp()) return;
  }

  throw new Error("the local gateway did not start listening in time");
}

/**
 * Start the auth shim as a detached child process.
 *
 * It has to be a separate process rather than an in-process listener so that
 * it survives the exit of whichever script started it — the same way the
 * database and PostgREST do.
 */
export async function startAuthDetached() {
  if (await authIsUp()) return;

  mkdirSync(LOCAL_DIR, { recursive: true });

  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts", "localdb", "auth-detached.mjs")],
    {
      cwd: ROOT,
      detached: true,
      stdio: [
        "ignore",
        openSync(join(LOCAL_DIR, "auth.out.txt"), "a"),
        openSync(join(LOCAL_DIR, "auth.err.txt"), "a"),
      ],
      windowsHide: true,
      env: process.env,
    },
  );
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await authIsUp()) return;
  }

  throw new Error("the local auth service did not start listening in time");
}

/** Bring everything up. */
export async function startAll({ fresh = false } = {}) {
  /*
   * The cluster starts FIRST.
   *
   * Recreating the database and applying the migration chain both need a live
   * connection, so starting them before the server is up fails with
   * ECONNREFUSED on a machine where the cluster is not already running. The
   * order is: server, then a clean database, then the schema.
   */
  await startCluster();

  if (fresh) {
    log("recreating the database");
    await recreateDatabase();
    const results = await applyMigrations();
    const failed = results.find((r) => !r.ok);
    if (failed) {
      throw new Error(`migration ${failed.file} failed: ${failed.error}`);
    }
    log(`applied ${results.length} migration files to a clean database`);
  }

  writePostgrestConfig();
  await startPostgrest();

  /*
   * PostgREST caches the schema in memory. Recreating the database replaces
   * every table, so the cache has to be reloaded — otherwise every query
   * fails with "Could not find the table … in the schema cache", which reads
   * like a broken migration rather than a stale cache.
   */
  if (fresh) {
    await reloadSchemaCache();
  }

  await startAuthDetached();
  await startGatewayDetached();

  log(`postgres   127.0.0.1:${PG_PORT}  db=${PG_DATABASE}`);
  log(`postgrest  ${STACK.restUrl}`);
  log(`auth       ${STACK.authUrl}`);
  log(`gateway    ${STACK.gatewayUrl}  <- NEXT_PUBLIC_SUPABASE_URL`);
}

/** Report what is running. */
export async function status() {
  log(`postgrest: ${(await restIsUp()) ? "up" : "down"}`);
  log(`auth:      ${(await authIsUp()) ? "up" : "down"}`);
  log(`gateway:   ${(await gatewayIsUp()) ? "up" : "down"}`);
  log(`postgres:  ${(await clusterIsUp()) ? "up" : "down"}`);
}

/**
 * Stop every service in the stack.
 *
 * The services are detached, so each is stopped by the port it holds. The
 * database is stopped last, because PostgREST and the auth shim are still
 * connected to it while they go down.
 */
export async function stopStack({ purge = false } = {}) {
  await stopByPort(REST_PORT);
  await stopByPort(AUTH_PORT);
  await stopByPort(GATEWAY_PORT);
  await stopCluster(purge);
}

/**
 * Write the environment file the application reads.
 *
 * It points the app at the local stack. Nothing here is a production
 * credential, and nothing here grants access to anything remote.
 */
export function writeEnvFile() {
  const contents = [
    "# Phase 6.1 — LOCAL development database.",
    "# Generated by scripts/localdb/cli.mjs. Points at the local Postgres +",
    "# PostgREST + auth shim on this machine. Not production credentials.",
    `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}`,
    "",
  ].join("\n");

  mkdirSync(LOCAL_DIR, { recursive: true });
  const path = join(LOCAL_DIR, "env.local");
  writeFileSync(path, contents, "utf8");
  return path;
}

/* -------------------------------------------------------------------------- */
/*                                    CLI                                     */
/* -------------------------------------------------------------------------- */

const isMain = process.argv[1] && process.argv[1].endsWith("cli.mjs");

/*
 * Exit without calling `process.exit()`.
 *
 * The readiness probes are `fetch` calls carrying an `AbortSignal.timeout`,
 * and Node's Windows event loop asserts if the process is torn down while
 * those timers are still pending — `process.exit()` after a fetch is what
 * trips it. Setting `exitCode` and letting the loop drain on its own is the
 * same outcome with no assertion.
 */
function finish(code = 0) {
  process.exitCode = code;
}

if (isMain) {
  const command = process.argv[2] ?? "start";
  const fresh = process.argv.includes("--fresh");

  if (command === "start") {
    await startAll({ fresh });
    log("stack is up");
    finish();
  } else if (command === "stop") {
    await stopStack({ purge: process.argv.includes("--purge") });
    log("stopped");
    finish();
  } else if (command === "status") {
    await status();
    finish();
  } else if (command === "env") {
    log(writeEnvFile());
    finish();
  } else {
    log(`unknown command ${command}`);
    finish(1);
  }
}
