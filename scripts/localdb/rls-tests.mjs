/**
 * Phase 6.1 — live RLS and aggregate tests.
 *
 * Every assertion here runs against the REAL database: real Postgres, real
 * roles, real rows, the project's own policies. Nothing is inferred from
 * source code, and nothing is mocked.
 *
 * The readers are:
 *
 *   - ANONYMOUS    a visitor with no session (the `anon` role)
 *   - AUTHOR       the signed-in owner of a review
 *   - OTHER        a second, unrelated signed-in account
 *
 * and the rules under test are:
 *
 *   1. a draft is visible only to its author
 *   2. a published review is visible only while the author's profile is public
 *   3. an author may write, edit, and delete their own review only
 *   4. a normal user may not rewrite catalogue metadata
 *   5. the aggregate view counts only what the reader may see
 *   6. one review per person per work, enforced by the database
 *   7. one catalogue row per work, enforced by the database
 */

import { createClient } from "@supabase/supabase-js";
import { REST_URL, ANON_KEY } from "./harness.mjs";

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
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

/** Create an account through the local auth service and return a client. */
async function makeAccount(label) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = "phase6-test-password-123";

  const res = await fetch(`${REST_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();

  if (!body?.access_token) {
    throw new Error(`could not create the ${label} account: ${res.status}`);
  }

  const client = createClient(REST_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${body.access_token}` } },
  });

  return { label, email, id: body.user.id, client };
}

/** Create the profile row an account needs. */
async function makeProfile(account, username, visibility = "public") {
  const { error } = await account.client
    .from("profiles")
    .insert({ user_id: account.id, username, visibility });
  if (error) throw new Error(`could not create ${username}: ${error.message}`);
}

/* -------------------------------------------------------------------------- */
/*                                    Run                                     */
/* -------------------------------------------------------------------------- */

console.log("PRSME — Phase 6.1 live RLS and aggregate tests");

const anon = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const author = await makeAccount("author");
const other = await makeAccount("other");

await makeProfile(author, `author${Date.now().toString().slice(-8)}`, "public");
await makeProfile(other, `other${Date.now().toString().slice(-8)}`, "public");

/*
 * A shared media record. Both accounts will review it, which is what makes
 * "one catalogue row, two reviews" testable.
 */
const providerId = `phase61-shared-${Date.now()}`;
const { data: media, error: mediaError } = await author.client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: providerId,
    kind: "movie",
    title: "The Shared Film",
    creator: "A Director",
    release_year: 2024,
  })
  .select()
  .single();

if (mediaError) {
  console.error(`could not create the shared media record: ${mediaError.message}`);
  process.exit(1);
}

section("Catalogue");

/* --- one row per work ---------------------------------------------------- */
const { error: duplicateMediaError } = await other.client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: providerId,
    kind: "movie",
    title: "The Shared Film (again)",
  });

check(
  "a second account cannot create a duplicate row for the same work",
  !!duplicateMediaError,
  duplicateMediaError ? "" : "the duplicate insert unexpectedly succeeded",
);

const { data: mediaRows } = await anon
  .from("media_items")
  .select("id")
  .eq("provider_id", providerId);
check(
  "the catalogue holds exactly one row for the work",
  (mediaRows?.length ?? 0) === 1,
  `found ${mediaRows?.length ?? 0}`,
);

/*
 * A NOTE ON HOW POSTGRES DENIES A WRITE.
 *
 * When an RLS policy filters every row out of an UPDATE or a DELETE,
 * Postgres does NOT raise an error — the statement simply affects zero rows.
 * PostgREST then reports success with an empty body.
 *
 * So "the request returned an error" is NOT the security property. The
 * security property is "the data did not change". These assertions therefore
 * check the DATA, and a failed request is only accepted as evidence when it
 * is accompanied by the row being untouched.
 */

/* --- catalogue metadata is not the community's to rewrite ---------------- */
const { data: mediaBeforeRewrite } = await anon
  .from("media_items")
  .select("title")
  .eq("id", media.id)
  .single();

await other.client
  .from("media_items")
  .update({ title: "Rewritten by an account" })
  .eq("id", media.id);

