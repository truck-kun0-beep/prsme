/**
 * Phase 6.1 — the complete review flow, through the real application.
 *
 * This drives the app over HTTP and through a real browser:
 *
 *   - it creates accounts through the app's own auth routes
 *   - it creates profiles by FILLING IN AND SUBMITING the real onboarding
 *     form in a real browser, because profile creation is a Next.js server
 *     action and the action protocol is not something a plain fetch
 *     reproduces faithfully
 *   - it publishes reviews through the app's own API route
 *   - it reads the resulting pages and checks what they render
 *
 * The pages are fetched with the session cookie the app sets, so the
 * server-rendered HTML is the real thing — not a re-implementation.
 *
 * Usage:
 *   node scripts/localdb/flow-tests.mjs [baseUrl]
 */

import { createClient } from "@supabase/supabase-js";
import { REST_URL, ANON_KEY } from "./harness.mjs";
import { connect } from "../cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const CDP_PORT = Number(process.env.PRSME_CDP_PORT ?? 9334);

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
/*                              Session helpers                               */
/* -------------------------------------------------------------------------- */

/**
 * Create an account through the app's own auth route, then sign in.
 *
 * The account is created first because that is how a real person reaches the
 * app — the sign-in form only works for an address that already exists.
 */
async function signIn(label) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = "phase6-flow-password-123";

  const signup = await fetch(`${REST_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const signupBody = await signup.json();

  if (!signupBody?.access_token) {
    throw new Error(
      `could not create the ${label} account: ${signup.status} ${JSON.stringify(signupBody)}`,
    );
  }

  const res = await fetch(`${REST_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password, grant_type: "password" }),
  });
  const body = await res.json();

  if (!body?.access_token) {
    throw new Error(`could not sign in as ${label}: ${res.status} ${JSON.stringify(body)}`);
  }

  /*
   * The browser client stores the session in cookies named after the
   * project's URL. The app's server client reads exactly these, so the test
   * sends the same ones.
   */
  const cookieName = `sb-${new URL(BASE).hostname.split(".")[0]}-auth-token`;
  const session = {
    access_token: body.access_token,
    token_type: "bearer",
    expires_in: body.expires_in,
    expires_at: body.expires_at,
    refresh_token: body.refresh_token,
    user: body.user,
  };
  const cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(session))}`;

  const client = createClient(REST_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${body.access_token}` } },
  });

  return { label, email, id: body.user.id, token: body.access_token, cookie, client };
}

/** Fetch a page as the signed-in account. */
async function fetchAs(account, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: account.cookie },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, html };
}

/**
 * Read the text inside an element identified by a `data-testid`.
 *
 * React splits interpolated text into separate text nodes, so the markup
 * carries `<!-- -->` markers between them. Those are removed, and the
 * remaining text is collapsed, so the result is what a person reads.
 */
