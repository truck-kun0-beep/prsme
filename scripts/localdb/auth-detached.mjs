/**
 * Phase 6.1 — the detached entry point for the local auth service.
 *
 * Run by `cli.mjs` as a detached child so the service outlives the script
 * that started it.
 */

import { startAuthServer } from "./auth-server.mjs";

const server = await startAuthServer();
console.log("[localauth] listening");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
