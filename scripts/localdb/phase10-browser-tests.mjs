/**
 * Phase 10 — the moderation dashboard, driven in a real browser.
 *
 * WHAT IT CHECKS
 *
 * The SQL suite proves the moderation RULES. This suite proves the
 * INTERFACE, and it proves the BOUNDARY:
 *
 *   - an ordinary account cannot reach the dashboard at all, and is not told
 *     that a moderation system exists;
 *   - a moderator sees the queue, with the counts and the filters;
 *   - a consequential action asks for a reason and a confirmation before it
 *     is sent;
 *   - the action goes through, the queue moves, and the audit trail records
 *     it;
 *   - the layout holds at both widths.
 *
 * WHAT IT SETS UP
 *
 * Three accounts: a moderator, a reporter, and the reported account. The
 * moderator is put on the roster through the database's own `grant_moderator`
 * function — the same door the operator script uses — so the fixture is a
 * real moderator rather than a row inserted behind the database's back.
 *
 * The report is filed through the ordinary insert path, so the fixture is a
 * real report.
 *
 * It is the same shape as `scripts/localdb/phase9-browser-tests.mjs`, and it
 * uses the same CDP helper.
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
/*                          The fixture: three accounts                        */
/* -------------------------------------------------------------------------- */

const password = "phase10-browser-password-123";

async function createAccount(label) {
  const email = `p10-${label}-${RUN}@example.test`;

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

  const username = `p10${label}${RUN}`.toLowerCase().slice(0, 24);
  await client.from("profiles").insert({
    user_id: userId,
    username,
    visibility: "public",
    profile_state: { version: 1, displayName: username },
  });

  return { email, username, userId, token, client };
}

const moderator = await createAccount("mod");
const reporter = await createAccount("rep");
const reported = await createAccount("sub");

if (!moderator || !reporter || !reported) {
  console.error("Could not create the fixture accounts.");
  process.exit(1);
}

/*
 * The moderator goes on the roster through the database's own function.
 *
 * The function refuses to run for anybody who is not an operator, so this
 * runs as the database owner — the same path the operator script uses. The
 * alternative, inserting the row directly, would skip the function that
 * decides who may be a moderator, and the fixture would not be a real
 * moderator.
 */
const db = adminClient();
await db.connect();

try {
  await db.query("select public.grant_moderator($1, $2)", [
    moderator.username,
    "the fixture moderator",
  ]);
} catch (error) {
  console.error(`Could not grant the moderator role: ${error.message}`);
  process.exit(1);
}

/* The report. Filed through the ordinary insert path. */

/*
 * Each width needs its OWN report.
 *
 * A dismissal closes a report — the database refuses to dismiss one that has
 * already moved on — so the second width would otherwise be acting on a report
 * the first width had already closed, and the assertion about the dismissal
 * would be describing the refusal instead.
 */
const filedReports = [];

