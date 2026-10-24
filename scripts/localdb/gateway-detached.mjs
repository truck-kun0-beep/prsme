/**
 * Phase 6.1 — the detached entry point for the local gateway.
 *
 * Run by `cli.mjs` as a detached child so the gateway outlives the script
 * that started it.
 */

import { startGateway } from "./gateway.mjs";

const server = await startGateway();
console.log("[gateway] listening");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
