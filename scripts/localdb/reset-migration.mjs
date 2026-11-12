/**
 * A temporary helper: drop a migration's record from the remote's
 * `schema_migrations` table, so the next `remote-migrate.mjs` run re-applies it.
 *
 * This is for a migration that is still being edited in the same working
 * session: the record must match the file, and a migration whose file changed
 * after it was applied no longer does.
 *
 * The migration's own statements are all idempotent — `revoke`, `grant` and
 * `alter default privileges` can each be repeated — so re-applying is safe.
 *
 * Usage:
 *   node scripts/localdb/reset-migration.mjs 20250101000013
 */
import { requireAccessToken } from "../supabase-access-token.mjs";

const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";
const token = requireAccessToken();

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/localdb/reset-migration.mjs <version>");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(120000),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error(`status ${res.status}: ${text.slice(0, 600)}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const before = await query(
  `select version, name from supabase_migrations.schema_migrations where version = '${version}';`,
);
console.log("before:", JSON.stringify(before));

await query(
  `delete from supabase_migrations.schema_migrations where version = '${version}';`,
);

const after = await query(
  `select version, name from supabase_migrations.schema_migrations where version = '${version}';`,
);
console.log("after: ", JSON.stringify(after));