const { data: mediaAfterRewrite } = await anon
  .from("media_items")
  .select("title")
  .eq("id", media.id)
  .single();

check(
  "a signed-in account cannot rewrite catalogue metadata",
  mediaAfterRewrite?.title === mediaBeforeRewrite?.title,
  `the title became "${mediaAfterRewrite?.title}"`,
);

await anon
  .from("media_items")
  .update({ title: "Rewritten by a visitor" })
  .eq("id", media.id);

const { data: mediaAfterAnonRewrite } = await anon
  .from("media_items")
  .select("title")
  .eq("id", media.id)
  .single();

check(
  "an anonymous visitor cannot rewrite catalogue metadata",
  mediaAfterAnonRewrite?.title === mediaBeforeRewrite?.title,
  `the title became "${mediaAfterAnonRewrite?.title}"`,
);

section("Review writes");

/* --- an author publishes ------------------------------------------------- */
const { data: published, error: publishError } = await author.client
  .from("media_reviews")
  .insert({
    user_id: author.id,
    media_id: media.id,
    rating: 8.5,
    title: "Worth the watch",
    body: "A genuinely good film with a slow first act.",
    status: "published",
  })
  .select()
  .single();

check(
  "an author can publish a review of their own",
  !publishError,
  publishError?.message ?? "",
);

check(
  "published_at is stamped by the database, not the client",
  Boolean(published?.published_at),
  `published_at was ${published?.published_at}`,
);

/* --- identity cannot be spoofed ------------------------------------------ */
const { error: spoofError } = await other.client
  .from("media_reviews")
  .insert({
    user_id: author.id,
    media_id: media.id,
    body: "planted under somebody else's name",
    status: "published",
  });

check(
  "an account cannot publish a review under another account's id",
  !!spoofError,
  spoofError ? "" : "the insert unexpectedly succeeded",
);

/* --- one review per person per work -------------------------------------- */
const { error: secondReviewError } = await author.client
  .from("media_reviews")
  .insert({
    user_id: author.id,
    media_id: media.id,
    body: "a second review of the same film by the same person",
    status: "published",
  });

check(
  "one person cannot hold two reviews of the same work",
  !!secondReviewError,
  secondReviewError ? "" : "the second insert unexpectedly succeeded",
);

section("Draft isolation");

/* --- a second work, reviewed as a draft ---------------------------------- */
const providerIdTwo = `phase61-draft-${Date.now()}`;
const { data: draftMedia } = await author.client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: providerIdTwo,
    kind: "tv",
    title: "The Draft Show",
  })
  .select()
  .single();

const { data: draft, error: draftError } = await author.client
  .from("media_reviews")
  .insert({
    user_id: author.id,
    media_id: draftMedia.id,
    rating: 6,
    body: "A half-written review that is not ready to be public.",
    status: "draft",
  })
  .select()
  .single();

check(
  "an author can save a draft",
  !draftError,
  draftError?.message ?? "",
);

check(
  "a draft carries no publication timestamp",
  (draft?.published_at ?? null) === null,
  `published_at was ${draft?.published_at}`,
);

const { data: anonDrafts } = await anon
  .from("media_reviews")
  .select("id")
  .eq("id", draft.id);
check(
  "an anonymous visitor cannot read a draft",
  (anonDrafts?.length ?? 0) === 0,
  `the visitor saw ${anonDrafts?.length ?? 0} draft(s)`,
);

const { data: otherDrafts } = await other.client
  .from("media_reviews")
  .select("id")
  .eq("id", draft.id);
check(
  "a second signed-in account cannot read somebody else's draft",
  (otherDrafts?.length ?? 0) === 0,
  `the other account saw ${otherDrafts?.length ?? 0} draft(s)`,
);

const { data: authorDrafts } = await author.client
  .from("media_reviews")
  .select("id")
  .eq("id", draft.id);
check(
  "the author can read their own draft",
  (authorDrafts?.length ?? 0) === 1,
  `the author saw ${authorDrafts?.length ?? 0} draft(s)`,
);

section("Published review visibility");

