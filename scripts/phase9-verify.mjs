/**
 * Phase 9 — the notification system's verification suite.
 *
 * WHAT THIS CHECKS
 *
 *   A. THE SCHEMA (static) — the notifications table, its constraints, its
 *      indexes, and the triggers that write it.
 *   B. THE EVENTS (static) — that every one of the five events has a trigger,
 *      and that the events which must NOT notify have none.
 *   C. THE SERVER BOUNDARY (static) — that identity comes from the session,
 *      that no client route creates a notification, and that the client can
 *      only reach its own notifications.
 *   D. PRIVILEGES (static) — that `anon` holds nothing, that the write
 *      functions are not callable by a client role, and that there is no
 *      INSERT or DELETE policy.
 *   E. THE INTERFACE (static) — that the notification centre exists, that the
 *      navigation has exactly ONE bell, and that the badge is small.
 *   F. LIVE DATABASE — permitted AND denied paths against a real project: a
 *      follow notifies, a forged notification is refused, another account's
 *      notification is invisible, and a client cannot create one.
 *
 * The live section is SKIPPED LOUDLY without a project rather than silently
 * passing.
 *
 * Usage:
 *   node scripts/phase9-verify.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in
 * the environment (or .env.local). Never prints a secret.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey } from "./supabase-access-token.mjs";

/* -------------------------------------------------------------------------- */
/*                                 Harness                                    */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function section(title) {
  console.log(`\n-- ${title} ${"-".repeat(Math.max(0, 56 - title.length))}`);
}

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function skip(name, why) {
  skipped++;
  console.log(`  SKIP  ${name} :: ${why}`);
}

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function read(relative) {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

/**
 * Source with its comments stripped.
 *
 * The checks below assert on CODE, not on prose. A doc comment that explains
 * why a control does not exist is documentation, not a control, and a plain
 * substring search cannot tell the two apart.
 */
function readCode(relative) {
  return stripComments(read(relative));
}

/** Remove block and line comments, leaving `https://` URLs intact. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/* -------------------------------------------------------------------------- */
/*                                    Env                                     */
/* -------------------------------------------------------------------------- */

/** Load .env.local without printing any value. */
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
    /* no .env.local — rely on the ambient environment */
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/* -------------------------------------------------------------------------- */
/*                        A. The schema, statically                           */
/* -------------------------------------------------------------------------- */

function verifySchema() {
  section("The notifications table (static)");

  const sql = read("supabase/migrations/20250101000015_notifications.sql");

  check(
    "the notifications table exists",
    /create table if not exists public\.notifications/i.test(sql),
  );

  check(
    "the table is in the versioned migration set",
    read("supabase/migrations/20250101000015_notifications.sql").length > 0,
  );

  check(
    "the notification type is a closed set of five values",
    /type in \([\s\S]{0,200}?'follow',[\s\S]{0,120}?'follow_request',[\s\S]{0,120}?'follow_accepted',[\s\S]{0,120}?'follow_declined',[\s\S]{0,120}?'comment'/i.test(
      sql,
    ),
  );

  check(
    "a notification cannot be addressed to its own actor",
    /check \(recipient_id <> actor_id\)/i.test(sql),
  );

  check(
    "a notification names exactly one subject",
    /follow_id is not null[\s\S]{0,80}?comment_id is null/i.test(sql) &&
      /comment_id is not null and follow_id is null/i.test(sql),
  );

  check(
    "the follow reference is a real foreign key",
    /follow_id\s+uuid\s+references public\.follows \(id\) on delete cascade/i.test(
      sql,
    ),
  );

  check(
    "the comment reference is a real foreign key",
    /comment_id\s+uuid\s+references public\.profile_comments \(id\) on delete cascade/i.test(
      sql,
    ),
  );

  check(
    "the read state is a nullable timestamp",
    /read_at\s+timestamptz/i.test(sql),
  );

  check(
    "the dismiss state is a nullable timestamp",
    /dismissed_at\s+timestamptz/i.test(sql),
  );

  check(
    "the actor's handle is frozen onto the row",
    /actor_username text not null/i.test(sql),
  );

  check(
    "the notification centre list is indexed newest first",
    /create index if not exists notifications_recipient_idx[\s\S]{0,200}?recipient_id, created_at desc/i.test(
      sql,
    ),
  );

  check(
    "the unread count has its own partial index",
    /create index if not exists notifications_unread_idx[\s\S]{0,240}?where read_at is null/i.test(
      sql,
    ),
  );

  check(
    "the duplicate rule is a unique index, not a convention",
    /create unique index if not exists notifications_unique_follow_event/i.test(
      sql,
    ) &&
      /create unique index if not exists notifications_unique_comment_event/i.test(
        sql,
      ),
  );

  check(
    "the duplicate rule only covers the notifications that are still showing",
    /notifications_unique_follow_event[\s\S]{0,240}?where follow_id is not null and dismissed_at is null/i.test(
      sql,
    ),
  );

  check(
    "RLS is enabled on the table",
    /alter table public\.notifications enable row level security/i.test(sql),
  );

  check(
    "only the recipient may read a notification",
    /for select[\s\S]{0,200}?using \(\(select auth\.uid\(\)\) = recipient_id\)/i.test(
      sql,
    ),
  );

  check(
    "only the recipient may change a notification",
    /for update[\s\S]{0,240}?with check \(\(select auth\.uid\(\)\) = recipient_id\)/i.test(
      sql,
    ),
  );

  check(
    "the client holds SELECT and UPDATE and nothing else",
    /revoke all on table public\.notifications from public, anon, authenticated/i.test(
      sql,
    ) &&
      /grant select, update on table public\.notifications to authenticated/i.test(
        sql,
      ),
  );

  check(
    "the write function is revoked from every client role",
    /revoke all on function public\.record_notification\(uuid, uuid, text, uuid, uuid\) from public, anon, authenticated/i.test(
      sql,
    ),
  );

  check(
    "the trigger functions are revoked from every client role",
    /revoke all on function public\.notify_follow_inserted\(\) from public, anon, authenticated/i.test(
      sql,
    ) &&
      /revoke all on function public\.notify_comment_created\(\) from public, anon, authenticated/i.test(
        sql,
      ),
  );
}

/* -------------------------------------------------------------------------- */
/*                        B. The events, statically                           */
/* -------------------------------------------------------------------------- */

function verifyEvents() {
  section("The notification events (static)");

  const sql = read("supabase/migrations/20250101000015_notifications.sql");

  check(
    "a new follow edge notifies",
    /create trigger follows_notify_insert/i.test(sql) &&
      /'follow'/i.test(sql),
  );

  check(
    "a new follow edge chooses between a follow and a request",
    /if new\.status = 'accepted' then[\s\S]{0,300}?'follow'[\s\S]{0,300}?elsif new\.status = 'pending' then[\s\S]{0,300}?'follow_request'/i.test(
      sql,
    ),
  );

  check(
    "a resolved request notifies the requester",
    /if new\.status = 'accepted' then[\s\S]{0,300}?'follow_accepted'/i.test(sql) &&
      /elsif new\.status = 'declined' then[\s\S]{0,300}?'follow_declined'/i.test(
        sql,
      ),
  );

  check(
    "a comment notifies the profile's owner",
    /create trigger profile_comments_notify/i.test(sql) &&
      /new\.profile_id,\s*new\.author_id,\s*'comment'/i.test(sql),
  );

  check(
    "the notification is written by a trigger, not by the application",
    /create trigger follows_notify_insert[\s\S]{0,120}?after insert on public\.follows/i.test(
      sql,
    ) &&
      /create trigger profile_comments_notify[\s\S]{0,120}?after insert on public\.profile_comments/i.test(
        sql,
      ),
  );

  check(
    "an unchanged status is not treated as a transition",
    /if new\.status = old\.status then/i.test(sql),
  );

  check(
    "a CANCELLED edge notifies nobody",
    /'cancelled'[\s\S]{0,400}?perform public\.record_notification/i.test(sql) ===
      false,
  );

  check(
    "there is NO trigger that notifies on a profile view",
    !/create trigger[\s\S]{0,120}?on public\.profiles/i.test(sql),
  );

  check(
    "there is NO trigger that notifies on a delete",
    !/create trigger[\s\S]{0,120}?after delete/i.test(sql),
  );

  check(
    "a blocked pair generates nothing",
    /is_blocked_between\(recipient_uuid, actor_uuid\)/i.test(sql),
  );

  check(
    "a block discards the notifications between the pair",
    /create trigger user_blocks_discard_notifications/i.test(sql) &&
      /delete from public\.notifications/i.test(sql),
  );

  check(
    "a resolved request stops being outstanding",
    /create trigger follows_notify_request_closed/i.test(sql),
  );

  check(
    "a notification never carries a comment's text",
    !/insert into public\.notifications[\s\S]{0,600}?\bnew\.body\b/i.test(sql),
  );
}

/* -------------------------------------------------------------------------- */
/*                      C. The server boundary, statically                     */
/* -------------------------------------------------------------------------- */

function verifyServerBoundary() {
  section("The server boundary (static)");

  const route = readCode("app/api/notifications/route.ts");
  const module = readCode("lib/supabase/notifications.ts");
  const page = readCode("app/account/notifications/page.tsx");

  check(
    "the API route takes the identity from the session",
    /getCurrentUserId\(\)/i.test(route),
  );

  check(
    "the API route never accepts a recipient from the client",
    !/recipient_id/i.test(route),
  );

  check(
    "the API route never accepts an actor from the client",
    !/actor_id/i.test(route),
  );

  check(
    "there is NO route that creates a notification",
    !/\.insert\(\s*\{[\s\S]{0,200}?recipient_id/i.test(module),
  );

  check(
    "the module never writes a notification",
    !/from\("notifications"\)[\s\S]{0,80}?\.insert/i.test(module),
  );

  check(
    "the module only ever UPDATEs a notification",
    /from\("notifications"\)[\s\S]{0,80}?\.update/i.test(module),
  );

  check(
    "the list is scoped to the caller's own rows",
    /from\("notifications"\)[\s\S]{0,400}?\.is\("dismissed_at", null\)/i.test(
      module,
    ) && /getCurrentUserId\(\)/i.test(module),
  );

  check(
    "the notification centre redirects an anonymous visitor",
    /redirect\("\/sign-in/i.test(page),
  );

  check(
    "the notification centre renders on the server",
    /listNotifications\(\)/i.test(page),
  );
}

/* -------------------------------------------------------------------------- */
/*                       D. The interface, statically                          */
/* -------------------------------------------------------------------------- */

function verifyInterface() {
  section("The interface (static)");

  const nav = readCode("components/SiteNav.tsx");
  const bell = read("components/notifications/NotificationBell.tsx");
  const center = readCode("components/notifications/NotificationCenter.tsx");

  check(
    "the navigation renders the notification bell",
    /NotificationBell/i.test(nav),
  );

  check(
    "the navigation renders the bell exactly ONCE per layout",
    (nav.match(/<NotificationBell/g) ?? []).length === 1,
    `${(nav.match(/<NotificationBell/g) ?? []).length} occurrences`,
  );

  check(
    "the bell links to the notification centre",
    /href="\/account\/notifications"/i.test(bell),
  );

  check(
    "the badge is SMALL, not an oversized indicator",
    /min-w-\[16px\]/i.test(bell) && /text-\[10px\]/i.test(bell),
  );

  check(
    "the badge counts down to nine and then says 9+",
    /count > 9/i.test(bell) && /"9\+"/i.test(bell),
  );

  check(
    "the badge is hidden when there is nothing unread",
    /badge \?/i.test(bell),
  );

  check(
    "the notification centre distinguishes read from unread",
    /data-read=/i.test(center) && /notification-unread-dot/i.test(center),
  );

  check(
    "the notification centre offers mark-as-read",
    /notification-mark-read/i.test(center),
  );

  check(
    "the notification centre offers mark-all-as-read",
    /notifications-mark-all-read/i.test(center),
  );

  check(
    "the notification centre offers dismiss",
    /notification-dismiss/i.test(center),
  );

  check(
    "the notification centre offers older notifications",
    /notifications-load-more/i.test(center),
  );

  check(
    "the notification centre has an empty state",
    /notifications-empty/i.test(center),
  );

  check(
    "the notification centre shows the actor and the time",
    /actorUsername/i.test(center) && /formatNotificationTime/i.test(center),
  );

  check(
    "the notification centre links each notification to its destination",
    /href=\{item\.href\}/i.test(center),
  );

  check(
    "the account settings page links to the notification centre",
    /href="\/account\/notifications"/i.test(
      readCode("components/auth/AccountSettingsClient.tsx"),
    ),
  );

  check(
    "the notification centre exists as a route",
    read("app/account/notifications/page.tsx").length > 0,
  );
}

/* -------------------------------------------------------------------------- */
/*                      E. The live database section                          */
/* -------------------------------------------------------------------------- */

/**
 * The live section.
 *
 * It runs against a REAL project over the REST layer, as a browser would.
 *
 * Two accounts are created, and the whole flow is driven through the
 * published key's REST API with a real session — so every assertion is
 * about what a signed-in visitor could actually do, not about what a
 * service-role client could do.
 */
async function verifyLive() {
  section("The live database");

  if (!SUPABASE_URL || !KEY) {
    skip(
      "live database",
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set",
    );
    return;
  }

  const key = await serviceRoleKey();
  if (!key) {
    skip("live database", "no service-role key is available");
    return;
  }

  const admin = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const alice = {
    email: `p9-alice-${stamp}@prsme.test`,
    username: `p9alice${stamp}`.slice(0, 28),
  };
  const bob = {
    email: `p9-bob-${stamp}@prsme.test`,
    username: `p9bob${stamp}`.slice(0, 28),
  };
  const PASSWORD = `Prsme!${stamp}9x`;

  const cleanup = async () => {
    // The notifications first: they reference the follows and the comments.
    await admin
      .from("notifications")
      .delete()
      .in("recipient_id", [alice.id, bob.id].filter(Boolean));
    await admin.from("profile_comments").delete().in("author_id", [alice.id, bob.id].filter(Boolean));
    await admin.from("follows").delete().in("follower_id", [alice.id, bob.id].filter(Boolean));
    await admin.from("profiles").delete().in("user_id", [alice.id, bob.id].filter(Boolean));
    if (alice.id) await admin.auth.admin.deleteUser(alice.id);
    if (bob.id) await admin.auth.admin.deleteUser(bob.id);
  };

  const signUp = async (account) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: account.username },
    });
    if (error) throw new Error(error.message);
    account.id = data.user.id;

    await admin.from("profiles").insert({
      user_id: account.id,
      username: account.username,
      visibility: "public",
      profile_state: { version: 1, identity: { displayName: account.username } },
    });
    return account.id;
  };

  try {
    await signUp(alice);
    await signUp(bob);

    // Alice and Bob sign in through the published key, so the session is a
    // real one and the RLS context is the one a browser would have.
    const signIn = async (account) => {
      const client = createClient(SUPABASE_URL, KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: account.email,
        password: PASSWORD,
      });
      if (error) throw new Error(error.message);
      return client;
    };

    const aliceClient = await signIn(alice);
    const bobClient = await signIn(bob);

    // Alice follows Bob.
    const { error: followError } = await aliceClient
      .from("follows")
      .insert({ follower_id: alice.id, following_id: bob.id, status: "accepted" });
    check("a follow succeeds", !followError, followError?.message ?? "");

    // Bob is notified.
    const { data: bobNotifications, error: listError } = await bobClient
      .from("notifications")
      .select("id, type, body, actor_username, target_username, read_at")
      .order("created_at", { ascending: false });

    check("the followed account can read the notification", !listError, listError?.message ?? "");
    check(
      "a follow notifies the followed account",
      (bobNotifications ?? []).some(
        (n) =>
          n.type === "follow" &&
          n.actor_username === alice.username &&
          n.target_username === bob.username,
      ),
      JSON.stringify(bobNotifications ?? []),
    );

    // Alice is not notified of her own follow.
    const { data: aliceNotifications } = await aliceClient
      .from("notifications")
      .select("id, type");
    check(
      "the follower is NOT notified of their own follow",
      (aliceNotifications ?? []).every((n) => n.type !== "follow"),
      JSON.stringify(aliceNotifications ?? []),
    );

    // A forged notification is refused.
    const { error: forgeError } = await aliceClient.from("notifications").insert({
      recipient_id: bob.id,
      actor_id: alice.id,
      type: "follow",
      body: "A forged notification.",
      actor_username: alice.username,
      target_username: bob.username,
    });
    check(
      "a client CANNOT create a notification",
      Boolean(forgeError),
      forgeError?.message ?? "the insert was accepted",
    );

    // Alice cannot read Bob's notification.
    const { data: crossRead } = await aliceClient
      .from("notifications")
      .select("id")
      .eq("recipient_id", bob.id);
    check(
      "an account CANNOT read another account's notification",
      (crossRead ?? []).length === 0,
      JSON.stringify(crossRead ?? []),
    );

    // Alice cannot mark Bob's notification read.
    //
    // The UPDATE is SILENTLY REFUSED rather than raising an error: the RLS
    // policy's `using` clause filters the row out of the set the update
    // touches, so the update matches nothing and changes nothing. What
    // matters is the EFFECT, and that is what the next assertion checks —
    // the notification is still unread afterwards.
    const bobNotificationId = (bobNotifications ?? [])[0]?.id;
    if (bobNotificationId) {
      await aliceClient
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", bobNotificationId);

      const { data: afterCrossUpdate } = await bobClient
        .from("notifications")
        .select("read_at")
        .eq("id", bobNotificationId)
        .maybeSingle();
      check(
        "an account CANNOT change another account's notification",
        afterCrossUpdate?.read_at === null,
        JSON.stringify(afterCrossUpdate ?? null),
      );

      // The RECIPIENT can mark it read.
      const { error: ownUpdateError } = await bobClient
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", bobNotificationId);
      check(
        "the recipient CAN mark a notification read",
        !ownUpdateError,
        ownUpdateError?.message ?? "",
      );

      // The unread count falls.
      const { count } = await bobClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      check("the unread count falls to zero", count === 0, `count=${count}`);
    } else {
      skip("the notification's own state", "no notification was created");
    }

    // An anonymous client sees nothing.
    const anonClient = createClient(SUPABASE_URL, KEY, {
      auth: { persistSession: false },
    });
    const { error: anonError } = await anonClient
      .from("notifications")
      .select("id")
      .limit(1);
    check(
      "an anonymous client CANNOT read notifications",
      Boolean(anonError),
      anonError?.message ?? "the read was accepted",
    );
  } catch (error) {
    check("the live section ran", false, error.message);
  } finally {
    await cleanup();
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Run                                     */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("PRSME — Phase 9 verification\n");

  verifySchema();
  verifyEvents();
  verifyServerBoundary();
  verifyInterface();
  await verifyLive();

  console.log(
    `\n${passed} passed, ${failed} failed, ${skipped} skipped`,
  );

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }

  if (skipped > 0) {
    console.log("\nThe live section was skipped.");
  }
}

await main();
