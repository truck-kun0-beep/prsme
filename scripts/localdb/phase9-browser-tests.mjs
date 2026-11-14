/**
 * Phase 9 — the notification centre, driven in a real browser.
 *
 * WHAT IT CHECKS
 *
 * The SQL suites prove the notification RULES. This suite proves the
 * INTERFACE: that the badge appears in the navigation, that the centre lists
 * what happened, that the read and unread states are distinguishable, that
 * the actions work in place, and that the layout holds at both widths.
 *
 * WHAT IT SETS UP
 *
 * Two accounts. The first follows the second, which writes a notification by
 * a database trigger — the same path the application uses, so the fixture is
 * a real event and not a hand-inserted row.
 *
 * The suite then signs in as the RECIPIENT in the browser and drives the
 * centre: open it, read the badge, mark one read, dismiss one, and check the
 * empty state.
 *
 * It is the same shape as `scripts/localdb/browser-tests.mjs`, and it uses the
 * same CDP helper.
 */
import { connect } from "../cdp.mjs";
import { REST_URL, ANON_KEY, adminClient } from "./harness.mjs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const RUN = Date.now().toString(36);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------------------- */
/*                          The fixture: two accounts                         */
/* -------------------------------------------------------------------------- */

const password = "phase9-browser-password-123";

