/**
 * Phase 6.1 — fetch the external binaries the local stack needs.
 *
 * Two of them are not in npm:
 *
 *   PostgREST   the REST gateway the application talks to
 *   libpq       the Postgres client library PostgREST links against
 *
 * The Postgres SERVER itself comes from the `embedded-postgres` npm package,
 * which ships the Windows binaries in `@embedded-postgres/windows-x64`. This
 * script copies the handful of DLLs PostgREST needs out of that package, so
 * there is one Postgres on the machine rather than two.
 *
 * Everything it writes lands in `.tmp-tools/`, which is git-ignored.
 *
 * Usage:
 *   node scripts/localdb/fetch-tools.mjs
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TOOLS_DIR = join(ROOT, ".tmp-tools");
const POSTGREST_DIR = join(TOOLS_DIR, "postgrest");
const EXTRACT_DIR = join(TOOLS_DIR, "postgrest-extract");
const POSTGREST_BIN = join(POSTGREST_DIR, "postgrest.exe");

const POSTGREST_VERSION = "16.5";
const POSTGREST_URL =
  `https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}` +
  `/postgrest-v${POSTGREST_VERSION}-windows-x86-64.zip`;

/*
 * The DLLs PostgREST needs beside its executable.
 *
 * `postgrest.exe` imports `LIBPQ.dll`, and libpq in turn needs the OpenSSL
 * runtime and the ICU/libintl runtime. The Windows zip ships only the
 * executable, so without these the process fails to start with
 * STATUS_DLL_NOT_FOUND — an error that names nothing helpful.
 *
 * All four come from the embedded Postgres package, which already ships a
 * matching Postgres 18 runtime.
 */
const REQUIRED_DLLS = [
  "libpq.dll",
  "libcrypto-3-x64.dll",
  "libssl-3-x64.dll",
  "libintl-9.dll",
];

const EMBEDDED_BIN = join(
  ROOT,
  "node_modules",
  "@embedded-postgres",
  "windows-x64",
  "native",
  "bin",
);

/** Run a command and fail loudly if it does not succeed. */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

/** Download the PostgREST release archive. */
async function downloadArchive() {
  const url = `${POSTGREST_URL}`;

  console.log(`fetching PostgREST v${POSTGREST_VERSION}`);
  console.log(`  ${url}`);

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `could not download PostgREST: ${response.status} ${response.statusText}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(TOOLS_DIR, { recursive: true });
  const archive = join(TOOLS_DIR, `postgrest-v${POSTGREST_VERSION}.zip`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(archive, bytes);

  console.log(`  ${(bytes.length / 1_000_000).toFixed(1)} MB`);
  return archive;
}

/** Unpack the archive into a scratch directory. */
function extractArchive(archive) {
  rmSync(EXTRACT_DIR, { recursive: true, force: true });
  mkdirSync(EXTRACT_DIR, { recursive: true });

  /*
   * `tar` on Windows 10+ is bsdtar, which reads a zip. Using it avoids
   * pulling an unzip dependency into the project for one archive.
   */
  run("tar", ["-xf", archive, "-C", EXTRACT_DIR]);

  const extracted = join(EXTRACT_DIR, "postgrest.exe");
  if (!existsSync(extracted)) {
    throw new Error(`the archive did not contain ${extracted}`);
  }
  console.log("  unpacked postgrest.exe");
  return extracted;
}

/**
 * Copy one file, tolerating a destination that is already there.
 *
 * PostgREST may be running, which locks its executable and the DLLs beside
 * it. A refresh must not fail because of that — the existing copy is already
 * the file we want, so a locked destination is left alone.
 */
function copyReplacing(source, destination) {
  if (existsSync(destination)) {
    try {
      copyFileSync(source, destination);
      return "replaced";
    } catch (error) {
      if (error && error.code === "EPERM" || error.code === "EBUSY") {
        return "kept the running copy";
      }
      throw error;
    }
  }
  copyFileSync(source, destination);
  return "copied";
}

/** Copy the DLLs PostgREST links against out of the embedded Postgres package. */
function copyRuntimeDlls() {
  if (!existsSync(EMBEDDED_BIN)) {
    throw new Error(
      `the embedded Postgres binaries are missing at ${EMBEDDED_BIN}. ` +
        "Run `npm install` first.",
    );
  }

  for (const name of REQUIRED_DLLS) {
    const source = join(EMBEDDED_BIN, name);
    if (!existsSync(source)) {
      throw new Error(`${name} is missing from the embedded Postgres package`);
    }
    const outcome = copyReplacing(source, join(POSTGREST_DIR, name));
    console.log(`  ${outcome} ${name}`);
  }
}

/** Is the toolchain already in place? */
export function toolsAreReady() {
  if (!existsSync(POSTGREST_BIN)) return false;
  return REQUIRED_DLLS.every((name) =>
    existsSync(join(POSTGREST_DIR, name)),
  );
}

async function main() {
  if (toolsAreReady()) {
    console.log("the local toolchain is already in place");
    return;
  }

  const archive = await downloadArchive();
  const executable = extractArchive(archive);

  mkdirSync(POSTGREST_DIR, { recursive: true });
  console.log(`  ${copyReplacing(executable, POSTGREST_BIN)} postgrest.exe`);
  copyRuntimeDlls();

  rmSync(EXTRACT_DIR, { recursive: true, force: true });

  console.log(`\nthe local toolchain is ready at ${POSTGREST_DIR}`);
}

if (process.argv[1] && process.argv[1].endsWith("fetch-tools.mjs")) {
  await main();
}
