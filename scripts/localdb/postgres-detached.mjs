/**
 * Phase 6.1 — the detached entry point for the local Postgres cluster.
 *
 * WHY THIS IS A SEPARATE PROCESS
 *
 * `embedded-postgres` starts `postgres.exe` as a CHILD of the Node process
 * that asked for it, and registers an exit hook that stops the cluster when
 * that process exits. So a cluster started by a script that then exits is
 * gone by the time the next script runs.
 *
 * The local stack has to outlive the script that started it — the auth shim,
 * the gateway and PostgREST all do. So the cluster gets its own long-lived
 * process too, and `cli.mjs` starts it the same detached way.
 *
 * The cluster's own log goes to `.tmp-localdb/postgres.out.txt`.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR, PG_PORT, PG_USER, PG_PASSWORD } from "./harness.mjs";

const ROOT = process.cwd();
const LOCAL_DIR = join(ROOT, ".tmp-localdb");

const { default: EmbeddedPostgres } = await import("embedded-postgres");

mkdirSync(LOCAL_DIR, { recursive: true });

const instance = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASSWORD,
  persistent: true,
  onLog: (message) => {
    process.stdout.write(message);
  },
  onError: (error) => {
    process.stderr.write(`${error}\n`);
  },
});

try {
  // `initialise` is only safe on an empty data directory, so it runs once.
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
    process.stdout.write("[localdb] initialising a fresh cluster\n");
    await instance.initialise();
  }

  await instance.start();
  process.stdout.write(`[localdb] postgres is up on ${PG_PORT}\n`);
} catch (error) {
  process.stderr.write(`[localdb] postgres failed to start: ${error}\n`);
  process.exit(1);
}

// Keep the process alive. The cluster is the reason this process exists.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    instance.stop().finally(() => process.exit(0));
  });
}

await new Promise(() => {});
