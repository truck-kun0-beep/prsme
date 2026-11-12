/**
 * Bring the PRSME Supabase project back online.
 *
 * WHY THIS EXISTS
 *
 * A Supabase project that has been idle for a while is PAUSED by the
 * platform. A paused project:
 *
 *   - loses its DNS records, so `<ref>.supabase.co` returns NXDOMAIN;
 *   - has an empty API-key list;
 *   - refuses every database connection.
 *
 * The symptom is a set of failures that look like application faults but
 * are not: `TypeError: fetch failed`, `PGRST205 — Could not find the table in
 * the schema cache`, `no tenant identifier provided`. The Phase 6.3 run hit
 * exactly this, and so did this Phase 7 run, so the repair is worth a script
 * rather than a remembered incantation.
 *
 * WHAT IT DOES
 *
 *   1. reads the project's status from the Management API;
 *   2. asks for a restore if it is not ACTIVE;
 *   3. waits for the services to come back;
 *   4. verifies the health endpoint and the database's migration state.
 *
 * The access token is read from `SUPABASE_ACCESS_TOKEN` or from the
 * Windows Credential Manager entry the Supabase CLI writes. It is never
 * printed.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { requireAccessToken } from "./supabase-access-token.mjs";

const API = "https://api.supabase.com";
const REF = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";
const TOKEN = requireAccessToken();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function projectStatus() {
  const { body } = await api(`/v1/projects/${REF}`);
  return typeof body === "object" ? body.status : null;
}

async function health() {
  const { body } = await api(
    `/v1/projects/${REF}/health?services=db,auth,storage,rest&refresh=true`,
  );
  return body;
}

console.log(`PRSME — project restore for ${REF}\n`);

const before = await projectStatus();
console.log(`status: ${before}`);

if (before === "ACTIVE_HEALTHY" || before === "ACTIVE") {
  console.log("\nThe project is already active — nothing to restore.");
} else {
  const restore = await api(`/v1/projects/${REF}/restore`, { method: "POST" });
  console.log(
    `restore request -> ${restore.status}${restore.ok ? "" : ` ${JSON.stringify(restore.body)}`}`,
  );

  console.log("\nwaiting for the services to come back…");
  let status = before;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    await wait(15000);
    status = await projectStatus();
    console.log(`  attempt ${attempt}: ${status}`);
    if (status === "ACTIVE_HEALTHY") break;
  }

  if (status !== "ACTIVE_HEALTHY") {
    console.error(`\nThe project is still ${status}.`);
    process.exitCode = 1;
  }
}

console.log("\nhealth:");
const services = await health();
for (const service of Array.isArray(services) ? services : []) {
  console.log(`  ${service.name.padEnd(10)} ${service.status}`);
}

/*
 * The migrations are the thing a restore could have disturbed, so they are
 * checked rather than assumed.
 */
const cli = join(
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

if (existsSync(cli)) {
  console.log("\nmigration state:");
  await new Promise((resolve) => {
    const child = spawn(cli, ["migration", "list", "--linked"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", resolve);
  });
} else {
  console.log(
    "\n(the Supabase CLI was not found, so the migration state was not checked)",
  );
}
