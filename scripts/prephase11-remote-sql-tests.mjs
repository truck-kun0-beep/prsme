/**
 * Pre-Phase 11 — run `scripts/prephase11-sql-tests.sql` against the REMOTE
 * project.
 *
 * `scripts/prephase11-sql-tests.sql` is written to be runnable in the Supabase
 * SQL editor, where every statement is its own submission. This runner uses
 * the same model against the live project, through the Management API's
 * database query endpoint.
 *
 * THE VERDICT
 *
 * Every assertion in that file goes through `prephase11_sql_test.assert()`,
 * which RAISES when the condition is not true. So a unit that contains one
 * assertion settles the question by itself:
 *
 *   - the unit returns 201 -> the assertion held;
 *   - the unit returns 400 -> the assertion failed, and the error message
 *     carries its label ("ASSERTION FAILED: <label>").
 *
 * A unit that contains no assertion is setup or teardown, and is reported as
 * such.
 *
 * THE UNITS
 *
 * A unit is one statement, or a whole `begin; … rollback;` block. The block
 * has to stay whole, because a role switch and a rollback only mean anything
 * inside a transaction, and a transaction only survives inside one
 * submission.
 *
 * THE SPLITTER
 *
 * The file is split with `scripts/localdb/sql-split.mjs` — the SAME splitter
 * the local runner uses, so the local and the remote runs cannot disagree
 * about what is being tested.
 *
 * WHY THE MANAGEMENT API
 *
 * The project's `db` host resolves to an IPv6 address only, and this machine
 * has no IPv6 route to it, so a direct Postgres session is not available
 * here. The Management API's query endpoint reaches the same database and
 * keeps the semantics these assertions depend on.
 *
 * The endpoint runs as `postgres`, which bypasses RLS. That is precisely why
 * the file's role switches matter, and why they are exercised rather than
 * assumed.
 *
 * THE ACCESS TOKEN
 *
 * Read from `SUPABASE_ACCESS_TOKEN` when it is set, otherwise from the
 * Windows Credential Manager entry the Supabase CLI itself uses. It is never
 * printed, never written to a file, and never passed as a command-line
 * argument.
 */
import { readFileSync } from "node:fs";
import { accessToken } from "./supabase-access-token.mjs";
import { splitSqlUnits, labelsIn } from "./localdb/sql-split.mjs";

const SQL_FILE = "scripts/prephase11-sql-tests.sql";
const API = "https://api.supabase.com";

const token = accessToken();
if (!token) {
  console.error(
    "No Supabase access token.\n\n" +
      "Set SUPABASE_ACCESS_TOKEN, or sign in with the Supabase CLI so the token\n" +
      "is in the Windows Credential Manager.",
  );
  process.exit(1);
}

const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";

/** The endpoint rate-limits, so submissions are spaced and retried. */
const SUBMIT_DELAY_MS = 1500;

async function submit(sql) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();

    if (res.status === 429 || /Too Many Requests/i.test(text)) {
      const wait = attempt * 5000;
      console.log(`  ..   rate limited, retrying in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    return { ok: res.ok, status: res.status, text };
  }

  return { ok: false, status: 429, text: "rate limited" };
}

const sql = readFileSync(SQL_FILE, "utf8");
const { units, blocks } = splitSqlUnits(sql);

console.log(`PRSME - Pre-Phase 11 policy assertions against ${ref}`);
console.log(`${units.length} units (${blocks} transaction blocks) from ${SQL_FILE}\n`);

const verdicts = [];
const failures = [];

for (const unit of units) {
  const preview = unit.replace(/\s+/g, " ").slice(0, 64);

  const { ok, text } = await submit(unit);
  await new Promise((resolve) => setTimeout(resolve, SUBMIT_DELAY_MS));

  if (ok) {
    const labels = labelsIn(unit, "prephase11_sql_test");
    for (const label of labels) {
      verdicts.push({ label, passed: true });
      console.log(`  ok   ${label}`);
    }
    if (labels.length === 0) console.log(`  --   ${preview}`);
    continue;
  }

  let message = text;
  try {
    message = JSON.parse(text).message ?? text;
  } catch {
    /* not JSON */
  }

  const match = message.match(/ASSERTION FAILED:\s*([^\n\r]+)/);
  const label = match
    ? match[1].trim()
    : `${preview} - ${message.replace(/\s+/g, " ").slice(0, 180)}`;

  verdicts.push({ label, passed: false });
  failures.push(label);
  console.log(`  FAIL ${label}`);
  console.log(`       ${message.replace(/\s+/g, " ").slice(0, 260)}`);
}

console.log(`\n${"=".repeat(60)}`);

const passed = verdicts.filter((v) => v.passed).length;
console.log(
  `${passed} passed, ${failures.length} failed, ${verdicts.length} assertions`,
);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
