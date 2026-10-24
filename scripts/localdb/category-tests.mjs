/**
 * Phase 6.1 — check the Discover category filter and pagination.
 *
 * THE SUSPICION
 *
 * `listPublishedReviews` paginates in SQL (`.range(offset, offset + limit - 1)`)
 * and only THEN filters by media kind, in JavaScript. So the database pages
 * over EVERY kind, and the category filter discards whatever did not match.
 *
 * Two consequences, both of which this probes:
 *
 *   1. a category page shows FEWER reviews than the page size, even when
 *      there are more to show;
 *   2. the "More reviews" link is rendered only when the page came back
 *      exactly full, so the remaining reviews are unreachable.
 *
 * This seeds a controlled set — enough albums to push the movies past the
 * first page — and then reads the real pages over HTTP.
 */
import { createClient } from "@supabase/supabase-js";
import { REST_URL, ANON_KEY } from "./harness.mjs";

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

/* ---- an account to write with ---- */
const email = `catfilter-${RUN}@example.test`;
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

await client.from("profiles").insert({
  user_id: userId,
  username: `catfilter${RUN}`.toLowerCase().slice(0, 24),
  visibility: "public",
});

/* ---- the controlled set ---- */
// One film, reviewed many times is impossible (one review per author per
// media), so the set is built from DISTINCT works: 3 films and 12 albums.
// The films are published most recently, so they sit at the TOP of the
// unfiltered feed — which is exactly where the JS filter would find them,
// and exactly where a naive implementation hides the albums behind them.
const FILMS = 3;
const ALBUMS = 12;

for (let i = 0; i < FILMS; i += 1) {
  const providerId = `catfilter-film-${RUN}-${i}`;
  const { data: media } = await client
    .from("media_items")
    .insert({
      provider: "cinemeta",
      provider_id: providerId,
      kind: "movie",
      title: `Category Film ${i} ${RUN}`,
    })
    .select()
    .single();

  await client.from("media_reviews").insert({
    user_id: userId,
    media_id: media.id,
    rating: 8,
    body: `A film review for the category filter check. ${RUN} ${i}`,
    title: `Film review ${i} ${RUN}`,
    status: "published",
  });
}

for (let i = 0; i < ALBUMS; i += 1) {
  const providerId = `catfilter-album-${RUN}-${i}`;
  const { data: media } = await client
    .from("media_items")
    .insert({
      provider: "cinemeta",
      provider_id: providerId,
      kind: "album",
      title: `Category Album ${i} ${RUN}`,
    })
    .select()
    .single();

  await client.from("media_reviews").insert({
    user_id: userId,
    media_id: media.id,
    rating: 7,
    body: `An album review for the category filter check. ${RUN} ${i}`,
    title: `Album review ${i} ${RUN}`,
    status: "published",
  });
}

/* ---- what the database actually holds ---- */
const { data: allRows } = await client
  .from("media_reviews")
  .select("id, title")
  .like("title", `%${RUN}%`);

const filmRows = (allRows ?? []).filter((r) => r.title.startsWith("Film review"));
const albumRows = (allRows ?? []).filter((r) => r.title.startsWith("Album review"));

console.log(`\nSeeded ${filmRows.length} film reviews and ${albumRows.length} album reviews.\n`);

/* ---- read the real pages ---- */
async function readPage(category, page) {
  const url = `${BASE}/discover?category=${category}&page=${page}`;
  const res = await fetch(url);
  const html = await res.text();

  const links = [...html.matchAll(/href="\/review\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const headlines = [...html.matchAll(/Film review \d+ [^<]*|Album review \d+ [^<]*/g)].map(
    (m) => m[0].trim(),
  );

  return {
    status: res.status,
    links,
    headlines,
    hasMoreLink: html.includes("More reviews"),
    html,
  };
}

const filmPage1 = await readPage("movie", 1);
const albumPage1 = await readPage("album", 1);
const albumPage2 = await readPage("album", 2);

console.log(`movie page 1: ${filmPage1.headlines.length} review link(s)`);
console.log(`album page 1: ${albumPage1.headlines.length} review link(s)`);
console.log(`album page 2: ${albumPage2.headlines.length} review link(s)\n`);

check(
  "the movie category shows only movie reviews",
  filmPage1.headlines.every((h) => h.startsWith("Film review")),
  `saw: ${JSON.stringify(filmPage1.headlines.slice(0, 4))}`,
);

check(
  "the album category shows only album reviews",
  albumPage1.headlines.every((h) => h.startsWith("Album review")),
  `saw: ${JSON.stringify(albumPage1.headlines.slice(0, 4))}`,
);

/*
 * The reachability check.
 *
 * Every album review must be reachable by paging. If the category filter
 * discards rows after the SQL page has been taken, the albums beyond the
 * first page are simply never shown.
 */
const albumsSeen = new Set([
  ...albumPage1.headlines,
  ...albumPage2.headlines,
]);

const albumTitles = new Set(
  albumRows.map((r) => r.title),
);

check(
  "every album review is reachable by paging through the album category",
  [...albumTitles].every((t) => albumsSeen.has(t)),
  `${albumTitles.size - [...albumTitles].filter((t) => albumsSeen.has(t)).length} of ${
    albumTitles.size
  } album reviews were never shown`,
);

check(
  "the album category offers a way to reach the next page",
  albumPage1.hasMoreLink,
  "no 'More reviews' link was rendered, so the remaining albums are unreachable",
);

/* ---- no duplicates across pages ---- */
const overlap = albumPage1.links.filter((id) => albumPage2.links.includes(id));
check(
  "paging does not duplicate a review",
  overlap.length === 0,
  `${overlap.length} review(s) appeared on both pages`,
);

process.exit(failed > 0 ? 1 : 0);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}

process.exit(failed > 0 ? 1 : 0);