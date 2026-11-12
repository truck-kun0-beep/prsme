/**
 * A temporary diagnostic: what can an ANONYMOUS visitor actually call?
 *
 * The default privileges in the `public` schema grant `anon` EXECUTE on every
 * newly created function. Migration 00012 revoked the social helpers "from
 * public", which removes the PUBLIC grant but leaves the explicit `anon`
 * grant in place.
 *
 * This calls the helpers as an anonymous visitor, against the live project,
 * and reports which ones answer. The ones that answer are the exposure.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* rely on the ambient environment */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* Two real account ids, so the answer is not vacuous. */
const ids = [
  "00000000-0000-0000-0000-000000000000",
  "11111111-1111-1111-1111-111111111111",
];

console.log("--- anonymous RPC calls against the live project ---\n");

const calls = [
  ["is_blocked_between", { a: ids[0], b: ids[1] }],
  ["can_comment_on", { profile_uuid: ids[0] }],
  ["can_view_profile", { profile_uuid: ids[0] }],
  ["is_follower", { following_uuid: ids[0] }],
  ["has_follow_state", { following_uuid: ids[0] }],
  ["follow_status_for", { following_uuid: ids[0] }],
  ["is_publicly_visible", { profile_uuid: ids[0] }],
  ["profile_summary", { profile_uuid: ids[0] }],
];

for (const [fn, args] of calls) {
  const { data, error } = await anon.rpc(fn, args);
  const verdict = error
    ? `REFUSED  (${error.message.slice(0, 90)})`
    : `ANSWERED  ${JSON.stringify(data).slice(0, 90)}`;
  console.log(`${fn.padEnd(24)} ${verdict}`);
}
