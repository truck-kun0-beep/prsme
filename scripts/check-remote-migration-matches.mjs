/**
 * Does the REMOTE database hold the same migration the local file describes?
 *
 * The remote SQL suite proves the remote's POLICIES behave correctly. It does
 * not prove that the remote was built from the file in this repository: a
 * migration edited after it was applied would leave the two out of step while
 * every behaviour check still passed.
 *
 * So this compares the two directly. The local file is split with the same
 * splitter the migration runner uses, and the result is compared against the
 * statements the remote recorded in `supabase_migrations.schema_migrations`.
 *
 * A difference is reported, not fixed: re-applying a migration is the
 * operator's decision, not this script's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requireAccessToken } from "./supabase-access-token.mjs";
import { splitSqlUnits } from "./localdb/sql-split.mjs";

const ROOT = process.cwd();
const API = "https://api.supabase.com";
const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";
const VERSION = "20250101000016";

const token = requireAccessToken();

/**
 * The dollar sign, on its own.
 *
 * A literal pair in this file is liable to be collapsed by whatever edits it,
 * and half a dollar-quote is a syntax error at the worst possible moment.
 */
const D = "$";

async function query(sql) {
  const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  return JSON.parse(text);
}

/** The statements the remote recorded for this migration, in order. */
async function remoteStatements() {
  const tag = D + "prsme_check_" + VERSION + D;
  const sql =
    "select statements from supabase_migrations.schema_migrations where version = " +
    tag +
    VERSION +
    tag;

  const result = await query(sql);
  const rows = Array.isArray(result) ? result : [];

  if (rows.length === 0) {
    throw new Error(`the remote has no migration ${VERSION}`);
  }

  return rows[0].statements ?? [];
}

/** The statements the local file describes, in order. */
function localStatements() {
  const path = join(
    ROOT,
    "supabase",
    "migrations",
    `${VERSION}_moderation.sql`,
  );

  const source = readFileSync(path, "utf8");
  const { units } = splitSqlUnits(source);

  return units.map((unit) => unit.replace(/;\s*$/, "").trim());
}

const remote = await remoteStatements();
const local = localStatements();

console.log(`Local  ${VERSION}: ${local.length} statement(s)`);
console.log(`Remote ${VERSION}: ${remote.length} statement(s)`);

if (remote.length !== local.length) {
  console.log(
    `\nDIFFERENT: the remote holds ${remote.length} statements and the file holds ${local.length}.`,
  );
  process.exit(1);
}

let differences = 0;

for (let index = 0; index < local.length; index += 1) {
  const here = local[index];
  const there = (remote[index] ?? "").trim();

  if (here === there) continue;

  differences += 1;

  console.log(`\n--- statement ${index + 1} differs ---`);
  console.log(`LOCAL : ${here.slice(0, 200)}`);
  console.log(`REMOTE: ${there.slice(0, 200)}`);
}

if (differences > 0) {
  console.log(`\n${differences} statement(s) differ.`);
  process.exit(1);
}

console.log("\nThe remote holds exactly the migration in this repository.");