const { data: anonPublished } = await anon
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "an anonymous visitor can read a published review",
  (anonPublished?.length ?? 0) === 1,
  `the visitor saw ${anonPublished?.length ?? 0}`,
);

const { data: otherPublished } = await other.client
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "a second signed-in account can read a published review",
  (otherPublished?.length ?? 0) === 1,
  `the other account saw ${otherPublished?.length ?? 0}`,
);

section("Cross-account edit and delete");

/*
 * A denied UPDATE/DELETE affects zero rows rather than raising, so the
 * assertion is that the row is untouched — not that the call reported an
 * error.
 */
await other.client
  .from("media_reviews")
  .update({ body: "rewritten by somebody else" })
  .eq("id", published.id);

const { data: afterCrossEdit } = await author.client
  .from("media_reviews")
  .select("body")
  .eq("id", published.id)
  .single();

check(
  "a second account cannot edit another account's review",
  afterCrossEdit?.body === published.body,
  `the body became "${afterCrossEdit?.body}"`,
);

await other.client.from("media_reviews").delete().eq("id", published.id);

const { data: afterCrossDelete } = await author.client
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);

check(
  "a second account cannot delete another account's review",
  (afterCrossDelete?.length ?? 0) === 1,
  `the review was deleted by another account`,
);

/* --- the author CAN edit and delete -------------------------------------- */
const { error: authorUpdateError } = await author.client
  .from("media_reviews")
  .update({ body: "An edited review: the slow first act was worth it." })
  .eq("id", published.id);
check(
  "the author can edit their own review",
  !authorUpdateError,
  authorUpdateError?.message ?? "",
);

const { data: afterEdit } = await author.client
  .from("media_reviews")
  .select("id, body")
  .eq("id", published.id);
check(
  "the edit updated the existing row rather than creating another",
  (afterEdit?.length ?? 0) === 1 &&
    afterEdit[0].body.startsWith("An edited review"),
  `found ${afterEdit?.length ?? 0} row(s)`,
);

section("The privacy interlock");

/*
 * The rule: a published review does not override its author's privacy
 * setting. Making the author's profile private must remove the review from
 * every public read — the database must refuse to return the row, not the
 * application hide it.
 */
const { error: privatiseError } = await author.client
  .from("profiles")
  .update({ visibility: "private" })
  .eq("user_id", author.id);
check(
  "the author can make their own profile private",
  !privatiseError,
  privatiseError?.message ?? "",
);

const { data: anonAfterPrivate } = await anon
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "a private profile's published review is no longer readable by a visitor",
  (anonAfterPrivate?.length ?? 0) === 0,
  `the visitor still saw ${anonAfterPrivate?.length ?? 0}`,
);

const { data: otherAfterPrivate } = await other.client
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "a private profile's published review is no longer readable by another account",
  (otherAfterPrivate?.length ?? 0) === 0,
  `the other account still saw ${otherAfterPrivate?.length ?? 0}`,
);

const { data: authorAfterPrivate } = await author.client
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "the author can still read their own review after going private",
  (authorAfterPrivate?.length ?? 0) === 1,
  `the author saw ${authorAfterPrivate?.length ?? 0}`,
);

/* --- and back to public ------------------------------------------------- */
const { error: publishAgainError } = await author.client
  .from("profiles")
  .update({ visibility: "public" })
  .eq("user_id", author.id);
check(
  "the author can make their profile public again",
  !publishAgainError,
  publishAgainError?.message ?? "",
);

const { data: anonAfterPublic } = await anon
  .from("media_reviews")
  .select("id")
  .eq("id", published.id);
check(
  "the review becomes public again with the profile",
  (anonAfterPublic?.length ?? 0) === 1,
  `the visitor saw ${anonAfterPublic?.length ?? 0}`,
);

section("The aggregate view");

const { data: anonStats } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", media.id)
  .maybeSingle();

check(
  "the aggregate view is readable by a visitor",
  Boolean(anonStats),
  `stats were ${JSON.stringify(anonStats)}`,
);

check(
  "the aggregate counts the one published review with written text",
  anonStats?.review_count === 1,
  `review_count was ${anonStats?.review_count}`,
);

