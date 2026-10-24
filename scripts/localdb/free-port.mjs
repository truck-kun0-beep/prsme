/*
 * Phase 6.1 — free the port the application server uses.
 *
 * The dev server and the production server share a port, and a dev server
 * left running serves a stale build — which produced MODULE_NOT_FOUND errors
 * that looked like application bugs but were really the two servers fighting
 * over `.next`.
 */
import { execSync } from "node:child_process";

const port = process.argv[2] ?? "3100";

function powershell(script) {
  return execSync(`powershell -NoProfile -Command "${script}"`, {
    encoding: "utf8",
  });
}

const listeners = powershell(
  `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`,
);

const pids = [
  ...new Set(
    listeners
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line)),
  ),
];

if (pids.length === 0) {
  console.log(`nothing is listening on ${port}`);
  process.exit(0);
}

for (const pid of pids) {
  console.log(`stopping pid ${pid} (holds ${port})`);
  try {
    powershell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
  } catch (error) {
    console.log(`  could not stop pid ${pid}: ${error.message}`);
  }
}

// Give the socket a moment to be released.
await new Promise((resolve) => setTimeout(resolve, 1500));

const after = powershell(
  `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`,
);
console.log(
  after.trim() === ""
    ? `port ${port} is free`
    : `port ${port} is STILL held by: ${after.trim()}`,
);