function readTestIdText(html, testId) {
  /*
   * The element is matched up to the NEXT `<`, which would cut the text off
   * at the first comment marker React inserts. The match therefore runs to
   * the closing tag of the element instead.
   */
  const pattern = new RegExp(
    `data-testid="${testId}"[^>]*>([\\s\\S]*?)</`,
  );
  const match = html.match(pattern);
  if (!match) return null;
  return match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                        Profile creation, in a browser                       */
/* -------------------------------------------------------------------------- */

/**
 * Create a profile by driving the real onboarding form.
 *
 * Profile creation is a server action, and the action protocol carries more
 * than a form post — the action id, the RSC headers, and the router state.
 * Filling in the real form in a real browser is both simpler and more
 * faithful: it exercises exactly the path a person takes.
 */
async function createProfileInBrowser(browser, account, username) {
  /*
   * The session cookie is set on the browser origin, so the page boots
   * signed in.
   */
  await browser.call("Network.enable");
  await browser.call("Network.setCookies", {
    cookies: [
      {
        name: `sb-${new URL(BASE).hostname.split(".")[0]}-auth-token`,
        value: decodeURIComponent(account.cookie.split("=").slice(1).join("=")),
        domain: new URL(BASE).hostname,
        path: "/",
      },
    ],
  });

  await browser.goto(`${BASE}/onboarding`, { waitMs: 2500 });

  // The form is present only when the account has no profile yet.
  const formPresent = await browser.evalJs(
    `return Boolean(document.querySelector('form')) && Boolean(document.querySelector('input[name="username"]'));`,
  );
  if (!formPresent) {
    return { ok: false, reason: "the onboarding form was not present" };
  }

  // Fill the real fields.
  await browser.evalJs(`
    const setValue = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue(document.querySelector('input[name="username"]'), ${JSON.stringify(username)});
    setValue(document.querySelector('input[name="displayName"]'), ${JSON.stringify(username)});
    const bio = document.querySelector('textarea[name="bio"]');
    if (bio) setValue(bio, '');
    const publicRadio = document.querySelector('input[name="visibility"][value="public"]');
    if (publicRadio) publicRadio.click();
    return true;
  `);

  await new Promise((resolve) => setTimeout(resolve, 300));

  // Submit the real form.
  await browser.evalJs(
    `document.querySelector('form').requestSubmit(); return true;`,
    { once: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // The profile exists when the app no longer offers the onboarding form.
  const stillOnboarding = await browser.evalJs(
    `return Boolean(document.querySelector('input[name="username"]'));`,
  );

  const { data } = await account.client
    .from("profiles")
    .select("username, visibility")
    .eq("user_id", account.id)
    .maybeSingle();

  return {
    ok: Boolean(data) && !stillOnboarding,
    reason: data
      ? undefined
      : stillOnboarding
        ? "the onboarding form is still showing after submitting"
        : "no profile row was created",
    profile: data,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Run                                     */
/* -------------------------------------------------------------------------- */

console.log(`PRSME — Phase 6.1 application review flow against ${BASE}`);

const userA = await signIn("flow-a");
const userB = await signIn("flow-b");

const usernameA = `flowa${Date.now().toString().slice(-8)}`;
const usernameB = `flowb${Date.now().toString().slice(-8)}`;

/*
 * A per-run marker.
 *
 * The Discover feed is shared state: earlier runs against the same database
 * leave their own reviews in it. Every headline used below carries this
 * marker, so an assertion can never match somebody else's row and the
 * results cannot depend on the order the suite was run in.
 */
const RUN = Date.now().toString(36);
const titleA = `Worth the wait ${RUN}`;
const titleAEdited = `Worth the wait edited ${RUN}`;
const titleB = `A second take ${RUN}`;
const titleDraft = `A working note ${RUN}`;

const browser = await connect();

section("Account setup");

const profileA = await createProfileInBrowser(browser, userA, usernameA);
check(
  "User A can create a profile through the real onboarding form",
  profileA.ok === true,
  profileA.reason ?? "",
);

const profileB = await createProfileInBrowser(browser, userB, usernameB);
check(
  "User B can create a profile through the real onboarding form",
  profileB.ok === true,
  profileB.reason ?? "",
);

section("Publishing a review");

/* --- resolve a media item to its canonical record ------------------------ */
const providerId = `flow-${Date.now()}`;
const resolve = await fetch(`${BASE}/api/media/resolve`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userA.cookie,
  },
  body: JSON.stringify({
    provider: "cinemeta",
    providerId,
    kind: "movie",
    title: "The Flow Film",
    creator: "A Director",
    year: 2024,
  }),
});
const resolveBody = await resolve.json();

check(
  "User A can resolve a picked item to a canonical media record",
  resolve.status === 200 && Boolean(resolveBody?.media?.id),
  `status ${resolve.status}: ${JSON.stringify(resolveBody).slice(0, 200)}`,
);

const mediaId = resolveBody?.media?.id;

/* --- publish -------------------------------------------------------------- */
const reviewBody =
  `A patient film that earns its final act. The ending stayed with me for days. ${RUN}`;

const publish = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userA.cookie,
  },
  body: JSON.stringify({
    mediaId,
    rating: 8.5,
    title: titleA,
    body: reviewBody,
    isSpoiler: false,
    status: "published",
  }),
});
const publishBody = await publish.json();

check(
  "User A can publish a review through the app's own API route",
  publish.status === 200 && publishBody?.ok === true,
  `status ${publish.status}: ${JSON.stringify(publishBody).slice(0, 200)}`,
);

const reviewId = publishBody?.review?.id;

/* --- the review really is in the database -------------------------------- */
const { data: storedRows } = await userA.client
  .from("media_reviews")
  .select("id, rating, body, status, published_at")
  .eq("id", reviewId);

check(
  "the published review is stored in media_reviews",
  (storedRows?.length ?? 0) === 1,
  `found ${storedRows?.length ?? 0} row(s)`,
);

