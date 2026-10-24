/**
 * Phase 6.1 — private review content must not leak through any surface.
 *
 * The brief asks specifically about:
 *
 *   - an API response
 *   - page metadata (the <meta> tags, the Open Graph tags)
 *   - an incorrectly cached response
 *
 * A private profile's published review is real data in the database. It must
 * be invisible to a visitor everywhere, and it must not be handed to a
 * visitor by a shared cache.
 */
import { createClient } from "@supabase/supabase-js";
import { REST_URL, ANON_KEY } from "./harness.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";

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

/* ---- an author with a private profile and a published review ---- */
const RUN = Date.now().toString(36);
const email = `leak-${RUN}@example.test`;
const password = "phase6-flow-password-123";

const signup = await fetch(`${REST_URL}/auth/v1/signup`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON_KEY },
  body: JSON.stringify({ email, password }),
});
const signupBody = await signup.json();
const token = signupBody.access_token;
const userId = signupBody.user?.id;

const client = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

const username = `leak${RUN}`.toLowerCase().slice(0, 24);
await client.from("profiles").insert({
  user_id: userId,
  username,
  visibility: "public",
});

const { data: media } = await client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: `leak-${RUN}`,
    kind: "movie",
    title: `Leak Film ${RUN}`,
    creator: "A Director",
  })
  .select()
  .single();

const SECRET = `SECRETBODY-${RUN}-this-must-never-be-public`;
const { data: review } = await client
  .from("media_reviews")
  .insert({
    user_id: userId,
    media_id: media.id,
    rating: 9.5,
    title: `Secret Headline ${RUN}`,
    body: SECRET,
    status: "published",
  })
  .select()
  .single();

console.log(`\nSeeded a published review by ${username} (public profile).\n`);

// A second, unrelated account, so "anonymous" and "other account" are both
// covered.
const otherEmail = `leakother-${RUN}@example.test`;
const otherSignup = await fetch(`${REST_URL}/auth/v1/signup`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON_KEY },
  body: JSON.stringify({ email: otherEmail, password }),
});
const otherBody = await otherSignup.json();
const otherCookie = `sb-${new URL(BASE).hostname.split(".")[0]}-auth-token=${encodeURIComponent(
  JSON.stringify({
    access_token: otherBody.access_token,
    token_type: "bearer",
    expires_in: otherBody.expires_in,
    expires_at: otherBody.expires_at,
    refresh_token: otherBody.refresh_token,
    user: otherBody.user,
  }),
)}`;

/* ---- go private ---- */
await client.from("profiles").update({ visibility: "private" }).eq("user_id", userId);

const anon = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ---- 1. the REST API ---- */
const { data: apiRows } = await anon
  .from("media_reviews")
  .select("id, body, title")
  .eq("id", review.id);

check(
  "the REST API does not return a private profile's review to a visitor",
  (apiRows?.length ?? 0) === 0,
  `the visitor received ${apiRows?.length ?? 0} row(s)`,
);

const { data: apiByBody } = await anon
  .from("media_reviews")
  .select("id, body")
  .ilike("body", `%${RUN}%`);

check(
  "the REST API returns no row carrying the private review's body",
  (apiByBody?.length ?? 0) === 0,
  `the visitor received ${apiByBody?.length ?? 0} row(s)`,
);

/* ---- 2. the rendered pages ---- */
async function fetchPage(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const html = await res.text();
  return { status: res.status, html, headers: res.headers };
}

const anonDiscover = await fetchPage("/discover");
check(
  "Discover does not carry the private review's body",
  !anonDiscover.html.includes(SECRET),
  "the body was in the Discover HTML",
);
check(
  "Discover does not link the private review",
  !anonDiscover.html.includes(`/review/${review.id}`),
  "the review was linked from the Discover HTML",
);
check(
  "Discover does not carry the private review's headline",
  !anonDiscover.html.includes(`Secret Headline ${RUN}`),
  "the headline was in the Discover HTML",
);

const anonMedia = await fetchPage(`/media/${media.id}`);
check(
  "the media page does not carry the private review's body",
  !anonMedia.html.includes(SECRET),
  "the body was in the media page HTML",
);
check(
  "the media page does not link the private review",
  !anonMedia.html.includes(`/review/${review.id}`),
  "the review was linked from the media page HTML",
);

