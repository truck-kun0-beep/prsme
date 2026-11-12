/**
 * Apply the PENDING migrations to the PRSME Supabase project.
 *
 * WHY THIS EXISTS
 *
 * The Supabase CLI's `db push` hangs on this machine: the project's `db` host
 * resolves to IPv6 only, and this machine has no IPv6 route to it. That is
 * the same blocker Phase 6.3 documented. The CLI's `--db-url` path needs the
 * database password, which is a project owner's secret and is not available
 * to an unattended run.
 *
 * The Management API's database query endpoint DOES work, so the migrations
 * are applied through it, and the `supabase_migrations` table is updated the
 * same way the CLI would, so the chain stays consistent.
 *
 * WHAT IT DOES NOT DO
 *
 *   - it never prints a credential;
 *   - it never invents a migration: the files come from
 *     `supabase/migrations/`, in filename order;
 *   - it never applies a migration the remote already has, because the
 *     remote's applied versions are read first and only the missing ones run;
 *   - it never touches the `public` schema outside the migration's own
 *     statements.
 *
 * THE STATEMENT SPLITTER
 *
 * The `supabase_migrations.statements` column holds the migration split into
 * its statements, and the CLI replays that array. So this script uses the
 * SAME splitter as the SQL test runners (`scripts/localdb/sql-split.mjs`),
 * which understands line comments, block comments, dollar-quoted bodies, and
 * string literals in one pass. A naive semicolon split would cut a function
 * body in half.
 *
 * THE ORDER OF OPERATIONS
 *
 * The migration runs FIRST and the record is written SECOND. If the
 * migration fails, no record is written, so a re-run tries it again. If the
 * record were written first, a failure would leave the chain believing a
 * migration had been applied when it had not, and the CLI would skip it
 * forever.
 *
 * Usage:
 *   node scripts/remote-migrate.mjs            # apply the pending migrations
 *   node scripts/remote-migrate.mjs --dry-run  # list them, apply nothing
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { requireAccessToken } from "./supabase-access-token.mjs";
import { splitSqlUnits } from "./localdb/sql-split.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const API = "https://api.supabase.com";

const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";
const dryRun = process.argv.includes("--dry-run");

const token = requireAccessToken();

/*
 * The dollar sign, on its own.
 *
 * A Postgres dollar-quote is written as two of these, and the tag is built
 * from this constant rather than written literally, because a literal pair in
 * this file is liable to be collapsed by whatever edits the file, and half a
 * dollar-quote is a syntax error at the worst possible moment.
 */
const D = "$";

/**
 * Run one SQL submission against the project's database.
 *
 * The endpoint runs as `postgres`, which bypasses RLS, so a statement that
 * depends on a policy has to switch the role itself, exactly as the SQL test
 * file does.
 */
async function query(sql) {
  const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(180000),
  });

  const text = await res.text();

  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** The migration files, in the order Postgres applies them. */
function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const version = name.slice(0, 14);
      return {
        version,
        name: name.slice(15).replace(/\.sql$/, ""),
        path: join(MIGRATIONS_DIR, name),
      };
    });
}

/** The versions the remote database already has. */
async function appliedVersions() {
  const rows = await query(
    "select version from supabase_migrations.schema_migrations order by version;",
  );
  return new Set(rows.map((row) => row.version));
}

const applied = await appliedVersions();
const pending = migrationFiles().filter((file) => !applied.has(file.version));

console.log(`PRSME - migrations for ${ref}`);
console.log(
  `${migrationFiles().length} local migrations, ${applied.size} applied remotely, ${pending.length} pending\n`,
);

if (pending.length === 0) {
  console.log("Nothing to do - the remote database is up to date.");
  process.exitCode = 0;
} else {
  for (const migration of pending) {
    console.log(`  ${migration.version}  ${migration.name}`);

    if (dryRun) continue;

    const source = readFileSync(migration.path, "utf8");
    const { units } = splitSqlUnits(source);

    /*
     * The whole migration runs as ONE submission, so a failure leaves the
     * database exactly as it was, because Postgres runs a multi-statement
     * submission in a single transaction.
     */
    try {
      await query(source);
    } catch (error) {
      console.error(
        `\n  FAILED: ${migration.version} ${migration.name}\n  ${error.message}\n`,
      );
      console.error(
        "  The migration was NOT recorded, so it will be retried on the next run.",
      );
      process.exit(1);
    }

    /*
     * The record is written the way the CLI writes it: the migration split into
     * its statements, plus the version and the name.
     *
     * The statements go in as a JSON array and are unpacked by
     * `jsonb_array_elements_text`, rather than as a hand-written array literal:
     * an array literal would need every quote inside every statement escaped,
     * and the migration bodies contain dollar-quoted function bodies whose
     * quoting is easy to get wrong.
     *
     * `on conflict (version) do nothing` makes a re-run harmless.
     */
    const statementsJson = JSON.stringify(
      units.map((unit) => unit.replace(/;\s*$/, "")),
    );

    /*
     * The dollar-quote is TAGGED, and the tag is derived from the version.
     *
     * A tagged dollar-quote opens and closes with the SAME token, so a value is
     * wrapped by putting that token on each side of it. The two halves must
     * match exactly: an untagged pair of dollars would open a literal that
     * ends at the next untagged pair, and the text between the two halves would
     * be parsed as SQL rather than as a string.
     *
     * The tag has to be a valid identifier, so it starts with a letter. The
     * version alone would not do, because a tag may not begin with a digit.
     *
     * The tag cannot collide with anything inside the migration's own SQL: the
     * migrations use the UNTAGGED form, which is a different delimiter, and
     * nothing in a migration mentions the version it is filed under.
     */
    const tag = D + "prsme_" + migration.version + D;
    const literal = (value) => tag + value + tag;

    await query(
      "insert into supabase_migrations.schema_migrations (version, statements, name) " +
        `select ${literal(migration.version)}, array_agg(value), ${literal(migration.name)} ` +
        `from jsonb_array_elements_text(${literal(statementsJson)}::jsonb) ` +
        "on conflict (version) do nothing;",
    );

    console.log(`           applied (${units.length} statements)`);
  }
}

if (dryRun) {
  console.log("\nDry run - nothing was applied.");
} else {
  console.log(`\n${pending.length} migration(s) applied.`);
}
