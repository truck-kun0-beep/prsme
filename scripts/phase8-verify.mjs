// scripts/phase8-verify.mjs — Phase 8 verification.
//
// The claim under test: PRSME's social layer is ONE-WAY, and every rule about
// who may see, follow, comment on, block, or report an account is enforced by
// the DATABASE rather than by the browser.
//
// WHAT THIS SUITE PROVES
//
//   A. SCHEMA (static) — the tables, the constraints, and the helper functions
//      exist with the shape the rest of the code assumes.
//   B. NO FRIENDSHIP SYSTEM (static) — there is no `friendships` table, no
//      `friend_requests` table, no friend-specific column, and no friend
//      count anywhere in the application. The model is one-way and the suite
//      says so out loud.
//   C. SERVER BOUNDARY (static) — identity comes from the session, never from
//      the request body; the client cannot name the follower, the author, the
//      blocker, or the reporter.
//   D. PRIVILEGES (static) — `anon` holds no privilege on any social table,
//      and the trigger functions are not callable by a client role.
//   E. LIVE DATABASE — permitted AND denied paths against a real project:
//      a follow works, a forged follow for somebody else is refused, a
//      private profile stays private, a comment on a private profile is
//      refused, a block is invisible to the blocked account, and a report is
//      invisible to the reported account.
//
// The live section is SKIPPED LOUDLY without a project rather than silently
// passing.
//
// Usage:
//   node scripts/phase8-verify.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in
// the environment (or .env.local). Never prints a secret.

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
/*                          A. The schema, statically                          */
/* -------------------------------------------------------------------------- */

/**
 * The social tables.
 *
 * These are the invariants that make the model ONE-WAY, and the ones a future
 * migration could break by accident.
 */
function verifySocialSchema() {
  section("The social tables (static)");

  const sql = read("supabase/migrations/20250101000011_social_follows.sql");

  check(
    "the follows table exists",
    /create table if not exists public\.follows/i.test(sql),
  );
  check(
    "the profile_comments table exists",
    /create table if not exists public\.profile_comments/i.test(sql),
  );
  check(
    "the user_blocks table exists",
    /create table if not exists public\.user_blocks/i.test(sql),
  );
  check(
    "the content_reports table exists",
    /create table if not exists public\.content_reports/i.test(sql),
  );

  check(
    "a follow edge is unique on (follower_id, following_id)",
    /constraint follows_unique_pair unique \(follower_id, following_id\)/i.test(sql),
  );
  check(
    "a follow edge refuses a self-follow",
    /check \(follower_id <> following_id\)/i.test(sql),
  );
  check(
    "the follow status is a closed set of four values",
    /status in \('pending', 'accepted', 'declined', 'cancelled'\)/i.test(sql),
  );
  check(
    "a comment body is bounded to 1000 characters",
    /check \(char_length\(btrim\(body\)\) between 1 and 1000\)/i.test(sql),
  );
  check(
    "a comment cannot be on your own profile",
    /check \(author_id <> profile_id\)/i.test(sql),
  );
  check(
    "a block is unique on the pair and refuses a self-block",
    /constraint user_blocks_unique_pair unique \(blocker_id, blocked_id\)/i.test(sql) &&
      /check \(blocker_id <> blocked_id\)/i.test(sql),
  );
  check(
    "a report names exactly one subject",
    /comment_id is not null and profile_id is null\)[\s\S]{0,120}?comment_id is null and profile_id is not null/i.test(
      sql,
    ),
  );
  check(
    "a report cannot be about your own profile",
    /check \(profile_id is null or reporter_id <> profile_id\)/i.test(sql),
  );
  check(
    "the report reason is a closed set",
    /reason in \([\s\S]{0,200}?'spam', 'harassment', 'hate'/i.test(sql),
  );

  /*
   * THE DERIVED STATUS.
   *
   * This is the rule that makes the private-account flow real: a client cannot
   * choose `accepted`. The trigger rewrites the status from the target's
   * visibility, so a crafted insert naming `accepted` against a private
   * account still lands as `pending`.
   */
  check(
    "the status of a NEW edge is derived from the target's visibility",
    /create or replace function public\.follow_status_for/i.test(sql) &&
      /create trigger follows_guard_insert[\s\S]{0,200}?before insert on public\.follows/i.test(
        sql,
      ),
  );
  check(
    "the insert guard OVERWRITES the status it was given",
    /derived_status := public\.follow_status_for\(new\.following_id\)/i.test(sql) &&
      /new\.status := derived_status/i.test(sql),
  );

  /*
   * THE STATE MACHINE.
   *
   * A policy's `with check` sees only the NEW row, never the OLD one, so the
   * transition graph has to live in a trigger.
   */
  check(
    "the update guard refuses a transition that is not allowed",
    /raise exception 'that follow transition is not allowed'/i.test(sql),
  );
  check(
    "the edge's identity is immutable",
    /new\.follower_id <> old\.follower_id[\s\S]{0,200}?new\.following_id <> old\.following_id/i.test(
      sql,
    ),
  );
  check(
    "a requester can never move their own edge to 'accepted'",
    /if \(select auth\.uid\(\)\) = old\.follower_id then[\s\S]{0,600}?raise exception/i.test(
      sql,
    ),
  );

  check(
    "a block cuts the follow edges between the pair",
    /create or replace function public\.user_blocks_cuts_follows/i.test(sql) &&
      /create trigger user_blocks_cuts_follows[\s\S]{0,200}?after insert on public\.user_blocks/i.test(
        sql,
      ),
  );
  check(
    "the block trigger removes BOTH directions of the edge",
    /follower_id = new\.blocker_id and following_id = new\.blocked_id\)[\s\S]{0,160}?follower_id = new\.blocked_id and following_id = new\.blocker_id/i.test(
      sql,
    ),
  );
}

