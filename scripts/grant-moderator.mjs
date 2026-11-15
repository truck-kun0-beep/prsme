/**
 * Grant the moderator role to an account.
 *
 *   node scripts/grant-moderator.mjs <username> [--note "…"] [--list] [--revoke]
 *
 * WHY THIS IS A SCRIPT AND NOT A FEATURE
 *
 * The brief asks for "a safe method for explicitly granting the initial
 * moderator role", and the important word is EXPLICITLY.
 *
 * There is no route, no form, no API and no self-service path that grants the
 * role. The roster table has no INSERT policy for any client role, so an
 * ordinary account — signed in or not — cannot put itself on it even if it
 * crafts a request. The only way to add a moderator is to run SQL against the
 * database with an operator's credentials, and this script is that door.
 *
 * The person running it is, by definition, somebody who already has more
 * authority than a moderator: they hold a project access token. So the
 * script's job is to make the granting DELIBERATE and AUDITABLE, not to make
 * it safe from somebody who is already at the top.
 *
 * WHAT IT DOES
 *
 *   - resolves the username against the `profiles` table, and refuses to run
 *     if there is no such account;
 *   - calls `public.grant_moderator(...)`, which is the database's own
 *     function and which refuses to run for anybody who is not an operator;
 *   - writes an audit record, so the grant itself is in the trail;
 *   - never prints a credential.
 *
 * REVOKING IS THE SAME SHAPE
 *
 * `--revoke` deletes the roster row. Revoking is not a moderation action —
 * it is an operator action — so it does not go through the moderation
 * functions, and it is not written to the moderation audit log. The roster
 * table itself keeps the fact that the account was a moderator only for as
 * long as the row exists, so a revoke is a DELETE.
 * Usage:
 *   node scripts/grant-moderator.mjs noir --note "community lead"
 *   node scripts/grant-moderator.mjs --list
 *   node scripts/grant-moderator.mjs noir --revoke
 */

import { requireAccessToken } from "./supabase-access-token.mjs";

const API = "https://api.supabase.com";
const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";

const args = process.argv.slice(2);
const username = args.find((arg) => !arg.startsWith("--")) ?? "";

function flagValue(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const wantsList = args.includes("--list");
const wantsRevoke = args.includes("--revoke");
const note = flagValue("note");

if (!wantsList && !username) {
  console.error(
    "Usage:\n" +
      "  node scripts/grant-moderator.mjs <username> [--note \"…\"]\n" +
      "  node scripts/grant-moderator.mjs <username> --revoke\n" +
      "  node scripts/grant-moderator.mjs --list\n",
  );
  process.exit(1);
}

const token = requireAccessToken();

/**
 * Run one SQL submission against the project's database.
 *
 * The endpoint runs as `postgres`, which is one of the three roles
 * `grant_moderator` accepts, so the database's own guard is satisfied rather
 * than bypassed.
 */
async function query(sql) {
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

/**
 * A quoted SQL string literal.
 *
 * The username is the only value that comes from the command line, so it is
 * the only value that needs quoting — and it is quoted properly, rather than
 * being assumed to be safe because it "looks like a username".
 */
function literal(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

console.log(`PRSME - moderator roster for ${ref}`);

if (wantsList) {
  const rows = await query(
    "select m.user_id, m.granted_at, m.note, p.username " +
      "from public.moderators m " +
      "left join public.profiles p on p.user_id = m.user_id " +
      "order by m.granted_at desc;",
  );

  if (rows.length === 0) {
    console.log("\nNo moderators. The queue is empty because nobody can act on it.");
  } else {
    console.log(`\n${rows.length} moderator(s):\n`);
    for (const row of rows) {
      console.log(
        `  ${row.username ? `@${row.username}` : row.user_id}` +
          `${row.note ? ` — ${row.note}` : ""}` +
          ` (granted ${new Date(row.granted_at).toISOString().slice(0, 10)})`,
      );
    }
  }
} else if (wantsRevoke) {
  const rows = await query(
    "delete from public.moderators " +
      "where user_id = (select user_id from public.profiles where username = " +
      `${literal(username.toLowerCase())}) returning user_id;`,
  );

  if (rows.length === 0) {
    console.error(
      `\nNo moderator with that username. Nothing was changed.\n` +
        `  (An account must exist in the profiles table to be on the roster.)`,
    );
    process.exitCode = 1;
  } else {
    console.log(`\n@${username} is no longer a moderator.`);
  }
} else {
  /*
   * The grant.
   *
   * `grant_moderator` resolves the username itself and refuses to run for
   * anybody who is not an operator, so this call cannot accidentally grant the
   * role to an account that does not exist.
   */
  try {
    const rows = await query(
      "select public.grant_moderator(" +
        `${literal(username.toLowerCase())}, ` +
        `${note ? literal(note) : "null"}` +
        ") as user_id;",
    );

    const granted = rows[0]?.user_id;

    if (!granted) {
      console.error("\nThe grant did not return an account. Nothing was changed.");
      process.exitCode = 1;
    } else {
      console.log(`\n@${username} is now a moderator.`);
      console.log("They can open /admin/moderation.");
      console.log(
        "\nTo take the role away:\n" +
          `  node scripts/grant-moderator.mjs ${username} --revoke`,
      );
    }
  } catch (error) {
    console.error(`\nThe grant failed:\n  ${error.message}`);
    process.exitCode = 1;
  }
}

/*
 * The process is NOT torn down with `process.exit()`.
 *
 * The `fetch` above leaves a handle behind, and killing the process while that
 * handle is closing trips a libuv assertion on Windows: the script printed
 * the right answer and then died with a crash code, which reads as a failure
 * to whatever runs it. Setting `exitCode` and letting the event loop drain is
 * the same outcome with no assertion.
 */

