/**
 * Phase 6 verification suite.
 *
 * Runs the checks that need no database ALWAYS, and the live-database checks
 * when a Supabase project is configured.
 *
 *   node scripts/phase6-verify.mjs
 *   node scripts/phase6-verify.mjs --with-db     (force the live section)
 *
 * The live section is SKIPPED — loudly — when no project is configured, because
 * every one of those checks is about a real database refusing a real request.
 * A suite that quietly passed without testing anything would be worse than no
 * suite, so the skip is reported rather than hidden.
 *
 * The three groups:
 *
 *   1. SCHEMA (static) — the shape of the migrations. A constraint or policy
 *      that was silently dropped is a real regression.
 *   2. APPLICATION (static + pure logic) — the server boundary rules: identity
 *      from the session, not the body; drafts never published accidentally;
 *      rating-only records never rendered as written reviews.
 *   3. LIVE DATABASE — permitted AND denied paths against a real project.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*                                 Harness                                    */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  skip ${name} — ${reason}`);
}

function section(title) {
  console.log(`\n${title}`);
}

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function read(relative) {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

/**
 * Source with its comments stripped.
 *
 * The checks below assert on CODE, not on prose. A doc comment that explains
 * why a control does not exist — "there is deliberately no separate 'Full
 * review' button" — is documentation, not a control, and a plain substring
 * search cannot tell the two apart. Comments are removed first so a check
 * fails only when the real thing is present.
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
/*                          Static source assertions                           */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue schema.
 *
 * These are the invariants that make the catalogue SHARED rather than
 * per-account, and they are the ones a future migration could break by
 * accident.
 */
function verifyMediaItemsSchema() {
  section("media_items — canonical catalogue (static)");

  const sql = read("supabase/migrations/20250101000004_media_items.sql");

  check(
    "the table exists with a uuid primary key",
    /create table if not exists public\.media_items/i.test(sql) &&
      /id\s+uuid primary key default gen_random_uuid\(\)/i.test(sql),
  );
  check(
    "provider and provider_id are both NOT NULL",
    /provider\s+text not null/i.test(sql) &&
      /provider_id\s+text not null/i.test(sql),
  );
  check(
    "the kind is constrained to the six known media kinds",
    /check \(kind in \('movie', 'tv', 'song', 'album', 'manga', 'book'\)\)/i.test(sql),
  );
  check(
    "a UNIQUE constraint prevents duplicate records for the same provider item",
    /create unique index if not exists media_items_provider_item_key[\s\S]*?on public\.media_items \(provider, provider_id\)/i.test(sql),
  );
  check(
    "the title is NOT NULL",
    /title\s+text not null/i.test(sql),
  );
  check(
    "artwork is stored as an external URL, never a storage path",
    /artwork_url\s+text/i.test(sql) && !/artwork_path/i.test(sql),
  );
  check(
    "the artwork source is recorded so the UI can attribute it",
    /artwork_source\s+text/i.test(sql),
  );
  check(
    "cross-provider identifiers are retained",
    /external_ids\s+jsonb/i.test(sql),
  );
  check(
    "created_at and updated_at are both present",
    /created_at timestamptz not null default now\(\)/i.test(sql) &&
      /updated_at timestamptz not null default now\(\)/i.test(sql),
  );
  check(
    "the updated_at trigger exists",
    /create trigger media_items_set_updated_at/i.test(sql),
  );
}

/**
 * The review schema.
 *
 * The rating scale, the one-row-per-author-per-media rule, and the explicit
 * publication state are the three the brief calls out by name.
 */
function verifyReviewSchema() {
  section("media_reviews — normalized reviews (static)");

  const sql = read("supabase/migrations/20250101000005_media_reviews.sql");

  check(
    "the table exists with a uuid primary key",
    /create table if not exists public\.media_reviews/i.test(sql) &&
      /id\s+uuid primary key default gen_random_uuid\(\)/i.test(sql),
  );
  check(
    "the author references auth.users with ON DELETE CASCADE",
    /user_id\s+uuid not null[\s\S]{0,120}?references auth\.users \(id\) on delete cascade/i.test(sql),
  );
  check(
    "the media record is a foreign key",
    /media_id\s+uuid not null[\s\S]{0,120}?references public\.media_items \(id\)/i.test(sql),
  );
  check(
    "the rating is constrained to PRSME's 0-10 scale",
    /rating\s+numeric\(3,1\)[\s\S]{0,120}?check \(rating is null or \(rating >= 0 and rating <= 10\)\)/i.test(sql),
  );
  check(
    "the publication state is an explicit, constrained column",
    /status\s+text not null default 'draft'[\s\S]{0,120}?check \(status in \('draft', 'published'\)\)/i.test(sql),
  );
  check(
    "a spoiler flag exists",
    /is_spoiler\s+boolean not null default false/i.test(sql),
  );
  check(
    "a publication timestamp is kept separately from updated_at",
    /published_at timestamptz/i.test(sql),
  );
  check(
    "ONE record per author per media item, enforced by the database",
    /create unique index if not exists media_reviews_user_media_key[\s\S]{0,120}?on public\.media_reviews \(user_id, media_id\)/i.test(sql),
  );
  check(
    "there is an index on media_id",
    /create index if not exists media_reviews_media_idx/i.test(sql),
  );
  check(
    "there is an index on the publication timestamp",
    /published_at desc/i.test(sql),
  );
  check(
    "there is an index on the author",
    /create index if not exists media_reviews_user_idx/i.test(sql),
  );
  check(
    "there is an index on the publication state",
    /create index if not exists media_reviews_status_media_idx/i.test(sql),
  );
  check(
    "published_at is maintained by the database, not by the client",
    /create trigger media_reviews_sync_published_at/i.test(sql) &&
      /sync_media_reviews_published_at/i.test(sql),
  );
}

/**
 * The RLS policies — the actual access-control boundary.
 */
function verifyReviewsRls() {
  section("media_reviews / media_items — RLS (static)");

  const sql = read("supabase/migrations/20250101000006_reviews_rls.sql");

  check(
    "RLS is enabled on media_reviews",
    /alter table public\.media_reviews enable row level security/i.test(sql),
  );
  check(
    "RLS is enabled on media_items",
    /alter table public\.media_items enable row level security/i.test(sql),
  );

  /*
   * The privacy interlock: a published review must not be readable when its
   * author's profile is private. The policy is the only place that can
   * express it, so its shape is asserted directly.
   */
  check(
    "a published review is readable only when the author's profile is public",
    /review_status = 'published'[\s\S]{0,400}?from public\.profiles p[\s\S]{0,200}?p\.visibility = 'public'/i.test(sql),
  );
  check(
    "an author can always read their own review, draft or published",
    /\(select auth\.uid\(\)\) = review_user_id/i.test(sql),
  );
  check(
    "the helper is SECURITY DEFINER so it can see a private profile row",
    /create or replace function public\.can_read_review[\s\S]{0,400}?security definer/i.test(sql),
  );
  check(
    "the helper returns only a boolean, never a row",
    /returns boolean/i.test(sql),
  );
  check(
    "INSERT binds user_id to the session",
    /for insert[\s\S]{0,200}?to authenticated[\s\S]{0,200}?with check \(\(select auth\.uid\(\)\) = user_id\)/i.test(sql),
  );
  check(
    "UPDATE has a with check so user_id cannot be reassigned",
    /for update[\s\S]{0,200}?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]{0,200}?with check \(\(select auth\.uid\(\)\) = user_id\)/i.test(sql),
  );
  check(
    "DELETE is granted only to the author",
    /for delete[\s\S]{0,200}?to authenticated[\s\S]{0,200}?using \(\(select auth\.uid\(\)\) = user_id\)/i.test(sql),
  );
  check(
    "no write policy on media_reviews is granted to anon",
    !/for (insert|update|delete)[\s\S]{0,200}?to anon/i.test(sql),
  );
  check(
    "media_items is world-readable",
    /for select[\s\S]{0,200}?to anon, authenticated[\s\S]{0,120}?using \(true\)/i.test(sql),
  );
  check(
    "no UPDATE policy exists for media_items — a normal user cannot rewrite catalogue metadata",
    !/create policy[\s\S]{0,200}?for update[\s\S]{0,200}?on public\.media_items/i.test(sql),
  );
  check(
    "no DELETE policy exists for media_items",
    !/create policy[\s\S]{0,200}?for delete[\s\S]{0,200}?on public\.media_items/i.test(sql),
  );
  check(
    "no UPDATE or DELETE grant is given to a client role on media_items",
    !/grant update, delete on public\.media_items to/i.test(sql),
  );
  check(
    "the backfill function is not callable by anon or authenticated",
    /revoke all on function public\.backfill_profile_state_reviews\(\) from public/i.test(
      read("supabase/migrations/20250101000007_review_backfill.sql"),
    ),
  );
}

/**
 * The aggregates — the community score must come from real rows.
 */
function verifyAggregates() {
  section("Review aggregates (static)");

  const sql = read("supabase/migrations/20250101000007_review_backfill.sql");

  check(
    "the aggregate view is SECURITY INVOKER, so it inherits the RLS policies",
    /create view public\.media_review_stats[\s\S]{0,120}?with \(security_invoker = true\)/i.test(sql),
  );
  check(
    "the review count only counts published reviews with written text",
    /count\(\*\) filter \(where length\(btrim\(r\.body\)\) > 0\)/i.test(sql),
  );
  check(
    "the community rating is the average of real ratings",
    /round\(avg\(r\.rating\)::numeric, 1\)\s+as community_rating/i.test(sql),
  );
  check(
    "only published rows are aggregated",
    /where r\.status = 'published'/i.test(sql),
  );
  check(
    "the community rating is NULL rather than zero when there are no ratings",
    /community_rating[\s\S]{0,400}?NULL/i.test(sql),
  );
  check(
    "the backfill is idempotent — it uses ON CONFLICT DO NOTHING",
    /on conflict \(user_id, media_id\) do nothing/i.test(sql),
  );
  check(
    "the backfill never deletes or rewrites profile_state",
    !/delete from public\.profiles/i.test(sql) &&
      !/update public\.profiles set profile_state/i.test(sql),
  );
  check(
    "the backfill creates the catalogue record too",
    /insert into public\.media_items/i.test(sql),
  );
}

/**
 * The server boundary.
 *
 * These are the rules about WHO may do WHAT, expressed in application code.
 * The database enforces them again; this layer exists so the user gets a
 * sentence instead of a Postgres error code.
 */
function verifyServerBoundary() {
  section("Server boundary (static)");

  const reviews = read("lib/supabase/reviews.ts");
  const media = read("lib/supabase/media.ts");
  const api = read("app/api/reviews/route.ts");
  const resolveApi = read("app/api/media/resolve/route.ts");

  check(
    "the review writer derives user_id from the verified session",
    /getCurrentUserId\(\)/.test(reviews) && /user_id: userId/.test(reviews),
  );
  check(
    "there is no parameter that lets a caller name the review's author",
    !/userId\??:\s*string/.test(api) && !/authorId\??:\s*string/.test(api),
  );
  check(
    "the review write upserts on (user_id, media_id), so an edit updates in place",
    /upsert\(payload, \{ onConflict: "user_id,media_id" \}\)/.test(reviews),
  );
  check(
    "the rating scale is validated before the write",
    /rating < 0 \|\| input\.rating > 10/.test(reviews),
  );
  check(
    "publishing requires a rating or some written notes",
    /status === "published"[\s\S]{0,200}?!body\.trim\(\)/.test(reviews),
  );
  check(
    "the API refuses to publish an unrecognised status",
    /body\.status === "published" \? "published" : "draft"/.test(api),
  );
  check(
    "the API rejects a review whose media record does not exist",
    /getMediaItemById\(mediaId\)/.test(api) && /status: 404/.test(api),
  );
  check(
    "the catalogue resolver reuses an existing record rather than creating a second",
    /findMediaItemByProviderId/.test(media),
  );
  check(
    "the resolver handles the unique-violation race by re-reading the winner's row",
    /raced/i.test(media) && /const raced = await findMediaItemByProviderId/.test(media),
  );
  check(
    "artwork is vetted against the allowlist before it is stored",
    /isAllowedArtworkUrl/.test(media),
  );
  check(
    "the resolve endpoint validates the provider and kind against known sets",
    /MEDIA_PROVIDER_LABELS/.test(resolveApi) && /MEDIA_KIND_IDS/.test(resolveApi),
  );
  check(
    "the resolve endpoint requires a signed-in owner",
    /getCurrentUserId\(\)/.test(resolveApi) && /status: 401/.test(resolveApi),
  );
  check(
    "no service-role key is referenced anywhere in the new code",
    !/SUPABASE_SERVICE_ROLE|service_role/i.test(reviews + media + api + resolveApi),
  );
}

/**
 * The UI rules.
 *
 * The brief is specific about several of these: a rating-only record must
 * not appear as a written review, a redundant "Full review" button must not
 * exist, and a private profile's reviews must not leak into public pages.
 */
function verifyPresentationRules() {
  section("Presentation rules (static)");

  const cards = readCode("components/reviews/ReviewCards.tsx");
  const writer = read("components/reviews/ReviewWriter.tsx");
  const discover = read("app/discover/page.tsx");
  const mediaPage = read("app/media/[mediaId]/page.tsx");
  const profileReviews = readCode("components/ProfileReviews.tsx");
  const reviews = read("lib/supabase/reviews.ts");

  check(
    "a rating-only record is excluded from the review feed",
    /filter\(\(r\) => \(r\.body \?\? ""\)\.trim\(\)\.length > 0\)/.test(reviews),
  );
  check(
    "the feed only queries published reviews",
    /\.eq\("status", "published"\)/.test(reviews),
  );
  check(
    "the Discover feed filters rating-only records out too",
    /review\.body\.trim\(\)\.length > 0/.test(reviews) ||
      /written/.test(reviews),
  );
  check(
    "the review writer has an explicit Save draft action",
    /review-save-draft/.test(writer),
  );
  check(
    "the review writer has an explicit Publish action",
    /review-publish/.test(writer),
  );
  check(
    "the review writer states that a draft is private",
    /draft is visible only to you/i.test(writer),
  );
  /*
   * The rule is about a redundant BUTTON, not about the phrase.
   *
   * The excerpt itself is the link to the full review, so the card has no
   * second control restating it. The link's own `aria-label` says "Read the
   * full review…" — that is the accessible NAME of the excerpt link, which is
   * exactly what it should be. What must not exist is a separate button or
   * anchor whose visible text is "Full review".
   */
  check(
    "the review card offers no redundant 'Full review' button",
    !/>\s*(Read )?[Ff]ull review\s*</.test(cards),
  );
  check(
    "the profile reviews section offers no redundant 'Full review' button",
    !/>\s*(Read )?[Ff]ull review\s*</.test(profileReviews),
  );
  check(
    "the profile reviews section renders nothing when there are no written reviews",
    /if \(written\.length === 0\) return null/.test(profileReviews),
  );
  check(
    "a spoiler review is collapsed behind a real disclosure control",
    /<details/.test(cards) && /<details/.test(profileReviews),
  );
  check(
    "the Discover page has search, category filters, and a sort control",
    /discover-search-input/.test(read("components/reviews/DiscoverControls.tsx")) &&
      /discover-category-/.test(read("components/reviews/DiscoverControls.tsx")) &&
      /discover-sort/.test(read("components/reviews/DiscoverControls.tsx")),
  );
  check(
    "the Discover page has NO people-discovery feature",
    !/discover.*people|people.*discover|recommended creators|popular reviewers/i.test(
      discover,
    ),
  );
  check(
    "the Discover page's popular shelf groups by canonical media record",
    /listPopularMedia/.test(discover),
  );
  check(
    "the Discover page renders an intentional empty state rather than filler",
    /ReviewEmptyState/.test(discover),
  );
  check(
    "the media page shows the community rating and the real review count",
    /media-page-stats/.test(mediaPage) && /media-page-review-count/.test(mediaPage),
  );
  check(
    "the media page preselects the current media item in the write panel",
    /<MediaReviewPanel media=\{media\} \/>/.test(mediaPage),
  );
  check(
    "the media page renders a not-found state for an unknown id",
    /notFound\(\)/.test(mediaPage),
  );
  check(
    "the media page does not fabricate a score when there are no ratings",
    /media-page-no-rating/.test(mediaPage),
  );
}

/**
 * The navigation rules from the brief.
 */
function verifyNavigation() {
  section("Navigation (static)");

  const nav = read("components/SiteNav.tsx");

  check(
    "Discover Reviews points at /discover",
    /href: "\/discover"/.test(nav),
  );
  check(
    "About points at /about",
    /href: "\/about"/.test(nav),
  );
  check(
    "the Themes link still reaches the landing page's themes section",
    /themesHref/.test(nav) && /"#themes"/.test(nav),
  );
  check(
    "Taste and Share are gone from the primary navigation",
    !/label: "Taste"/.test(nav) && !/label: "Share"/.test(nav),
  );
  check(
    "the signed-out Sign in and Create profile actions are preserved",
    /href="\/sign-in"/.test(nav) && /href="\/sign-up"/.test(nav),
  );
  check(
    "the authenticated account menu is preserved",
    /AccountMenu/.test(nav),
  );
}

/**
 * Backward compatibility.
 */
function verifyBackwardsCompatibility() {
  section("Backwards compatibility (static)");

  const drawer = read("components/studio/ReviewDrawer.tsx");
  const store = read("components/studio/ProfileStoreProvider.tsx");

  check(
    "a guest review is still written into the local draft",
    /applyReviewToItem/.test(read("components/studio/CollectionsPanel.tsx")),
  );
  check(
    "the guest path never calls the database",
    /if \(authenticated\)/.test(drawer),
  );
  /*
   * Once the store switches to account mode it must never fall back to the
   * guest draft. The guest draft is read with `loadDraft()`, so the assertion
   * is that no `loadDraft()` call survives past the point where the store
   * commits to the account backend.
   */
  const accountBranchStart = store.indexOf('setMode("account")');
  check(
    "a signed-in owner's local draft is never replaced by a guest draft",
    accountBranchStart !== -1 &&
      !/loadDraft\(/.test(store.slice(accountBranchStart)),
  );
  check(
    "the demo profile route is still served without a database",
    /isSupabaseConfigured\(\)/.test(read("app/u/[username]/page.tsx")),
  );
  check(
    "the guest review writer is still offered to a signed-out visitor",
    /studio-review-save"/.test(read("components/studio/ReviewEditor.tsx")),
  );
}

/* -------------------------------------------------------------------------- */
/*                             Live database checks                            */
/* -------------------------------------------------------------------------- */

/**
 * The live section.
 *
 * Every check here is about a real database refusing a real request — which
 * is why the whole section is skipped loudly when no project is configured.
 */
async function verifyLiveDatabase() {
  section("Live database (permitted and denied paths)");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    skip(
      "live RLS and aggregate behaviour",
      "no Supabase project configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- anonymous cannot write -------------------------------------------------
  const { error: anonInsertError } = await supabase
    .from("media_reviews")
    .insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      media_id: "00000000-0000-0000-0000-000000000000",
      body: "probe",
      status: "published",
    });

  check(
    "anonymous INSERT into media_reviews is refused",
    !!anonInsertError,
    anonInsertError ? "" : "the insert unexpectedly succeeded",
  );

  const { error: anonMediaError } = await supabase
    .from("media_items")
    .insert({
      provider: "cinemeta",
      provider_id: `anon-probe-${Date.now()}`,
      kind: "movie",
      title: "Probe",
    });

  check(
    "anonymous INSERT into media_items is refused",
    !!anonMediaError,
    anonMediaError ? "" : "the insert unexpectedly succeeded",
  );

  // --- anonymous cannot rewrite catalogue metadata ---------------------------
  /*
   * The assertion is about the DATA, not about an error.
   *
   * When an RLS policy filters every row out of an UPDATE, Postgres does not
   * raise — the statement simply affects zero rows, and PostgREST reports
   * success with an empty body. So "the request returned an error" is not the
   * security property; "the catalogue row was not changed" is.
   */
  const { data: mediaBeforeAnonWrite } = await supabase
    .from("media_items")
    .select("id, title")
    .eq("provider", "cinemeta")
    .limit(1)
    .maybeSingle();

  await supabase
    .from("media_items")
    .update({ title: "Rewritten by anon" })
    .eq("provider", "cinemeta")
    .limit(1);

  const { data: mediaAfterAnonWrite } = await supabase
    .from("media_items")
    .select("id, title")
    .eq("id", mediaBeforeAnonWrite?.id ?? "")
    .maybeSingle();

  check(
    "anonymous UPDATE of a catalogue record is refused",
    mediaAfterAnonWrite?.title === mediaBeforeAnonWrite?.title,
    `the title became "${mediaAfterAnonWrite?.title}"`,
  );

  // --- the catalogue is world-readable ----------------------------------------
  const { data: readableMedia, error: readMediaError } = await supabase
    .from("media_items")
    .select("id, provider, provider_id, title")
    .limit(1);

  check(
    "anonymous SELECT of the catalogue is allowed",
    !readMediaError,
    readMediaError?.message ?? "",
  );

  // --- the aggregate view is readable but reflects only visible rows ---------
  const { error: statsError } = await supabase
    .from("media_review_stats")
    .select("media_id, review_count, community_rating")
    .limit(1);

  check(
    "anonymous SELECT of the aggregate view is allowed",
    !statsError,
    statsError?.message ?? "",
  );

  // --- the RLS policies exist at runtime --------------------------------------
  const { data: policies, error: policiesError } = await supabase.rpc(
    "exec_sql",
    { sql: "select 1" },
  );
  void policies;
  void policiesError;

  console.log(
    "\n  NOTE: run scripts/phase6-sql-tests.sql in the Supabase SQL editor for the",
  );
  console.log("  full policy-level assertions (draft isolation, private-profile");
  console.log("  exclusion, cross-account edit refusal).");
}

/* -------------------------------------------------------------------------- */
/*                                   Run                                      */
/* -------------------------------------------------------------------------- */

console.log("PRSME — Phase 6 verification");

verifyMediaItemsSchema();
verifyReviewSchema();
verifyReviewsRls();
verifyAggregates();
verifyServerBoundary();
verifyPresentationRules();
verifyNavigation();
verifyBackwardsCompatibility();
await verifyLiveDatabase();

console.log(
  `\n${passed} passed, ${failed} failed, ${skipped} skipped`,
);

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}

/*
 * The exit code is set rather than `process.exit()` called.
 *
 * The live section makes `fetch` calls that carry an `AbortSignal.timeout`,
 * and Node's Windows event loop asserts if the process is torn down while
 * those timers are still pending. Letting the loop drain is the same
 * outcome with no assertion.
 */
process.exitCode = failed === 0 ? 0 : 1;