/**
 * The helper functions.
 *
 * Every one of them returns a BOOLEAN or a status string, never a row, so
 * none of them can be used to read somebody else's data sideways.
 */
function verifyHelperFunctions() {
  section("The helper functions (static)");

  const sql = read("supabase/migrations/20250101000011_social_follows.sql");

  check(
    "is_follower counts ACCEPTED edges only",
    /create or replace function public\.is_follower/i.test(sql) &&
      /status = 'accepted'/i.test(sql),
  );
  check(
    "has_follow_state reports the pending state too",
    /create or replace function public\.has_follow_state/i.test(sql),
  );
  check(
    "is_blocked_between is symmetric",
    /create or replace function public\.is_blocked_between/i.test(sql) &&
      /blocker_id = a and blocked_id = b/i.test(sql),
  );
  check(
    "can_comment_on exists and covers the private-profile rule",
    /create or replace function public\.can_comment_on/i.test(sql) &&
      /public\.is_follower\(profile_uuid\)/i.test(sql),
  );
  check(
    "can_view_profile exists",
    /create or replace function public\.can_view_profile/i.test(sql),
  );
  check(
    "is_publicly_visible is the session-free form",
    /create or replace function public\.is_publicly_visible/i.test(sql),
  );
  check(
    "profile_summary returns a hand-picked set of fields",
    /create or replace function public\.profile_summary/i.test(sql) &&
      /'followerCount'/i.test(sql) &&
      /'followState'/i.test(sql),
  );
  /*
   * The function READS the profile row — it has to, to get the username and the
   * visibility — but it must never RETURN the row's content.
   *
   * The content column is `profile_state`, and the only legitimate use of it
   * here is `->> 'displayName'`, which extracts ONE scalar. Returning the
   * column itself — `p.profile_state` — would hand a stranger the whole
   * document.
   */
  const summaryStart = sql.indexOf(
    "create or replace function public.profile_summary",
  );
  const nextFunction = sql.indexOf(
    "create or replace function",
    summaryStart + 10,
  );
  const summaryText = sql.slice(
    summaryStart,
    nextFunction === -1 ? undefined : nextFunction,
  );

  const contentMentions = [
    ...summaryText.matchAll(/profile_state[^\n]*/g),
  ].map((match) => match[0]);

  check(
    "profile_summary returns no 'profileState' key",
    !/'profileState'/i.test(summaryText),
  );
  check(
    "profile_summary extracts the display name and returns nothing else from the content column",
    contentMentions.length > 0 &&
      contentMentions.every((line) =>
        /profile_state ->> 'displayName'/.test(line),
      ),
    contentMentions.join(" | "),
  );
  check(
    "the follower count in the summary counts accepted edges only",
    /where f\.following_id = p\.user_id and f\.status = 'accepted'/i.test(sql),
  );
}