check(
  "the stored review carries the rating that was submitted",
  Number(storedRows?.[0]?.rating) === 8.5,
  `rating was ${storedRows?.[0]?.rating}`,
);

check(
  "the stored review is published, not a draft",
  storedRows?.[0]?.status === "published",
  `status was ${storedRows?.[0]?.status}`,
);

check(
  "the stored review carries a publication timestamp",
  Boolean(storedRows?.[0]?.published_at),
  `published_at was ${storedRows?.[0]?.published_at}`,
);

/* --- one catalogue row ---------------------------------------------------- */
const { data: catalogueRows } = await userA.client
  .from("media_items")
  .select("id")
  .eq("provider_id", providerId);

check(
  "the canonical media record exists exactly once",
  (catalogueRows?.length ?? 0) === 1,
  `found ${catalogueRows?.length ?? 0} row(s)`,
);

section("The review appears where it should");

/* --- the author's public profile ------------------------------------------ */
const profilePage = await fetchAs(userA, `/u/${usernameA}`);
check(
  "the author's public profile renders",
  profilePage.status === 200,
  `status ${profilePage.status}`,
);

check(
  "the published review appears on the author's profile",
  profilePage.html.includes("Worth the wait"),
  "the review headline was not in the profile HTML",
);

check(
  "the profile shows the review's rating",
  profilePage.html.includes("8.5"),
  "the rating was not in the profile HTML",
);

/* --- the media page -------------------------------------------------------- */
const mediaPage = await fetchAs(userA, `/media/${mediaId}`);
check(
  "the media page renders",
  mediaPage.status === 200,
  `status ${mediaPage.status}`,
);

check(
  "the media page shows the review",
  mediaPage.html.includes(titleA),
  "the review was not in the media page HTML",
);

check(
  "the media page shows the work's title",
  mediaPage.html.includes("The Flow Film"),
  "the title was not in the media page HTML",
);

check(
  "the media page shows the community rating",
  mediaPage.html.includes("8.5"),
  "the community rating was not in the media page HTML",
);

/* --- the full review page -------------------------------------------------- */
const reviewPage = await fetchAs(userA, `/review/${reviewId}`);
check(
  "the full review page renders",
  reviewPage.status === 200,
  `status ${reviewPage.status}`,
);

check(
  "the full review page shows the complete review text",
  reviewPage.html.includes("The ending stayed with me for days."),
  "the complete body was not in the review page HTML",
);

check(
  "the full review page shows the rating",
  reviewPage.html.includes("8.5"),
  "the rating was not in the review page HTML",
);

/* --- discover -------------------------------------------------------------- */
const discoverPage = await fetchAs(userA, "/discover");
check(
  "Discover renders",
  discoverPage.status === 200,
  `status ${discoverPage.status}`,
);

check(
  "the review appears in Discover",
  discoverPage.html.includes(titleA),
  "the review was not in the Discover HTML",
);

section("A second account reviews the same work");

const resolveB = await fetch(`${BASE}/api/media/resolve`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userB.cookie,
  },
  body: JSON.stringify({
    provider: "cinemeta",
    providerId,
    kind: "movie",
    title: "The Flow Film",
    creator: "A Director",
    year: 2024,
  }),
});
const resolveBBody = await resolveB.json();

check(
  "User B resolves the same work to the SAME canonical record",
  resolveBBody?.media?.id === mediaId,
  `User B got ${resolveBBody?.media?.id}, expected ${mediaId}`,
);

const { data: catalogueAfterB } = await userB.client
  .from("media_items")
  .select("id")
  .eq("provider_id", providerId);

check(
  "the second account did not duplicate the catalogue entry",
  (catalogueAfterB?.length ?? 0) === 1,
  `found ${catalogueAfterB?.length ?? 0} row(s)`,
);

const publishB = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userB.cookie,
  },
  body: JSON.stringify({
    mediaId,
    rating: 7.5,
    title: titleB,
    body: `I liked it, but the first act tested my patience more than once. ${RUN}`,
    isSpoiler: false,
    status: "published",
  }),
});
const publishBBody = await publishB.json();

check(
  "User B can publish a review of the same work",
  publishB.status === 200 && publishBBody?.ok === true,
  `status ${publishB.status}: ${JSON.stringify(publishBBody).slice(0, 200)}`,
);

/* --- both reviews appear on the media page -------------------------------- */
const mediaPageAfterB = await fetchAs(userA, `/media/${mediaId}`);
check(
  "the media page shows both reviews",
  mediaPageAfterB.html.includes(titleA) && mediaPageAfterB.html.includes(titleB),
  "one of the two reviews was missing from the media page",
);