async function createAccount(label) {
  const email = `p9-${label}-${RUN}@example.test`;

  const signup = await fetch(`${REST_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await signup.json();
  const token = body.access_token;
  const userId = body.user?.id;

  if (!token || !userId) return null;

  const client = createClient(REST_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const username = `p9${label}${RUN}`.toLowerCase().slice(0, 24);
  await client.from("profiles").insert({
    user_id: userId,
    username,
    visibility: "public",
    /*
     * The stored document is VERSIONED, and an unreadable one makes the
     * public profile route answer 404.
     *
     * An empty `{}` carries no version, so the profile's draft cannot be
     * rebuilt and the route treats the account as not existing at all. The
     * fixture is meant to be a real account, so it gets a real document.
     */
    profile_state: { version: 1, displayName: username },
  });

  return { email, username, userId, token, client };
}

const follower = await createAccount("fol");
const followed = await createAccount("fwd");

if (!follower || !followed) {
  console.error("Could not create the fixture accounts.");
  process.exit(1);
}

// The follower follows the followed account. The database trigger writes the
// notification — this is the real path, not a hand-made row.
const { error: followError } = await follower.client
  .from("follows")
  .insert({
    follower_id: follower.userId,
    following_id: followed.userId,
    status: "accepted",
  });

if (followError) {
  console.error(`Could not create the follow: ${followError.message}`);
  process.exit(1);
}

console.log(
  `\nFixture: @${follower.username} follows @${followed.username}\n`,
);

/**
 * Put the fixture back to "one unread notification", the way it started.
 *
 * The edge is removed and re-created, which makes the database's own trigger
 * write a fresh notification. The old one goes with the edge, because the
 * notification REFERENCES it.
 */
async function resetNotification() {
  await follower.client
    .from("follows")
    .delete()
    .eq("follower_id", follower.userId)
    .eq("following_id", followed.userId);

  const { error } = await follower.client.from("follows").insert({
    follower_id: follower.userId,
    following_id: followed.userId,
    status: "accepted",
  });

  if (error) {
    console.error(`Could not reset the follow: ${error.message}`);
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/*                              The browser                                   */
/* -------------------------------------------------------------------------- */

const browser = await connect();

const WIDTHS = [
  { label: "mobile 390px", width: 390, height: 844 },
  { label: "desktop 1280px", width: 1280, height: 900 },
];

for (const { label, width, height } of WIDTHS) {
  section(`${label}`);

  await browser.setViewport(width, height);

  /*
   * Each width starts from the SAME state: one unread notification.
   *
   * The first width CONSUMES its notification — it marks it read and then
   * dismisses it — so the second width would otherwise begin with an empty
   * list and a badge of zero, and every assertion about the badge, the
   * unread state and the row's contents would be asserting about nothing.
   *
   * The notification is restored through the same trigger that created it:
   * the edge is deleted and re-inserted, which fires the trigger again. That
   * is the real event path, not a hand-written row.
   */
  await resetNotification();

  /* ---- sign in as the RECIPIENT ---- */

  await browser.goto(`${BASE}/sign-in`, { waitMs: 1500 });

  const signedIn = await browser.evalJs(`
    const email = document.querySelector('input[type="email"]');
    const pass = document.querySelector('input[type="password"]');
    if (!email || !pass) return { ok: false, why: 'no form' };
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(email, ${JSON.stringify(followed.email)});
    set(pass, ${JSON.stringify(password)});
    email.closest('form').requestSubmit();
    return { ok: true };
  `, { once: true });

  check(`${label}: the sign-in form was submitted`, signedIn?.ok === true);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  /* ---- the badge ---- */

  await browser.goto(`${BASE}/u/${follower.username}`, { waitMs: 2000 });

  const badge = await browser.evalJs(`
    const bell = document.querySelector('[data-testid="nav-notifications"]');
    const mark = document.querySelector('[data-testid="nav-notifications-badge"]');
    const bells = document.querySelectorAll('[data-testid="nav-notifications"]');
    return {
      hasBell: Boolean(bell),
      bellCount: bells.length,
      badgeText: mark ? mark.textContent.trim() : null,
      badgeWidth: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
      badgeHeight: mark ? Math.round(mark.getBoundingClientRect().height) : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(`${label}: the navigation has a notification bell`, badge?.hasBell === true);
  check(
    `${label}: there is exactly ONE bell on screen`,
    badge?.bellCount === 1,
    `${badge?.bellCount} bells`,
  );
  check(
    `${label}: the badge shows the unread count`,
    badge?.badgeText === "1",
    `badge=${JSON.stringify(badge?.badgeText)}`,
  );
  check(
    `${label}: the badge is SMALL`,
    (badge?.badgeWidth ?? 99) <= 24 && (badge?.badgeHeight ?? 99) <= 20,
    `${badge?.badgeWidth}x${badge?.badgeHeight}`,
  );
  check(
    `${label}: the navigation does not overflow`,
    (badge?.overflow ?? 1) <= 0,
    `overflow=${badge?.overflow}`,
  );

  /* ---- the centre ---- */

  await browser.goto(`${BASE}/account/notifications`, { waitMs: 2500 });

  const centre = await browser.evalJs(`
    const items = document.querySelectorAll('[data-testid="notification-item"]');
    const first = items[0];
    const list = document.querySelector('[data-testid="notifications-list"]');
    return {
      hasList: Boolean(list),
      itemCount: items.length,
      firstUnread: first ? first.getAttribute('data-read') : null,
      firstType: first ? first.getAttribute('data-type') : null,
      firstText: first ? first.textContent : null,
      firstHref: first ? first.querySelector('[data-testid="notification-link"]')?.getAttribute('href') : null,
      hasEmptyState: Boolean(document.querySelector('[data-testid="notifications-empty"]')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(`${label}: the centre lists the notification`, (centre?.itemCount ?? 0) >= 1);
  check(`${label}: the notification is UNREAD`, centre?.firstUnread === "false");
  check(
    `${label}: the notification names the actor`,
    (centre?.firstText ?? "").includes(follower.username),
    JSON.stringify(centre?.firstText),
  );
  check(
    `${label}: the notification links to the actor's profile`,
    (centre?.firstHref ?? "").includes(`/u/${follower.username}`),
    centre?.firstHref ?? "null",
  );
  check(
    `${label}: the centre does not overflow`,
    (centre?.overflow ?? 1) <= 0,
    `overflow=${centre?.overflow}`,
  );

  /* ---- marking it read ---- */

  await browser.evalJs(`
    const button = document.querySelector('[data-testid="notification-mark-read"]');
    if (button) button.click();
    true;
  `, { once: true });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const afterRead = await browser.evalJs(`
    const items = document.querySelectorAll('[data-testid="notification-item"]');
    const badge = document.querySelector('[data-testid="nav-notifications-badge"]');
    return {
      firstUnread: items[0] ? items[0].getAttribute('data-read') : null,
      badgeText: badge ? badge.textContent.trim() : null,
      hasUnreadDot: Boolean(document.querySelector('[data-testid="notification-unread-dot"]')),
    };
  `);

  check(`${label}: the notification becomes READ`, afterRead?.firstUnread === "true");
  check(
    `${label}: the unread dot is gone`,
    afterRead?.hasUnreadDot === false,
  );
  check(
    `${label}: the badge falls to zero`,
    afterRead?.badgeText === null,
    `badge=${JSON.stringify(afterRead?.badgeText)}`,
  );

  /* ---- dismissing it ---- */

  await browser.evalJs(`
    const button = document.querySelector('[data-testid="notification-dismiss"]');
    if (button) button.click();
    true;
  `, { once: true });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const afterDismiss = await browser.evalJs(`
    const items = document.querySelectorAll('[data-testid="notification-item"]');
    return {
      itemCount: items.length,
      hasEmptyState: Boolean(document.querySelector('[data-testid="notifications-empty"]')),
      emptyText: document.querySelector('[data-testid="notifications-empty"]')?.textContent ?? null,
    };
  `);

  check(`${label}: the dismissed notification leaves the list`, (afterDismiss?.itemCount ?? 99) === 0);
  check(
    `${label}: the empty state appears`,
    afterDismiss?.hasEmptyState === true,
  );
  check(
    `${label}: the empty state says something useful`,
    (afterDismiss?.emptyText ?? "").length > 20,
    JSON.stringify(afterDismiss?.emptyText),
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Cleanup                                   */
/* -------------------------------------------------------------------------- */

section("Cleanup");

/*
 * The cleanup runs as the DATABASE OWNER, not as a client.
 *
 * The notifications table has no DELETE policy and no DELETE privilege for the
 * client roles — which is the point of the table, and which means a client
 * cannot clean up after itself. The same is true of the profiles table: a
 * client may delete its OWN profile row, but the fixture's rows belong to two
 * accounts and neither of them is the caller here.
 *
 * So the teardown talks to Postgres directly, the way an operator would, and
 * removes exactly the rows this suite created — by their ids.
 */
const db = adminClient();
await db.connect();

try {
  await db.query("delete from public.notifications where recipient_id = $1", [
    followed.userId,
  ]);
  await db.query("delete from public.follows where follower_id = $1", [
    follower.userId,
  ]);
  await db.query("delete from public.profiles where user_id = any($1::uuid[])", [
    [follower.userId, followed.userId],
  ]);

  const notifications = await db.query(
    "select count(*)::int as count from public.notifications where recipient_id = $1",
    [followed.userId],
  );
  const profiles = await db.query(
    "select count(*)::int as count from public.profiles where user_id = any($1::uuid[])",
    [[follower.userId, followed.userId]],
  );

  check("no notification is left behind", (notifications.rows[0]?.count ?? 1) === 0);
  check("no test profile is left behind", (profiles.rows[0]?.count ?? 1) === 0);
} finally {
  await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
