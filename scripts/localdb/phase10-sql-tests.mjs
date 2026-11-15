/**
 * Phase 10 — run `scripts/phase10-sql-tests.sql` against the LOCAL database.
 *
 * The SQL file is written to be runnable in the Supabase SQL editor. This
 * runner executes it unit by unit, because the file contains
 * `begin;` / `rollback;` blocks whose transaction scope has to be preserved.
 *
 * It uses the SAME splitter as the remote runner
 * (`scripts/localdb/sql-split.mjs`), so the two can never disagree about
 * where a statement ends.
 *
 * It is the same shape as `scripts/localdb/phase9-sql-tests.mjs`, which runs
 * the Phase 9 file. The two are kept apart on purpose: the Phase 9 file is a
 * committed artifact of Phase 9, and rewriting it would change what the
 * Phase 9 regression suite means.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { splitSqlUnits } from "./sql-split.mjs";

const SQL_FILE = "scripts/phase10-sql-tests.sql";
const sql = readFileSync(SQL_FILE, "utf8");

const client = new pg.Client({
  host: "127.0.0.1",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "prsme",
});
await client.connect();

/*
 * Notices are delivered as an EVENT, not in the result object.
 *
 * That matters here: the assertions that switch role and read through RLS run
 * inside `begin; … rollback;` blocks, so the row they write to the results
 * table is rolled back with the transaction. The notice is a message rather
 * than a row, so it survives — and it is emitted at the moment the assertion
 * runs, so it cannot be lost.
 */
const notices = [];
client.on("notice", (message) => {
  notices.push(message.message ?? "");
});

const { units, blocks } = splitSqlUnits(sql);
console.log(
  `running ${units.length} units (${blocks} transaction blocks) from ${SQL_FILE}\n`,
);

let executed = 0;
const failures = [];
const verdicts = [];

for (const [index, unit] of units.entries()) {
  const preview = unit.replace(/\s+/g, " ").slice(0, 70);

  try {
    const result = await client.query(unit);
    executed += 1;

    /*
     * The NOTICE is the authoritative verdict.
     */
    for (const message of notices.splice(0)) {
      const match = message.match(/PRSME_SQL_TEST\|(\w+)\|(.*)$/s);
      if (!match) continue;
      const passed = match[1] === "true";
      const label = match[2].trim();
      verdicts.push({ label, passed });
      if (!passed) failures.push(label);
    }

    // The results summary: `select label, passed, detail from … results`.
    if (
      result.rows?.length &&
      result.rows[0]?.label !== undefined &&
      result.rows[0]?.passed !== undefined
    ) {
      for (const row of result.rows) {
        console.log(`  ${row.passed ? "ok  " : "FAIL"} ${row.label}`);
        if (!row.passed && row.detail) console.log(`       ${row.detail}`);
      }
      const failedRows = result.rows.filter((r) => !r.passed);
      if (failedRows.length > 0) {
        failures.push(`${failedRows.length} assertion(s) failed`);
      }
      continue;
    }
  } catch (error) {
    failures.push(`${preview} — ${error.message}`);
    console.log(`\nFAIL at unit ${index + 1}: ${preview}`);
    console.log(`     ${error.message}`);
    console.log(`     (the file stops at the first failure, as designed)`);
    break;
  }
}

/*
 * Report every verdict collected from the notices.
 */
console.log("\nAssertions:");
for (const verdict of verdicts) {
  console.log(`  ${verdict.passed ? "ok  " : "FAIL"} ${verdict.label}`);
}

const passedCount = verdicts.filter((v) => v.passed).length;
console.log(`\n${passedCount}/${verdicts.length} assertions passed`);

await client.end();

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n${executed} units executed, no assertion failed`);