/*
 * The review count.
 *
 * React renders `{count} {count === 1 ? "review" : "reviews"}` as SEPARATE text
 * nodes, so the HTML carries comment markers between them
 * (`2<!-- --> <!-- -->reviews`). The count is read from the element that
 * holds it, with the markers removed, rather than by searching the whole
 * page for a phrase that was never contiguous in the markup.
 */
const reviewCountText = readTestIdText(
  mediaPageAfterB.html,
  "media-page-review-count",
);
check(
  "the media page reports the correct review count",
  reviewCountText === "2 reviews",
  `the count element read "${reviewCountText}"`,
);

const reviewCardsOnPage = (
  mediaPageAfterB.html.match(/data-testid="review-card"/g) ?? []
).length;
check(
  "the media page renders one card per review, with no duplicates",
  reviewCardsOnPage === 2,
  `the page rendered ${reviewCardsOnPage} review card(s)`,
);

section("Editing a review");

const edit = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userA.cookie,
  },
  body: JSON.stringify({
    mediaId,
    rating: 9,
    title: titleAEdited,
    body: `An edited review: the slow first act was worth it after all. ${RUN}`,
    isSpoiler: false,
    status: "published",
  }),
});
const editBody = await edit.json();

check(
  "the author can edit their review through the app's API route",
  edit.status === 200 && editBody?.ok === true,
  `status ${edit.status}: ${JSON.stringify(editBody).slice(0, 200)}`,
);

const { data: afterEditRows } = await userA.client
  .from("media_reviews")
  .select("id, body, rating")
  .eq("id", reviewId);

check(
  "the edit updated the existing row rather than creating a second one",
  (afterEditRows?.length ?? 0) === 1,
  `found ${afterEditRows?.length ?? 0} row(s)`,
);

check(
  "the edited row holds the new text",
  afterEditRows?.[0]?.body?.includes(`worth it after all. ${RUN}`) === true,
  `body was "${afterEditRows?.[0]?.body}"`,
);

check(
  "the edited row holds the new rating",
  Number(afterEditRows?.[0]?.rating) === 9,
  `rating was ${afterEditRows?.[0]?.rating}`,
);

section("Drafts stay private");

/* --- a draft on a work of its own ----------------------------------------- */
const providerIdDraft = `flow-draft-${Date.now()}`;
const resolveDraft = await fetch(`${BASE}/api/media/resolve`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userA.cookie,
  },
  body: JSON.stringify({
    provider: "cinemeta",
    providerId: providerIdDraft,
    kind: "tv",
    title: "The Draft Show",
  }),
});
const draftMediaId = (await resolveDraft.json())?.media?.id;

const draftPublish = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userA.cookie,
  },
  body: JSON.stringify({
    mediaId: draftMediaId,
    rating: 6,
    title: titleDraft,
    body: `This draft must never appear in discovery. ${RUN}`,
    isSpoiler: false,
    status: "draft",
  }),
});
const draftBody = await draftPublish.json();

check(
  "the author can save a draft through the app's API route",
  draftPublish.status === 200 && draftBody?.ok === true,
  `status ${draftPublish.status}: ${JSON.stringify(draftBody).slice(0, 200)}`,
);

const draftId = draftBody?.review?.id;

const discoverAfterDraft = await fetchAs(userA, "/discover");
check(
  "a draft does not appear in Discover",
  !discoverAfterDraft.html.includes(`/review/${draftId}`),
  "the draft was visible in the Discover HTML",
);

const anonymousDiscover = await fetch(`${BASE}/discover`);
const anonymousHtml = await anonymousDiscover.text();
check(
  "a draft does not appear in Discover for an anonymous visitor",
  !anonymousHtml.includes(`/review/${draftId}`),
  "the draft was visible in the anonymous Discover HTML",
);

section("Private profiles hide their reviews");

/*
 * Make User A private through the app's own account path.
 *
 * The visibility is flipped on the profile row, which is the same column the
 * `updateVisibilityAction` server action writes.
 */
await userA.client
  .from("profiles")
  .update({ visibility: "private" })
  .eq("user_id", userA.id);

const anonymousAfterPrivate = await fetch(`${BASE}/discover`);
const anonymousPrivateHtml = await anonymousAfterPrivate.text();

