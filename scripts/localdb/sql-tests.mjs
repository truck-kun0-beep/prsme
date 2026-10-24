/**
 * Phase 6.1 — run `scripts/phase6-sql-tests.sql` against the local database.
 *
 * The SQL file is written to be runnable in the Supabase SQL editor. This
 * runner executes it statement by statement, because the file contains
 * `begin;` / `rollback;` blocks whose transaction scope has to be preserved.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const SQL_FILE = "scripts/phase6-sql-tests.sql";
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

/*
 * Split on the statements the file is written in.
 *
 * The file uses `$$ ... $$` for function bodies, so a naive semicolon split
 * would cut those in half. The splitter tracks whether it is inside a dollar
 * quote and only treats a semicolon as a terminator when it is not.
 */
function splitStatements(source) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    /*
     * A dollar-quoted body opens and closes with the SAME delimiter, so one
     * branch handles both: the pair toggles the state and is copied across
     * WHOLE.
     *
     * Appending only one `$` would turn `as $$ … $$` into `as $ … $`, which
     * is not valid SQL — the splitter would hand Postgres a statement that
     * could never run, and the failure would look like a problem in the test
     * file rather than in the splitter.
     */
    if (char === "$" && source.slice(i, i + 2) === "$$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i += 1;
      continue;
    }

    if (!inDollarQuote && char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

const statements = splitStatements(sql);
console.log(`running ${statements.length} statements from ${SQL_FILE}\n`);

let executed = 0;
const failures = [];
const verdicts = [];

for (const [index, statement] of statements.entries()) {
  const preview = statement.replace(/\s+/g, " ").slice(0, 70);

  try {
    const result = await client.query(statement);
    executed += 1;

    /*
     * The NOTICE is the authoritative verdict.
     *
     * The assertions that switch role and read through RLS run inside
     * `begin; … rollback;` blocks, so the row they write to the results table
     * is rolled back with the transaction. The notice is a message rather than
     * a row, so it survives — and it is emitted at the moment the assertion
     * runs, so it cannot be lost.
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

    // The outcome summary: `select case when bool_and(passed) … as outcome`.
    if (result.rows?.length && result.rows[0]?.outcome !== undefined) {
      const row = result.rows[0];
      console.log(
        `\n${row.outcome}: ${row.passed}/${row.assertions} assertions passed`,
      );
      continue;
    }
  } catch (error) {
    failures.push(`${preview} — ${error.message}`);
    console.log(`\nFAIL at statement ${index + 1}: ${preview}`);
    console.log(`     ${error.message}`);
    console.log(`     (the file stops at the first failure, as designed)`);
    break;
  }
}

/*
 * Report every verdict collected from the notices.
 *
 * The notices are the complete list, including the ones made inside a
 * transaction that was later rolled back — which is where the RLS
 * assertions live.
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

console.log(`\n${executed} statements executed, no assertion failed`);