check(
  "the community rating is the average of real ratings",
  Number(anonStats?.community_rating) === 8.5,
  `community_rating was ${anonStats?.community_rating}`,
);

/* --- a second review moves the aggregate --------------------------------- */
const { data: otherReview, error: otherReviewError } = await other.client
  .from("media_reviews")
  .insert({
    user_id: other.id,
    media_id: media.id,
    rating: 7.5,
    body: "A second person's take on the same film.",
    status: "published",
  })
  .select()
  .single();

check(
  "a second account can review the same work",
  !otherReviewError,
  otherReviewError?.message ?? "",
);

const { data: statsAfterTwo } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", media.id)
  .maybeSingle();

check(
  "the aggregate counts both reviews",
  statsAfterTwo?.review_count === 2,
  `review_count was ${statsAfterTwo?.review_count}`,
);

check(
  "the community rating averages both accounts' real ratings",
  Number(statsAfterTwo?.community_rating) === 8,
  `community_rating was ${statsAfterTwo?.community_rating}`,
);

/* --- the catalogue row is still one -------------------------------------- */
const { data: mediaAfterTwo } = await anon
  .from("media_items")
  .select("id")
  .eq("provider_id", providerId);
check(
  "a second review did not duplicate the catalogue entry",
  (mediaAfterTwo?.length ?? 0) === 1,
  `the catalogue holds ${mediaAfterTwo?.length ?? 0} row(s)`,
);

/* --- a draft is not counted ---------------------------------------------- */
const { data: draftStats } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", draftMedia.id)
  .maybeSingle();

check(
  "a draft is not counted in the aggregate at all",
  !draftStats || (draftStats.review_count ?? 0) === 0,
  `stats were ${JSON.stringify(draftStats)}`,
);

/* --- a private profile's review leaves the aggregate --------------------- */
await author.client
  .from("profiles")
  .update({ visibility: "private" })
  .eq("user_id", author.id);

const { data: statsWhilePrivate } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", media.id)
  .maybeSingle();

check(
  "a private profile's review is excluded from the visitor's aggregate",
  (statsWhilePrivate?.review_count ?? 0) === 1,
  `review_count was ${statsWhilePrivate?.review_count}`,
);

check(
  "the community rating excludes the private profile's rating",
  Number(statsWhilePrivate?.community_rating) === 7.5,
  `community_rating was ${statsWhilePrivate?.community_rating}`,
);

await author.client
  .from("profiles")
  .update({ visibility: "public" })
  .eq("user_id", author.id);

/* --- a work with no reviews has no fabricated score ---------------------- */
const providerIdEmpty = `phase61-empty-${Date.now()}`;
const { data: emptyMedia } = await author.client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: providerIdEmpty,
    kind: "book",
    title: "The Unreviewed Work",
  })
  .select()
  .single();

const { data: emptyStats } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", emptyMedia.id)
  .maybeSingle();

check(
  "a work with no reviews receives no aggregate row at all",
  !emptyStats,
  `stats were ${JSON.stringify(emptyStats)}`,
);

section("Rating-only records");

const { error: ratingOnlyError } = await other.client
  .from("media_reviews")
  .insert({
    user_id: other.id,
    media_id: emptyMedia.id,
    rating: 9,
    body: "",
    status: "published",
  });
check(
  "a rating-only record can be written",
  !ratingOnlyError,
  ratingOnlyError?.message ?? "",
);

const { data: ratingOnlyStats } = await anon
  .from("media_review_stats")
  .select("media_id, review_count, rating_count, community_rating")
  .eq("media_id", emptyMedia.id)
  .maybeSingle();

check(
  "a rating-only record is counted as a rating, not as a written review",
  (ratingOnlyStats?.rating_count ?? 0) === 1 &&
    (ratingOnlyStats?.review_count ?? 0) === 0,
  `stats were ${JSON.stringify(ratingOnlyStats)}`,
);

check(
  "a rating-only record still contributes its rating to the community score",
  Number(ratingOnlyStats?.community_rating) === 9,
  `community_rating was ${ratingOnlyStats?.community_rating}`,
);

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}

process.exit(failed > 0 ? 1 : 0);
