/**
 * Smoke-test every Phase 5 route against a running server.
 *
 * Usage:
 *   node scripts/phase5-smoke.mjs [baseUrl]
 *
 * Verifies the property the brief cares about most: with NO Supabase project
 * configured, the demo and every existing page still render, the new auth pages
 * render their "not configured" state rather than crashing, and a private /
 * unknown profile does not resolve.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const ROUTES = [
  { path: "/u/noir", expect: 200, mustContain: ["Noir"], label: "demo profile (SSR)" },
  { path: "/", expect: 200, label: "landing page" },
  { path: "/studio", expect: 200, label: "studio (guest)" },
  { path: "/sign-in", expect: 200, label: "sign in" },
  { path: "/sign-up", expect: 200, label: "sign up" },
  { path: "/forgot-password", expect: 200, label: "forgot password" },
  { path: "/reset-password", expect: 200, label: "reset password" },
  { path: "/onboarding", expect: 200, label: "onboarding (unconfigured -> shell)" },
  { path: "/account", expect: 200, label: "account (unconfigured)" },
  { path: "/u/doesnotexist", expect: 404, label: "unknown profile 404s" },
  /*
   * 503, not 401: the route checks configuration before authentication, so
   * "this build has no project" is reported as unavailable rather than as
   * "you are not signed in". The latter would be a misleading answer to a
   * caller who cannot fix it by signing in.
   */
  { path: "/api/profile", expect: 503, label: "profile API reports unconfigured (503)" },
];

let passed = 0;
let failed = 0;

console.log(`PRSME — Phase 5 route smoke test against ${BASE}\n`);

for (const route of ROUTES) {
  let status = 0;
  let body = "";
  try {
    const response = await fetch(`${BASE}${route.path}`, {
      redirect: "manual",
      headers: { accept: "text/html,application/json" },
    });
    status = response.status;
    body = await response.text();
  } catch (error) {
    failed++;
    console.log(`  FAIL ${route.label} — ${error.message}`);
    continue;
  }

  const okStatus = status === route.expect;
  const missing = (route.mustContain ?? []).filter((needle) => !body.includes(needle));

  if (okStatus && missing.length === 0) {
    passed++;
    console.log(`  ok   ${route.label} — ${status}`);
  } else {
    failed++;
    const why = !okStatus
      ? `expected ${route.expect}, got ${status}`
      : `missing: ${missing.join(", ")}`;
    console.log(`  FAIL ${route.label} — ${why}`);
  }
}

/*
 * The critical regression: with no Supabase configured, the auth pages must
 * render an explanatory state, not a stack trace. We assert the copy is present
 * rather than merely that the page returned 200, because a 200 carrying an
 * error boundary would otherwise pass.
 */
console.log("");
for (const [path, needle] of [
  ["/sign-in", "Accounts"],
  ["/sign-up", "Accounts"],
  ["/sign-in", "demo profile"],
]) {
  try {
    const body = await (await fetch(`${BASE}${path}`)).text();
    if (body.includes(needle)) {
      passed++;
      console.log(`  ok   ${path} shows the not-configured state ("${needle}")`);
    } else {
      failed++;
      console.log(`  FAIL ${path} missing not-configured copy ("${needle}")`);
    }
  } catch (error) {
    failed++;
    console.log(`  FAIL ${path} — ${error.message}`);
  }
}

console.log(`\npassed ${passed}   failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);