async function fileReport() {
  const { data, error } = await reporter.client
    .from("content_reports")
    .insert({
      reporter_id: reporter.userId,
      profile_id: reported.userId,
      reason: "spam",
      details: "This account is pretending to be somebody else.",
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Could not file the report: ${error.message}`);
    process.exit(1);
  }

  filedReports.push(data.id);
  return data.id;
}

await fileReport();

console.log(
  `\nFixture: @${moderator.username} is a moderator; ` +
    `@${reporter.username} reported @${reported.username}\n`,
);

/* -------------------------------------------------------------------------- */
/*                              The browser                                   */
/* -------------------------------------------------------------------------- */

const browser = await connect();

const WIDTHS = [
  { label: "mobile 390px", width: 390, height: 844 },
  { label: "desktop 1280px", width: 1280, height: 900 },
];

/*
 * The suite body runs inside a try, so that an unexpected error — a browser
 * that will not navigate, a page that throws — still reaches the cleanup.
 * Without it, a crashed run leaves a moderator on the roster and three real
 * accounts behind, and the next run fails for a reason it cannot explain.
 */
let unexpected = null;

try {

/** Sign in through the real form. */
async function signIn(email) {
  await browser.goto(`${BASE}/sign-in`, { waitMs: 1500 });

  const submitted = await browser.evalJs(
    `
    const email = document.querySelector('input[type="email"]');
    const pass = document.querySelector('input[type="password"]');
    if (!email || !pass) return { ok: false, why: 'no form' };
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(email, ${JSON.stringify(email)});
    set(pass, ${JSON.stringify(password)});
    email.closest('form').requestSubmit();
    return { ok: true };
  `,
    { once: true },
  );

  if (!submitted?.ok) return false;

  await new Promise((resolve) => setTimeout(resolve, 3000));
  return true;
}

/** Sign out, so the next account starts from a clean session. */
async function signOut() {
  await browser.evalJs(
    `
    const response = await fetch('${REST_URL}/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: ${JSON.stringify(ANON_KEY)} },
    });
    return response.status;
  `,
    { once: true },
  );

  await browser.evalJs(
    `
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('auth-token') || key.includes('sb-')) localStorage.removeItem(key);
      }
      for (const key of Object.keys(document.cookie ? {} : {})) {}
    } catch (e) {}
    return true;
  `,
    { once: true },
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/* -------------------------------------------------------------------------- */
/*                    The boundary: an ordinary account                        */
/* -------------------------------------------------------------------------- */

section("An ordinary account cannot reach the dashboard");

await browser.setViewport(1280, 900);

const signedIn = await signIn(reporter.email);
check("the ordinary account signed in", signedIn === true);

await browser.goto(`${BASE}/admin/moderation`, { waitMs: 2500 });

const refused = await browser.evalJs(`
  return {
    url: location.pathname,
    hasDashboard: Boolean(document.querySelector('[data-testid="moderation-dashboard"]')),
    hasQueue: Boolean(document.querySelector('[data-testid="moderation-queue"]')),
    bodyText: document.body.innerText.slice(0, 400),
  };
`);

check(
  "the ordinary account is redirected away from the dashboard",
  refused?.url !== "/admin/moderation",
  `path=${refused?.url}`,
);
check(
  "the ordinary account never sees the dashboard",
  refused?.hasDashboard === false,
);
check(
  "the ordinary account is not shown the queue",
  refused?.hasQueue === false,
);
check(
  "the ordinary account is not told a moderation system exists",
  !/moderation|queue|report/i.test(refused?.bodyText ?? ""),
  JSON.stringify(refused?.bodyText),
);

/*
 * The API is the boundary too.
 *
 * The page being redirected is not the same as the API being refused: a
 * client could call the API directly, without ever loading the page. So the
 * route is asked for as well, and it has to answer 403.
 */
const apiStatus = await browser.evalJs(`
  const response = await fetch('/api/moderation');
  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: payload.ok,
    error: payload.error,
    hasReports: 'reports' in payload,
    hasCounts: 'counts' in payload,
  };
`);

check(
  "the API refuses the ordinary account with 403",
  apiStatus?.status === 403,
  `status=${apiStatus?.status}`,
);
check(
  "the API does not leak the queue",
  apiStatus?.hasReports === false && apiStatus?.hasCounts === false,
  JSON.stringify(apiStatus),
);

const postStatus = await browser.evalJs(`
  const response = await fetch('/api/moderation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'dismiss', reportId: '00000000-0000-0000-0000-000000000000', reason: 'trying' }),
  });
  return { status: response.status };