/* ---- 3. page metadata ---- */
const anonReview = await fetchPage(`/review/${review.id}`);
check(
  "the review page returns not-found for a visitor",
  anonReview.status === 404,
  `status ${anonReview.status}`,
);
check(
  "the review page's metadata does not carry the private body",
  !anonReview.html.includes(SECRET),
  "the body was in the review page HTML",
);
check(
  "the review page's metadata does not carry the private headline",
  !anonReview.html.includes(`Secret Headline ${RUN}`),
  "the headline was in the review page HTML",
);
check(
  "the review page's metadata does not leak the private rating",
  !anonReview.html.includes("9.5"),
  "the rating was in the review page HTML",
);

/* ---- 4. the author's public profile route ---- */
const anonProfile = await fetchPage(`/u/${username}`);
check(
  "the private profile's route returns not-found for a visitor",
  anonProfile.status === 404,
  `status ${anonProfile.status}`,
);
check(
  "the private profile's page does not carry the review's body",
  !anonProfile.html.includes(SECRET),
  "the body was in the profile HTML",
);

/* ---- 5. another signed-in account ---- */
const otherDiscover = await fetchPage("/discover", { cookie: otherCookie });
check(
  "another account's Discover does not carry the private body",
  !otherDiscover.html.includes(SECRET),
  "the body was in the other account's Discover HTML",
);

const otherReviewPage = await fetchPage(`/review/${review.id}`, {
  cookie: otherCookie,
});
check(
  "another account's review page returns not-found",
  otherReviewPage.status === 404,
  `status ${otherReviewPage.status}`,
);

/* ---- 6. caching ---- */
const cacheHeaders = {
  "cache-control": anonDiscover.headers.get("cache-control") ?? "",
  "x-nextjs-cache": anonDiscover.headers.get("x-nextjs-cache") ?? "",
  "vary": anonDiscover.headers.get("vary") ?? "",
};
console.log("\n  Discover's cache headers:", JSON.stringify(cacheHeaders, null, 2));

check(
  "the Discover response is not publicly cacheable",
  !/public/i.test(cacheHeaders["cache-control"]),
  `cache-control was "${cacheHeaders["cache-control"]}"`,
);

check(
  "the Discover response varies on the cookie",
  /cookie/i.test(cacheHeaders.vary) || !cacheHeaders["x-nextjs-cache"],
  `vary was "${cacheHeaders.vary}" and x-nextjs-cache was "${cacheHeaders["x-nextjs-cache"]}"`,
);

/*
 * The strongest caching check: the author's OWN view and the visitor's view of
 * the same page must differ. If a shared cache served one to the other, the
 * visitor would receive the author's private review.
 */
const ownerCookie = `sb-${new URL(BASE).hostname.split(".")[0]}-auth-token=${encodeURIComponent(
  JSON.stringify({
    access_token: token,
    token_type: "bearer",
    expires_in: signupBody.expires_in,
    expires_at: signupBody.expires_at,
    refresh_token: signupBody.refresh_token,
    user: signupBody.user,
  }),
)}`;

const ownerDiscover = await fetchPage("/discover", { cookie: ownerCookie });
check(
  "the author's own Discover still carries their review",
  ownerDiscover.html.includes(`/review/${review.id}`),
  "the author's own review was missing from their Discover",
);
check(
  "a visitor's Discover and the author's Discover differ",
  ownerDiscover.html !== anonDiscover.html,
  "the two responses were byte-identical, so the cache cannot be per-viewer",
);

const ownerReviewPage = await fetchPage(`/review/${review.id}`, {
  cookie: ownerCookie,
});
check(
  "the author can still open their own review",
  ownerReviewPage.status === 200,
  `status ${ownerReviewPage.status}`,
);
check(
  "the author's own review page carries their body",
  ownerReviewPage.html.includes(SECRET),
  "the body was missing from the author's own review page",
);

/* ---- 7. back to public: the review returns ---- */
await client.from("profiles").update({ visibility: "public" }).eq("user_id", userId);

const anonAfterPublic = await fetchPage("/discover");
check(
  "the review returns to Discover when the profile goes public again",
  anonAfterPublic.html.includes(`/review/${review.id}`),
  "the review did not come back",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);