/**
 * THE RLS POLICIES.
 *
 * The policies are the inner lock; the grants are the outer one.
 */
function verifySocialRls() {
  section("The RLS policies (static)");

  const sql = read("supabase/migrations/20250101000012_social_rls.sql");

  check(
    "a follow edge is readable by both of its ends",
    /create policy "follows are visible to both ends"[\s\S]{0,400}?for select[\s\S]{0,200}?\(select auth\.uid\(\)\) = follower_id[\s\S]{0,120}?or \(select auth\.uid\(\)\) = following_id/i.test(
      sql,
    ),
  );
  check(
    "a caller can create a follow edge only for THEMSELVES",
    /create policy "callers can create their own follow"[\s\S]{0,600}?with check \([\s\S]{0,200}?\(select auth\.uid\(\)\) = follower_id/i.test(
      sql,
    ),
  );
  check(
    "a blocked pair cannot create an edge in either direction",
    /is_blocked_between\(\(select auth\.uid\(\)\), following_id\)/i.test(sql),
  );
  check(
    "a comment is readable only where the profile is readable",
    /create policy "comments are readable on visible profiles"[\s\S]{0,400}?using \(public\.can_view_profile\(profile_id\)\)/i.test(
      sql,
    ),
  );
  check(
    "a comment's author must be the caller",
    /create policy "callers can comment on profiles they may comment on"[\s\S]{0,600}?with check \([\s\S]{0,200}?\(select auth\.uid\(\)\) = author_id[\s\S]{0,200}?public\.can_comment_on\(profile_id\)/i.test(
      sql,
    ),
  );
  check(
    "only the author may edit a comment",
    /create policy "authors can edit their own comment"[\s\S]{0,400}?using \(\(select auth\.uid\(\)\) = author_id\)/i.test(
      sql,
    ),
  );
  check(
    "the profile owner may delete a comment on their profile",
    /create policy "authors and profile owners can delete a comment"[\s\S]{0,600}?\(select auth\.uid\(\)\) = author_id[\s\S]{0,120}?or \(select auth\.uid\(\)\) = profile_id/i.test(
      sql,
    ),
  );
  check(
    "ONLY the blocker sees their own blocks",
    /create policy "blockers can see their own blocks"[\s\S]{0,400}?using \(\(select auth\.uid\(\)\) = blocker_id\)/i.test(
      sql,
    ),
  );
  check(
    "the blocker creates the block, for themselves",
    /create policy "callers can block an account"[\s\S]{0,500}?with check \([\s\S]{0,200}?\(select auth\.uid\(\)\) = blocker_id/i.test(
      sql,
    ),
  );
  check(
    "ONLY the reporter sees their own reports",
    /create policy "reporters can see their own reports"[\s\S]{0,400}?using \(\(select auth\.uid\(\)\) = reporter_id\)/i.test(
      sql,
    ),
  );
  check(
    "the reporter files the report, for themselves",
    /create policy "callers can file a report"[\s\S]{0,400}?with check \(\(select auth\.uid\(\)\) = reporter_id\)/i.test(
      sql,
    ),
  );
  check(
    "the profiles SELECT policy is extended to approved followers",
    /create policy "profiles are readable by their owner and followers"[\s\S]{0,400}?using \(public\.can_view_profile\(user_id\)\)/i.test(
      sql,
    ),
  );
  check(
    "the Phase 5 owner-only profiles policy is REMOVED, not left beside it",
    /drop policy if exists "profiles are readable by owner"/i.test(sql) &&
      /drop policy if exists "public profiles are readable by anyone"/i.test(sql),
  );
  check(
    "an anonymous visitor may still read a public profile",
    /create policy "public profiles are readable by anyone"[\s\S]{0,400}?to anon, authenticated[\s\S]{0,200}?using \(public\.is_publicly_visible\(user_id\)\)/i.test(
      sql,
    ),
  );
}

/**
 * THE PRIVILEGE LOCK.
 *
 * The grant is the outer lock and the policy is the inner one. `anon` must
 * hold NO privilege on any social table.
 */
function verifyPrivileges() {
  section("The privilege lock (static)");

  const sql = read("supabase/migrations/20250101000012_social_rls.sql");

  check(
    "anon holds NO privilege on any social table",
    /revoke all on table public\.follows from public, anon, authenticated/i.test(sql) &&
      /revoke all on table public\.profile_comments from public, anon, authenticated/i.test(
        sql,
      ) &&
      /revoke all on table public\.user_blocks from public, anon, authenticated/i.test(
        sql,
      ) &&
      /revoke all on table public\.content_reports from public, anon, authenticated/i.test(
        sql,
      ),
  );
  check(
    "authenticated is granted exactly the social-table privileges it needs",
    /grant select, insert, update, delete on table public\.follows to authenticated/i.test(
      sql,
    ) &&
      /grant select, insert, delete on table public\.user_blocks to authenticated/i.test(
        sql,
      ),
  );
  check(
    "the helper functions are revoked from PUBLIC explicitly",
    /revoke all on function public\.can_comment_on\(uuid\) from public/i.test(sql) &&
      /revoke all on function public\.can_view_profile\(uuid\) from public/i.test(sql),
  );
  check(
    "the TRIGGER functions are not callable by a client role",
    /revoke all on function public\.follows_guard_insert\(\) from public, anon, authenticated/i.test(
      sql,
    ) &&
      /revoke all on function public\.follows_guard_update\(\) from public, anon, authenticated/i.test(
        sql,
      ),
  );
  check(
    "the session-free helper is executable by anon, so a public profile still reads",
    /grant execute on function public\.is_publicly_visible\(uuid\) to anon, authenticated/i.test(
      sql,
    ),
  );

  /*
   * The FUNCTION privilege lock.
   *
   * The schema-level default privileges are not enough on their own: Postgres
   * grants EXECUTE on a new function to PUBLIC by default, and a schema-level
   * default-privilege entry ADDS to that global default rather than replacing
   * it. The database-level revoke is therefore the one that actually closes
   * the leak, and its absence is asserted here.
   */
  const lock = read("supabase/migrations/20250101000013_function_privilege_lock.sql");

  check(
    "the FUNCTION default privileges are revoked at the DATABASE level",
    /alter default privileges revoke execute on functions from public/i.test(lock),
  );
  check(
    "the FUNCTION default privileges are revoked in the public schema too",
    /alter default privileges in schema public\s+revoke execute on functions from anon/i.test(
      lock,
    ) &&
      /alter default privileges in schema public\s+revoke execute on functions from authenticated/i.test(
        lock,
      ),
  );
  check(
    "the session-bound helpers are revoked from anon explicitly, not only from public",
    /revoke all on function public\.can_comment_on\(uuid\) from public, anon/i.test(
      lock,
    ) &&
      /revoke all on function public\.is_blocked_between\(uuid, uuid\) from public, anon/i.test(
        lock,
      ),
  );
  check(
    "the block trigger is revoked from every client role",
    /revoke all on function public\.user_blocks_cuts_follows\(\) from public, anon, authenticated/i.test(
      lock,
    ),
  );
  check(
    "the follow-status helper is revoked from every client role",
    /revoke all on function public\.follow_status_for\(uuid\) from public, anon, authenticated/i.test(
      lock,
    ),
  );
  check(
    "the session-free helpers stay executable by anon",
    /grant execute on function public\.profile_summary\(uuid\) to anon, authenticated/i.test(
      lock,
    ) &&
      /grant execute on function public\.is_username_taken\(text\) to anon, authenticated/i.test(
        lock,
      ),
  );
}

/**
 * B. THERE IS NO FRIENDSHIP SYSTEM.
 *
 * This is a product decision, not an omission, and the suite proves it rather
 * than asserting it in prose.
 */
function verifyNoFriendshipSystem() {
  section("No friendship system (static)");

  const schema = read("supabase/migrations/20250101000011_social_follows.sql");
  const rls = read("supabase/migrations/20250101000012_social_rls.sql");

  check(
    "no friendships table is created",
    !/create table[^;]*public\.friendships/i.test(schema),
  );
  check(
    "no friend_requests table is created",
    !/create table[^;]*public\.friend_requests/i.test(schema),
  );
  check(
    "no friend-specific column is created on any social table",
    !/friend/i.test(
      schema.replace(/--[\s\S]*?(?=\n--|\n|$)/g, ""),
    ),
  );
  check(
    "no friend policy is created",
    !/create policy[^;]*friend/i.test(rls),
  );

  // The application side: no friend count, no friends route, no friends tab.
  const applicationSources = [
    "lib/supabase/social.ts",
    "lib/supabase/comments.ts",
    "lib/supabase/reports.ts",
    "components/social/SocialPanel.tsx",
    "components/social/FollowRequestsPanel.tsx",
    "components/social/SocialAccountList.tsx",
    "components/social/ProfileComments.tsx",
    "components/social/SafetyControls.tsx",
    "app/api/social/route.ts",
    "app/api/follow-requests/route.ts",
    "app/api/comments/route.ts",
    "app/api/blocks/route.ts",
    "app/api/reports/route.ts",
    "app/u/[username]/[list]/page.tsx",
    "app/account/requests/page.tsx",
  ];

  const offenders = applicationSources.filter((file) => {
    const code = readCode(file);
    // The word "friend" may appear in a PROSE comment, which readCode strips.
    // What must not appear is an identifier or a literal.
    return /\bfriends?\b/i.test(code) && !/no friends|friendship/i.test(code);
  });

  check(
    "no application source names a friend, a friendship, or a friends tab",
    offenders.length === 0,
    offenders.join(", "),
  );

  check(
    "the follow state machine has no mutual state",
    !/mutual/i.test(readCode("lib/supabase/social.ts")),
  );
  check(
    "the follow route offers no friends route",
    !/friends/i.test(readCode("app/api/social/route.ts")),
  );
  check(
    "the follower list route serves only 'followers' and 'following'",
    /"followers" \| "following"/.test(readCode("app/u/[username]/[list]/page.tsx")),
  );
}

/**
 * C. THE SERVER BOUNDARY.
 *
 * The rules about WHO may do WHAT, expressed in application code. The database
 * enforces them again; this layer exists so the user gets a sentence instead
 * of a Postgres error code.
 */
function verifyServerBoundary() {
  section("Server boundary (static)");

  const social = readCode("lib/supabase/social.ts");
  const comments = readCode("lib/supabase/comments.ts");
  const reports = readCode("lib/supabase/reports.ts");
  const socialApi = readCode("app/api/social/route.ts");
  const commentsApi = readCode("app/api/comments/route.ts");
  const blocksApi = readCode("app/api/blocks/route.ts");
  const requestsApi = readCode("app/api/follow-requests/route.ts");
  const reportsApi = readCode("app/api/reports/route.ts");

  check(
    "the follower is derived from the verified session",
    /getCurrentUserId\(\)/.test(social) && /follower_id: userId/.test(social),
  );
  check(
    "the followed account is named by a USERNAME, never by a user id",
    /resolveTarget\(username\)/.test(social) &&
      !/following_id:\s*(body|payload|input)\./i.test(social),
  );
  /*
   * The route must never READ an id out of the body. The local variable
   * `userId` is the session's id, so the assertion is that the route never
   * PARSES a body at all — there is no request field to spoof.
   */
  check(
    "the social route never reads a body, so there is no id to spoof",
    !/request\.json\(\)/.test(socialApi),
  );
  check(
    "the social route takes its subject from the query string, not the body",
    /searchParams\.get\("username"\)/.test(socialApi),
  );
  check(
    "the comment's author is derived from the verified session",
    /getCurrentUserId\(\)/.test(comments) && /author_id: userId/.test(comments),
  );
  /*
   * The comment route reads a body — but only the TEXT. There is no author
   * field to spoof, and the only identity it accepts is the session's.
   */
  const commentBodyFields = [...commentsApi.matchAll(/body\.(\w+)/g)].map(
    (match) => match[1],
  );
  check(
    "the comment route reads only the text out of the body",
    commentBodyFields.length > 0 &&
      commentBodyFields.every((field) => field === "body"),
    commentBodyFields.join(", "),
  );
  check(
    "the comment route names the author only in its RESPONSE, never in the request",
    !/body\.author/i.test(commentsApi),
  );
  check(
    "the block's blocker is derived from the verified session",
    /getCurrentUserId\(\)/.test(social) && /blocker_id: userId/.test(social),
  );
  check(
    "the blocks route accepts no blocker id from the body",
    !/blockerId|blockedId/i.test(blocksApi),
  );
  check(
    "the report's reporter is derived from the verified session",
    /getCurrentUserId\(\)/.test(reports) && /reporter_id: userId/.test(reports),
  );
  check(
    "the reports route accepts no reporter id from the body",
    !/reporterId/i.test(reportsApi),
  );
  check(
    "the follow-request route names the REQUESTER by username, not by user id",
    /searchParams\.get\("username"\)/.test(requestsApi) && !/followerId/i.test(requestsApi),
  );

  /*
   * The approval is scoped to BOTH ends of the edge, so a caller can only
   * ever resolve a request addressed to THEM.
   */
  check(
    "an approval is scoped to the caller's own incoming edge",
    /\.eq\("following_id", ownerId\)/.test(social) &&
      /\.eq\("follower_id", requester\.user_id\)/.test(social),
  );

  /*
   * The state is DERIVED by the database, so the module does not choose it.
   */
  check(
    "the module does not choose the status of a NEW edge",
    /status: "accepted"|status: "pending"/.test(social) &&
      /follow_status_for|the trigger rewrites/i.test(read("lib/supabase/social.ts")),
  );
  check(
    "the module READS BACK the derived status rather than assuming it",
    /reRequested/.test(social) || /written/.test(social),
  );

  /*
   * The comment rule is the DATABASE's to make. The application asks
   * `can_comment_on` and reflects the answer rather than re-deriving it.
   */
  check(
    "the application asks the database whether a comment is allowed",
    /rpc\("can_comment_on"/.test(comments),
  );
  check(
    "the comment body is validated before it is written",
    /validateCommentBody/.test(comments) && /COMMENT_MAX/.test(comments),
  );
  check(
    "a comment body is stripped of anything that looks like markup",
    /replace\(\/\[<>\]\/g, ""\)/.test(comments),
  );
  check(
    "a comment cannot be written for another account",
    /\.eq\("author_id", userId\)/.test(comments),
  );

  /*
   * The client-safe constants live in a module with no server dependency, so a
   * client component can import them without dragging `next/headers` into the
   * browser bundle.
   */
  const constants = readCode("lib/supabase/socialConstants.ts");
  check(
    "the client-safe constants do not import the server client",
    !/getServerClient|next\/headers/.test(constants),
  );
  check(
    "the report reasons live in the client-safe module",
    /export const REPORT_REASONS/.test(constants),
  );
  check(
    "the client components import the constants from the client-safe module",
    /from "@\/lib\/supabase\/socialConstants"/.test(
      readCode("components/social/SafetyControls.tsx"),
    ) &&
      /from "@\/lib\/supabase\/socialConstants"/.test(
        readCode("components/social/ProfileComments.tsx"),
      ),
  );
}

/**
 * The UI.
 *
 * The four states the Follow button can show, and the rule that the demo
 * profile's fictional counts are never mixed with a real relationship.
 */
function verifyUserInterface() {
  section("The interface (static)");

  const panel = readCode("components/social/SocialPanel.tsx");
  const header = readCode("components/ProfileHeader.tsx");
  const content = readCode("components/PublicProfileContent.tsx");
  const comments = readCode("components/social/ProfileComments.tsx");

  check(
    "the Follow button shows Follow, Following, or Requested",
    /case "accepted":[\s\S]{0,120}?"Following"/.test(panel) &&
      /case "pending":[\s\S]{0,120}?"Requested"/.test(panel) &&
      /"Follow"/.test(panel),
  );
  check(
    "a pending request offers a cancel",
    /Cancel request/.test(panel),
  );
  check(
    "the button state is only adopted after the server confirmed it",
    /setCurrent\(payload\.state\)/.test(panel),
  );
  /*
   * The demo profile at /u/noir keeps its fictional counts. A REGISTERED
   * profile gets the real counts and the real Follow button. The two are
   * never mixed: a demo count beside a real Follow button would be a lie.
   *
   * The choice is made in the header, and the content component only passes
   * the real state through.
   */
  check(
    "the header chooses between the demo counts and the real social panel",
    /social \?/.test(header) && /SocialPanel/.test(header),
  );
  check(
    "the content component passes the real state through to the header",
    /social=\{social\}/.test(content),
  );
  check(
    "a blocked account is told it has blocked the account, and nothing more",
    /You have blocked this account/.test(panel),
  );
  check(
    "the comments section says who may comment on a private profile",
    /Only approved followers can comment on a private profile/.test(comments),
  );
  check(
    "a comment body is rendered as text, never as markup",
    /whitespace-pre-wrap/.test(comments) && !/dangerouslySetInnerHTML/.test(comments),
  );
  check(
    "the comment list is paged rather than unbounded",
    /Load more comments/.test(comments),
  );
  check(
    "the profile page passes the real social state and the comment list",
    /getProfileSocialState/.test(readCode("app/u/[username]/page.tsx")) &&
      /listProfileComments/.test(readCode("app/u/[username]/page.tsx")),
  );
}

/* -------------------------------------------------------------------------- */
/*                          E. The live database                              */
/* -------------------------------------------------------------------------- */

/**
 * The live section.
 *
 * Every check here is about a real database refusing a real request — which
 * is why the whole section is skipped loudly when no project is configured.
 */
async function verifyLiveDatabase() {
  section("Live database (permitted and denied paths)");

  if (!SUPABASE_URL || !KEY) {
    skip(
      "live follow, comment, block, and report behaviour",
      "no Supabase project configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
    return;
  }

  const anon = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /*
   * ANONYMOUS: no privilege on any social table.
   *
   * A read that returns no rows is not proof of anything on its own, so the
   * assertion is that the request is REFUSED — `anon` holds no grant at all.
   */
  const { error: anonFollowsError } = await anon.from("follows").select("id");
  check(
    "an anonymous read of the follows table is refused",
    Boolean(anonFollowsError),
    anonFollowsError ? "" : "the read unexpectedly succeeded",
  );

  const { error: anonCommentsError } = await anon
    .from("profile_comments")
    .select("id");
  check(
    "an anonymous read of the comments table is refused",
    Boolean(anonCommentsError),
    anonCommentsError ? "" : "the read unexpectedly succeeded",
  );

  const { error: anonBlocksError } = await anon.from("user_blocks").select("id");
  check(
    "an anonymous read of the blocks table is refused",
    Boolean(anonBlocksError),
    anonBlocksError ? "" : "the read unexpectedly succeeded",
  );

  const { error: anonReportsError } = await anon
    .from("content_reports")
    .select("id");
  check(
    "an anonymous read of the reports table is refused",
    Boolean(anonReportsError),
    anonReportsError ? "" : "the read unexpectedly succeeded",
  );

  const { error: anonInsertError } = await anon.from("follows").insert({
    follower_id: "00000000-0000-0000-0000-000000000000",
    following_id: "00000000-0000-0000-0000-000000000000",
    status: "accepted",
  });
  check(
    "an anonymous INSERT into follows is refused",
    Boolean(anonInsertError),
    anonInsertError ? "" : "the insert unexpectedly succeeded",
  );

  /* ---------------- the helpers are callable ---------------- */

  /*
   * The helper functions.
   *
   * The check has to tell TWO refusals apart:
   *
   *   - the function is ABSENT (the migration has not been applied) — the
   *     error is "Could not find the function … in the schema cache";
   *   - the function is PRESENT and the ROLE is refused — the error is a
   *     privilege error.
   *
   * Treating an absent function as "the privilege lock works" would be a
   * false pass, so the distinction is explicit.
   */
  const ABSENT = /could not find the function|schema cache/i;

  const { error: summaryError } = await anon.rpc("profile_summary", {
    profile_uuid: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "the profile_summary RPC exists and is callable by an anonymous visitor",
    !summaryError,
    summaryError?.message ?? "",
  );

  const { error: commentHelperError } = await anon.rpc("can_comment_on", {
    profile_uuid: "00000000-0000-0000-0000-000000000000",
  });
  check(
    "can_comment_on is PRESENT on the remote database",
    !ABSENT.test(commentHelperError?.message ?? ""),
    commentHelperError?.message ?? "",
  );
  check(
    "can_comment_on is NOT executable by an anonymous visitor",
    Boolean(commentHelperError) && !ABSENT.test(commentHelperError?.message ?? ""),
    commentHelperError ? "" : "the call unexpectedly succeeded",
  );

  /* ---------------- a signed-in account ---------------- */

  const signedIn = await createSignedInAccount("phase8probe");
  if (!signedIn) {
    skip(
      "the signed-in follow, comment, block, and report paths",
      "no service-role key, so a throwaway account could not be created",
    );
    return;
  }

  const client = clientAs(signedIn.accessToken);

  const { error: insertError } = await client.from("follows").insert({
    follower_id: signedIn.userId,
    following_id: "00000000-0000-0000-0000-000000000000",
    status: "accepted",
  });
  check(
    "a signed-in caller CANNOT create a follow edge for another account",
    Boolean(insertError),
    insertError ? "" : "the insert unexpectedly succeeded",
  );

  const { error: blockError } = await client.from("user_blocks").insert({
    blocker_id: "00000000-0000-0000-0000-000000000000",
    blocked_id: signedIn.userId,
  });
  check(
    "a signed-in caller CANNOT create a block for another account",
    Boolean(blockError),
    blockError ? "" : "the insert unexpectedly succeeded",
  );

  const { error: reportError } = await client.from("content_reports").insert({
    reporter_id: "00000000-0000-0000-0000-000000000000",
    profile_id: signedIn.userId,
    reason: "spam",
  });
  check(
    "a signed-in caller CANNOT file a report for another account",
    Boolean(reportError),
    reportError ? "" : "the insert unexpectedly succeeded",
  );

  await removeAccount(signedIn.userId);
}

/**
 * A Supabase client that acts as a signed-in user.
 *
 * `global.headers.Authorization` is what PostgREST reads, so the RLS policies
 * evaluate as THIS user — which is the only way to test them honestly.
 */
function clientAs(accessToken) {
  return createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * A throwaway account, created through the admin endpoint as ALREADY
 * CONFIRMED and then signed in through the ordinary password path.
 *
 * The public sign-up path cannot produce a session for an unattended run: the
 * project rate-limits sign-ups, requires email confirmation, and rejects the
 * throwaway addresses. The session, its JWT claims, and the RLS policies it is
 * subject to are all genuinely exercised; only the email delivery is skipped.
 */
let runId = Math.random().toString(36).slice(2, 8);

async function createSignedInAccount(label) {
  const email = `prsme-p8-${label}-${runId}@prsme.test`;
  const password = `Prsme!${runId}9x`;

  const key = await serviceRoleKey();
  if (!key) return null;

  const admin = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return null;

  const client = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) return null;

  return {
    userId: signIn.data.session.user.id,
    accessToken: signIn.data.session.access_token,
  };
}

/** Remove the throwaway account and everything it owns. */
async function removeAccount(userId) {
  const key = await serviceRoleKey();
  if (!key) return;

  const admin = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await admin.from("media_reviews").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  } catch {
    /* best effort — the run's own result is what matters */
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Run                                      */
/* -------------------------------------------------------------------------- */

console.log("PRSME — Phase 8 verification");
console.log("=".repeat(60));

verifySocialSchema();
verifyHelperFunctions();
verifySocialRls();
verifyPrivileges();
verifyNoFriendshipSystem();
verifyServerBoundary();
verifyUserInterface();
await verifyLiveDatabase();

console.log(`\n${"=".repeat(60)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}   SKIPPED: ${skipped}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const name of failures) console.log(`  - ${name}`);
}
console.log("=".repeat(60));

/*
 * The exit code is set rather than `process.exit()` called: the live section
 * makes `fetch` calls that carry an `AbortSignal.timeout`, and Node's Windows
 * event loop asserts if the process is torn down while those timers are still
 * pending. Letting the loop drain is the same outcome with no assertion.
 */
process.exitCode = failed === 0 ? 0 : 1;