`);

check(
  "the API refuses an ordinary account's ACTION with 403",
  postStatus?.status === 403,
  `status=${postStatus?.status}`,
);

await signOut();

/* -------------------------------------------------------------------------- */
/*                       The moderator: the queue                              */
/* -------------------------------------------------------------------------- */

for (const { label, width, height } of WIDTHS) {
  section(`${label}`);

  await browser.setViewport(width, height);

  const modSignedIn = await signIn(moderator.email);
  check(`${label}: the moderator signed in`, modSignedIn === true);

  /*
   * A fresh report for this width.
   *
   * The one before it was closed by the previous width's dismissal, and the
   * database refuses to dismiss a report that has already moved on.
   */
  const reportId = await fileReport();

  await browser.goto(`${BASE}/admin/moderation`, { waitMs: 2500 });

  const dashboard = await browser.evalJs(`
    const rows = document.querySelectorAll('[data-testid="moderation-report-row"]');
    const counts = document.querySelector('[data-testid="moderation-counts"]');
    return {
      url: location.pathname,
      hasDashboard: Boolean(document.querySelector('[data-testid="moderation-dashboard"]')),
      rowCount: rows.length,
      firstRow: rows[0] ? rows[0].innerText : null,
      countText: counts ? counts.innerText : null,
      tabCount: document.querySelectorAll('[role="tab"]').length,
      hasSearch: Boolean(document.querySelector('[data-testid="moderation-search"]')),
      hasReasonFilter: Boolean(document.querySelector('[data-testid="moderation-reason-filter"]')),
      hasRoster: Boolean(document.querySelector('[data-testid="moderation-roster"]')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(
    `${label}: the moderator reaches the dashboard`,
    dashboard?.url === "/admin/moderation" && dashboard?.hasDashboard === true,
    `path=${dashboard?.url}`,
  );
  check(
    `${label}: the queue lists the report`,
    (dashboard?.rowCount ?? 0) >= 1,
    `rows=${dashboard?.rowCount}`,
  );
  check(
    `${label}: the row names the reported account`,
    (dashboard?.firstRow ?? "").includes(reported.username),
    JSON.stringify(dashboard?.firstRow),
  );
  check(
    `${label}: the row shows the reason`,
    /spam/i.test(dashboard?.firstRow ?? ""),
    JSON.stringify(dashboard?.firstRow),
  );
  check(
    `${label}: the counts are shown`,
    /\d/.test(dashboard?.countText ?? ""),
    JSON.stringify(dashboard?.countText),
  );
  check(
    `${label}: the status tabs are offered`,
    (dashboard?.tabCount ?? 0) === 5,
    `tabs=${dashboard?.tabCount}`,
  );
  check(`${label}: the search box is there`, dashboard?.hasSearch === true);
  check(
    `${label}: the reason filter is there`,
    dashboard?.hasReasonFilter === true,
  );
  check(`${label}: the roster is shown`, dashboard?.hasRoster === true);
  check(
    `${label}: the dashboard does not overflow`,
    (dashboard?.overflow ?? 1) <= 0,
    `overflow=${dashboard?.overflow}`,
  );

  /*
   * The REPORTER IS NEVER SHOWN.
   *
   * The queue says what was reported and what it is about. It must not say
   * who filed it, and there must be no field for it — so the reporter's
   * handle appears nowhere on the page.
   */
  const mentionsReporter = await browser.evalJs(`
    return {
      inQueue: document.querySelector('[data-testid="moderation-queue"]')?.innerText ?? '',
      inDetail: document.querySelector('[data-testid="moderation-detail"]')?.innerText ?? '',
      wholePage: document.body.innerText,
    };
  `);

  check(
    `${label}: the reporter's handle is not in the queue`,
    !(mentionsReporter?.inQueue ?? "").includes(reporter.username),
  );
  check(
    `${label}: the reporter's handle is not on the page`,
    !(mentionsReporter?.wholePage ?? "").includes(reporter.username),
  );

  /* ---- opening a report ---- */

  await browser.evalJs(
    `
    const row = document.querySelector('[data-testid="moderation-report-row"]');
    if (row) row.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const detail = await browser.evalJs(`
    const panel = document.querySelector('[data-testid="moderation-detail"]');
    return {
      hasDetail: Boolean(panel),
      text: panel ? panel.innerText : null,
      hasClaim: Boolean(document.querySelector('[data-testid="moderation-claim"]')),
      hasDismiss: Boolean(document.querySelector('[data-testid="moderation-dismiss"]')),
      hasResolve: Boolean(document.querySelector('[data-testid="moderation-resolve"]')),
      hasRestrict: Boolean(document.querySelector('[data-testid="moderation-restrict"]')),
      hasConfirm: Boolean(document.querySelector('[data-testid="moderation-confirm"]')),
    };
  `);

  check(`${label}: the report opens`, detail?.hasDetail === true);
  check(`${label}: the actions are offered`, detail?.hasClaim === true && detail?.hasDismiss === true);
  check(`${label}: resolve is offered`, detail?.hasResolve === true);
  check(`${label}: restrict is offered`, detail?.hasRestrict === true);
  check(
    `${label}: the reporter's handle is not in the detail`,
    !(detail?.text ?? "").includes(reporter.username),
  );

  /* ---- the confirmation asks first ---- */

  await browser.evalJs(
    `
    const button = document.querySelector('[data-testid="moderation-dismiss"]');
    if (button) button.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 800));

  const confirm = await browser.evalJs(`
    const panel = document.querySelector('[data-testid="moderation-confirm"]');
    return {
      hasConfirm: Boolean(panel),
      text: panel ? panel.innerText : null,
      hasReason: Boolean(document.querySelector('[data-testid="moderation-action-reason"]')),
      hasSubmit: Boolean(document.querySelector('[data-testid="moderation-confirm-submit"]')),
    };
  `);

  check(
    `${label}: a dismissal asks for confirmation`,
    confirm?.hasConfirm === true,
  );
  check(
    `${label}: the confirmation asks for a reason`,
    confirm?.hasReason === true,
  );
  check(
    `${label}: the confirmation says it is recorded`,
    /audit/i.test(confirm?.text ?? ""),
    JSON.stringify(confirm?.text),
  );

  /* ---- the reason is required ---- */

  await browser.evalJs(
    `
    const button = document.querySelector('[data-testid="moderation-confirm-submit"]');
    if (button) button.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const withoutReason = await browser.evalJs(`
    return {
      error: document.querySelector('[data-testid="moderation-error"]')?.textContent ?? null,
      stillOpen: Boolean(document.querySelector('[data-testid="moderation-confirm"]')),
    };
  `);

  check(
    `${label}: a dismissal without a reason is refused`,
    /reason/i.test(withoutReason?.error ?? ""),
    JSON.stringify(withoutReason?.error),
  );
  check(
    `${label}: the confirmation stays open`,
    withoutReason?.stillOpen === true,
  );

  /* ---- with a reason, it goes through ---- */

  await browser.evalJs(
    `
    const field = document.querySelector('[data-testid="moderation-action-reason"]');
    if (field) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, 'Reviewed the profile; the impersonation is clear.');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 500));

  await browser.evalJs(
    `
    const button = document.querySelector('[data-testid="moderation-confirm-submit"]');
    if (button) button.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const afterDismiss = await browser.evalJs(`
    return {
      notice: document.querySelector('[data-testid="moderation-notice"]')?.textContent ?? null,
      error: document.querySelector('[data-testid="moderation-error"]')?.textContent ?? null,
      confirmGone: !document.querySelector('[data-testid="moderation-confirm"]'),
      history: document.querySelector('[data-testid="moderation-history"]')?.innerText ?? null,
      audit: document.querySelector('[data-testid="moderation-audit"]')?.innerText ?? null,
    };
  `);

  check(
    `${label}: the dismissal succeeds`,
    afterDismiss?.notice !== null && afterDismiss?.notice !== undefined,
    JSON.stringify(afterDismiss),
  );
  check(
    `${label}: the dismissal is written to the history`,
    /dismiss/i.test(afterDismiss?.history ?? ""),
    JSON.stringify(afterDismiss?.history),
  );
  check(
    `${label}: the dismissal is written to the audit trail`,
    /dismiss/i.test(afterDismiss?.audit ?? ""),
    JSON.stringify(afterDismiss?.audit),
  );

  /*
   * And the DATABASE agrees.
   *
   * The interface can say it worked; only the database can say the report
   * actually moved and the audit record was really written.
   */
  const state = await db.query(`
    select
      (select status from public.content_reports where id = $1) as status,
      (select count(*)::int from public.moderation_actions
        where action = 'dismissed' and moderator_id = $2) as actions,
      (select count(*)::int from public.moderation_audit_log
        where action = 'dismissed' and moderator_id = $2) as audit
  `, [reportId, moderator.userId]);

  check(
    `${label}: the report really was dismissed`,
    state.rows[0]?.status === "dismissed",
    `status=${state.rows[0]?.status}`,
  );
  check(
    `${label}: a moderation action was really recorded`,
    (state.rows[0]?.actions ?? 0) >= 1,
    `actions=${state.rows[0]?.actions}`,
  );
  check(
    `${label}: an audit record was really written`,
    (state.rows[0]?.audit ?? 0) >= 1,
    `audit=${state.rows[0]?.audit}`,
  );

  await signOut();
}

/* -------------------------------------------------------------------------- */
/*        The other three actions, each carried all the way through          */
/* -------------------------------------------------------------------------- */

/*
 * The dismissal above is not enough.
 *
 * The three actions below — under review, resolve, restrict — each name their
 * subject differently: a REPORT ID for the first two, a USERNAME for the
 * third. A dashboard that hands the wrong field to any of them produces a
 * request with no subject, the database refuses it, and the interface shows
 * an error instead of doing the thing.
 *
 * So each of the three is carried all the way through: the button is clicked,
 * a reason is typed, the action is confirmed, and then the DATABASE is asked
 * whether it really happened. The interface alone is not trusted — a browser
 * can report success for a request that never landed.
 *
 * Each action gets its own report, because the state machine moves a report
 * forward: a report that has been resolved cannot be moved under review
 * afterwards.
 */
section("The other actions, end to end");

await browser.setViewport(1280, 900);

const actionsSignedIn = await signIn(moderator.email);
check("the moderator signed in for the action tests", actionsSignedIn === true);

/**
 * Open the newest report in the dashboard.
 *
 * The queue is sorted newest-first, so the first row is the report that was
 * just filed.
 */
async function openNewestReport() {
  const reportId = await fileReport();

  await browser.goto(`${BASE}/admin/moderation`, { waitMs: 2500 });

  const opened = await browser.evalJs(`
    const rows = document.querySelectorAll('[data-testid="moderation-report-row"]');
    if (!rows.length) return { ok: false };
    rows[0].click();
    return { ok: true };
  `);

  await new Promise((resolve) => setTimeout(resolve, 1500));

  return { reportId, opened: opened?.ok === true };
}

/**
 * Click an action button, type a reason, and confirm it.
 */
async function performAction(testId, reason) {
  await browser.evalJs(
    `
    const button = document.querySelector('[data-testid="${testId}"]');
    if (button) button.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 800));

  await browser.evalJs(
    `
    const field = document.querySelector('[data-testid="moderation-action-reason"]');
    if (field) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify(reason)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 500));

  await browser.evalJs(
    `
    const button = document.querySelector('[data-testid="moderation-confirm-submit"]');
    if (button) button.click();
    return true;
  `,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 2500));

  return browser.evalJs(`
    return {
      notice: document.querySelector('[data-testid="moderation-notice"]')?.textContent ?? null,
      error: document.querySelector('[data-testid="moderation-error"]')?.textContent ?? null,
    };
  `);
}

/* ---- under review ---- */

const review = await openNewestReport();
check("a report opened for the review action", review.opened === true);

const reviewResult = await performAction(
  "moderation-under-review",
  "Taking a look at this one.",
);

check(
  "the report moves under review without an error",
  reviewResult?.error === null || reviewResult?.error === undefined,
  JSON.stringify(reviewResult),
);

const reviewState = await db.query(
  "select status from public.content_reports where id = $1",
  [review.reportId],
);

check(
  "the report really was moved under review",
  reviewState.rows[0]?.status === "reviewed",
  `status=${reviewState.rows[0]?.status}`,
);

/* ---- resolve ---- */

const resolve = await openNewestReport();
check("a report opened for the resolve action", resolve.opened === true);

const resolveResult = await performAction(
  "moderation-resolve",
  "The impersonation is confirmed and the profile was handled.",
);

check(
  "the report resolves without an error",
  resolveResult?.error === null || resolveResult?.error === undefined,
  JSON.stringify(resolveResult),
);

const resolveState = await db.query(
  "select status from public.content_reports where id = $1",
  [resolve.reportId],
);

check(
  "the report really was resolved",
  resolveState.rows[0]?.status === "actioned",
  `status=${resolveState.rows[0]?.status}`,
);

/* ---- restrict ---- */

const restrict = await openNewestReport();
check("a report opened for the restrict action", restrict.opened === true);

const restrictResult = await performAction(
  "moderation-restrict",
  "Impersonation; posting is suspended.",
);

check(
  "the account is restricted without an error",
  restrictResult?.error === null || restrictResult?.error === undefined,
  JSON.stringify(restrictResult),
);

const restrictState = await db.query(
  `select
     (select count(*)::int from public.account_restrictions
       where user_id = $1 and lifted_at is null) as restrictions,
     (select public.is_restricted($1)) as is_restricted
   `,
  [reported.userId],
);

check(
  "the account really was restricted",
  (restrictState.rows[0]?.restrictions ?? 0) >= 1,
  `restrictions=${restrictState.rows[0]?.restrictions}`,
);
check(
  "the database says the account is restricted",
  restrictState.rows[0]?.is_restricted === true,
  `is_restricted=${restrictState.rows[0]?.is_restricted}`,
);

/*
 * The restriction is lifted again, so the fixture does not leave the reported
 * account unable to post for the next run.
 *
 * `lifted_by` is set along with `lifted_at`, because the table's own check
 * constraint refuses a restriction that is lifted without saying who lifted
 * it. That constraint is the database being honest about the audit trail; the
 * cleanup has to honour it rather than work around it.
 */
await db.query(
  `update public.account_restrictions
     set lifted_at = now(), lifted_by = $2
   where user_id = $1 and lifted_at is null`,
  [reported.userId, moderator.userId],
);

await signOut();
} catch (error) {
  /*
   * An unexpected error is a FAILURE, not a crash.
   *
   * The suite still has to clean up and still has to report, and the report
   * has to say what went wrong rather than leaving the reader with a stack
   * trace and a database full of fixture rows.
   */
  unexpected = error;
  check(
    "the suite ran to the end",
    false,
    error instanceof Error ? error.message : String(error),
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Cleanup                                   */
/* -------------------------------------------------------------------------- */

section("Cleanup");

/*
 * The cleanup runs as the DATABASE OWNER, not as a client.
 *
 * The moderation tables hold no DELETE privilege for the client roles, and
 * the audit log refuses a DELETE from everybody — which is the point of both.
 * So the teardown talks to Postgres directly, the way an operator would, and
 * removes exactly the rows this suite created.
 *
 * It runs in a `finally`, so a suite that fails partway through still cleans
 * up. A fixture left behind is a real moderator on the roster and a real
 * account with a handle somebody could claim — and a leftover roster row
 * would make a later suite fail for a reason it cannot explain.
 */
async function cleanup() {
  /*
   * The audit log first, with the append-only triggers stood down.
   *
   * The trigger refuses a DELETE from the owner as well, which is what makes
   * the trail durable. The fixture's own rows have to go, so the triggers are
   * disabled for the delete and enabled again immediately afterwards.
   */
  await db.query(`
    alter table public.moderation_audit_log
      disable trigger moderation_audit_log_no_update,
      disable trigger moderation_audit_log_no_delete
  `);

  await db.query(
    "delete from public.moderation_audit_log where moderator_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );

  await db.query(`
    alter table public.moderation_audit_log
      enable trigger moderation_audit_log_no_update,
      enable trigger moderation_audit_log_no_delete
  `);

  await db.query(
    "delete from public.moderation_actions where moderator_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  await db.query(
    "delete from public.account_restrictions where user_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  await db.query(
    "delete from public.content_reports where reporter_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  await db.query(
    "delete from public.moderators where user_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  await db.query(
    "delete from public.profiles where user_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  await db.query("delete from auth.users where id = any($1::uuid[])", [
    [moderator.userId, reporter.userId, reported.userId],
  ]);
}

try {
  await cleanup();

  const audit = await db.query(
    "select count(*)::int as count from public.moderation_audit_log where moderator_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  const reports = await db.query(
    "select count(*)::int as count from public.content_reports where reporter_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  const roster = await db.query(
    "select count(*)::int as count from public.moderators where user_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  const profiles = await db.query(
    "select count(*)::int as count from public.profiles where user_id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );
  const accounts = await db.query(
    "select count(*)::int as count from auth.users where id = any($1::uuid[])",
    [[moderator.userId, reporter.userId, reported.userId]],
  );

  check("no audit record is left behind", (audit.rows[0]?.count ?? 1) === 0);
  check("no report is left behind", (reports.rows[0]?.count ?? 1) === 0);
  check("no roster row is left behind", (roster.rows[0]?.count ?? 1) === 0);
  check("no test profile is left behind", (profiles.rows[0]?.count ?? 1) === 0);
  check("no test account is left behind", (accounts.rows[0]?.count ?? 1) === 0);
} catch (error) {
  check("the cleanup ran", false, error.message);
} finally {
  await db.end();
  /*
   * The browser connection is closed last.
   *
   * The CDP WebSocket keeps the event loop alive, so a suite that does not
   * close it prints its result and then HANG — which looks like a slow test
   * and leaves the process running with a fixture in the database.
   */
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

process.exit(0);