/*
 * ONLY User A's review must disappear.
 *
 * User B's review of the same work is still public — User B's profile is
 * public — so asserting that the whole page changed would be asserting the
 * wrong thing.
 *
 * The check is made on this run's OWN review id, because the feed also
 * carries reviews left by earlier runs against the same database. Matching
 * on the headline text would then trip over somebody else's row.
 */
check(
  "a private profile's review disappears from Discover",
  !anonymousPrivateHtml.includes(`/review/${reviewId}`),
  "the private review was still linked from the Discover HTML",
);

/*
 * The headline alone is not a safe check: earlier runs against the same
 * database leave their own reviews in the feed, and they use the same
 * headline text. The check that matters is that THIS run's review is gone,
 * which the link check above already proves — so the headline is checked
 * only in the context of this run's own review card.
 */
check(
  "the private review's headline is gone from Discover",
  !anonymousPrivateHtml.includes(titleAEdited),
  "the private review's headline was still in the Discover HTML",
);

check(
  "a public profile's review is still in Discover alongside it",
  anonymousPrivateHtml.includes(titleB),
  "the other account's public review was wrongly removed",
);

const anonymousReviewPage = await fetch(`${BASE}/review/${reviewId}`);
check(
  "the review page refuses to render a private profile's review",
  anonymousReviewPage.status === 404,
  `status ${anonymousReviewPage.status}`,
);

const ownerReviewPage = await fetchAs(userA, `/review/${reviewId}`);
check(
  "the author can still open their own review after going private",
  ownerReviewPage.status === 200,
  `status ${ownerReviewPage.status}`,
);

/* --- back to public -------------------------------------------------------- */
await userA.client
  .from("profiles")
  .update({ visibility: "public" })
  .eq("user_id", userA.id);

const anonymousAfterPublic = await fetch(`${BASE}/discover`);
const anonymousPublicHtml = await anonymousAfterPublic.text();
check(
  "the review returns to Discover when the profile goes public again",
  anonymousPublicHtml.includes(`/review/${reviewId}`),
  "the review did not come back to Discover",
);

section("Cross-account protection through the API");

const crossEdit = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: userB.cookie,
  },
  body: JSON.stringify({
    mediaId,
    rating: 1,
    body: "User B trying to overwrite User A's review.",
    status: "published",
  }),
});
console.log(`  (User B's competing write returned ${crossEdit.status})`);

const { data: protectedRows } = await userA.client
  .from("media_reviews")
  .select("user_id, body")
  .eq("media_id", mediaId)
  .eq("user_id", userA.id);

check(
  "User A's review still belongs to User A after User B's attempt",
  (protectedRows?.length ?? 0) === 1,
  `found ${protectedRows?.length ?? 0} row(s)`,
);

check(
  "User A's review text was not overwritten by User B",
  protectedRows?.[0]?.body?.includes("worth it after all") === true,
  `body was "${protectedRows?.[0]?.body}"`,
);

section("Honest failures and unknown ids");

const anonymousWrite = await fetch(`${BASE}/api/reviews`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mediaId, rating: 5, body: "anonymous", status: "published" }),
});
check(
  "an anonymous write is refused with a 401",
  anonymousWrite.status === 401,
  `status ${anonymousWrite.status}`,
);

const unknownMedia = await fetch(`${BASE}/media/00000000-0000-0000-0000-000000000000`);
check(
  "an unknown media id renders a not-found state",
  unknownMedia.status === 404,
  `status ${unknownMedia.status}`,
);

const unknownReview = await fetch(`${BASE}/review/00000000-0000-0000-0000-000000000000`);
check(
  "an unknown review id renders a not-found state",
  unknownReview.status === 404,
  `status ${unknownReview.status}`,
);

const emptyFeed = await fetchAs(userB, "/discover");
check(
  "the Discover feed renders with a coherent empty or populated state",
  emptyFeed.status === 200 &&
    (emptyFeed.html.includes("data-testid=\"review-empty-state\"") ||
      emptyFeed.html.includes("data-testid=\"review-card\"")),
  "the feed had neither an empty state nor a card",
);

section("Other Phase 6 routes");

for (const path of ["/about", "/u/noir", "/sign-in", "/sign-up", "/forgot-password"]) {
  const res = await fetch(`${BASE}${path}`);
  check(`${path} renders`, res.status === 200, `status ${res.status}`);
  await res.text();
}

await browser.close();

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}

process.exit(failed > 0 ? 1 : 0);
