/**
 * Phase 6.1 — focused browser checks for the Phase 6 routes.
 *
 * Three routes, two widths, one real browser. The checks are deliberately
 * narrow: the brief asks for a representative mobile width and a desktop
 * width on Discover Reviews, media details, and the full-review flow — not
 * an exhaustive sweep of unrelated components.
 *
 * What is asserted:
 *
 *   - each route renders real content, not a blank page;
 *   - the review excerpt on Discover opens the full review;
 *   - the media page groups its reviews under one canonical media record;
 *   - the full review page shows the complete text and the rating;
 *   - nothing overflows horizontally at either width;
 *   - the theme and typography still render (the Phase 2–6 visual contract
 *     is preserved).
 */
import { connect } from "../cdp.mjs";
import { REST_URL, ANON_KEY } from "./harness.mjs";
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

/* ---- a fixture: one account, one work, one published review ---- */
const email = `browser-${RUN}@example.test`;
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

const username = `browser${RUN}`.toLowerCase().slice(0, 24);
await client.from("profiles").insert({
  user_id: userId,
  username,
  visibility: "public",
});

const { data: media } = await client
  .from("media_items")
  .insert({
    provider: "cinemeta",
    provider_id: `browser-${RUN}`,
    kind: "movie",
    title: `Browser Film ${RUN}`,
    creator: "A Director",
    release_year: 2024,
  })
  .select()
  .single();

const BODY = `A browser-driven review. The final act lands properly. ${RUN}`;
const { data: review } = await client
  .from("media_reviews")
  .insert({
    user_id: userId,
    media_id: media.id,
    rating: 8.5,
    title: `Browser Headline ${RUN}`,
    body: BODY,
    status: "published",
  })
  .select()
  .single();

console.log(`\nFixture: /media/${media.id}  /review/${review.id}  @${username}\n`);

const browser = await connect();

/* ---- the two widths ---- */
const WIDTHS = [
  { label: "mobile 390px", width: 390, height: 844 },
  { label: "desktop 1280px", width: 1280, height: 900 },
];

for (const { label, width, height } of WIDTHS) {
  section(`${label}`);

  await browser.setViewport(width, height);

  /* ---- Discover ---- */
  await browser.goto(`${BASE}/discover`, { waitMs: 2500 });

  const discover = await browser.evalJs(`
    const feed = document.querySelector('[data-testid="discover-review-feed"]');
    const cards = document.querySelectorAll('[data-testid="review-card"]');
    const ours = Array.from(cards).filter((c) => c.textContent.includes(${JSON.stringify(`Browser Headline ${RUN}`)}));
    return {
      hasFeed: Boolean(feed),
      cardCount: cards.length,
      ourCards: ours.length,
      ourLink: ours[0] ? (ours[0].querySelector('a[href^="/review/"]')?.getAttribute('href') ?? null) : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasControls: Boolean(document.querySelector('[data-testid="discover-controls"]')),
      themeAttr: document.documentElement.getAttribute('data-theme'),
    };
  `);

  check(`${label}: Discover renders its feed`, discover?.hasFeed === true, JSON.stringify(discover));
  check(`${label}: Discover renders review cards`, (discover?.cardCount ?? 0) > 0);
  check(`${label}: the new review appears in Discover`, (discover?.ourCards ?? 0) >= 1);
  check(`${label}: Discover's controls are present`, discover?.hasControls === true);
  check(
    `${label}: Discover does not overflow horizontally`,
    (discover?.overflow ?? 1) <= 0,
    `overflow was ${discover?.overflow}px`,
  );
  check(
    `${label}: the theme is still applied`,
    typeof discover?.themeAttr === "string" && discover.themeAttr.length > 0,
    `data-theme was ${discover?.themeAttr}`,
  );

  /* ---- the excerpt opens the full review ---- */
  check(
    `${label}: the review excerpt links to the full review`,
    discover?.ourLink === `/review/${review.id}`,
    `the link was ${discover?.ourLink}`,
  );

  if (discover?.ourLink) {
    await browser.goto(`${BASE}${discover.ourLink}`, { waitMs: 2500 });

    const detail = await browser.evalJs(`
      const article = document.querySelector('[data-testid="review-detail"]');
      const body = document.querySelector('[data-testid="review-detail-body"]');
      const headline = document.querySelector('[data-testid="review-detail-headline"]');
      return {
        hasArticle: Boolean(article),
        body: body ? body.textContent.trim() : null,
        headline: headline ? headline.textContent.trim() : null,
        hasRating: document.body.textContent.includes('8.5'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    `);

    check(`${label}: the full review page renders`, detail?.hasArticle === true, JSON.stringify(detail));
    check(
      `${label}: the full review page shows the complete body`,
      detail?.body === BODY,
      `the body read "${detail?.body}"`,
    );
    check(
      `${label}: the full review page shows the headline`,
      detail?.headline === `Browser Headline ${RUN}`,
      `the headline read "${detail?.headline}"`,
    );
    check(`${label}: the full review page shows the rating`, detail?.hasRating === true);
    check(
      `${label}: the full review page does not overflow horizontally`,
      (detail?.overflow ?? 1) <= 0,
      `overflow was ${detail?.overflow}px`,
    );
  }

  /* ---- the media page ---- */
  await browser.goto(`${BASE}/media/${media.id}`, { waitMs: 2500 });

  const mediaPage = await browser.evalJs(`
    const cards = document.querySelectorAll('[data-testid="review-card"]');
    const links = Array.from(cards).map((c) => c.querySelector('a[href^="/review/"]')?.getAttribute('href'));
    const count = document.querySelector('[data-testid="media-page-review-count"]');
    const title = document.querySelector('[data-testid="media-page-title"]');
    const stats = document.querySelector('[data-testid="media-page-stats"]');
    return {
      title: title ? title.textContent.trim() : null,
      cardCount: cards.length,
      distinctReviews: new Set(links.filter(Boolean)).size,
      links,
      reviewCountText: count ? count.textContent.replace(/\\s+/g, ' ').trim() : null,
      hasStats: Boolean(stats),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(
    `${label}: the media page shows the work's title`,
    mediaPage?.title === `Browser Film ${RUN}`,
    `the title read "${mediaPage?.title}"`,
  );
  check(`${label}: the media page shows its stats`, mediaPage?.hasStats === true);
  check(
    `${label}: the media page shows the review`,
    (mediaPage?.cardCount ?? 0) >= 1,
    `${mediaPage?.cardCount} card(s)`,
  );
  check(
    `${label}: the media page renders one card per review, with no duplicates`,
    (mediaPage?.distinctReviews ?? 0) === (mediaPage?.cardCount ?? -1),
    `${mediaPage?.distinctReviews} distinct of ${mediaPage?.cardCount} cards`,
  );
  check(
    `${label}: the media page reports a review count`,
    typeof mediaPage?.reviewCountText === "string" && /review/.test(mediaPage.reviewCountText),
    `the count read "${mediaPage?.reviewCountText}"`,
  );
  check(
    `${label}: the media page does not overflow horizontally`,
    (mediaPage?.overflow ?? 1) <= 0,
    `overflow was ${mediaPage?.overflow}px`,
  );

  /* ---- the review excerpt on the media page opens the full review ---- */
  check(
    `${label}: the media page's review links to the full review`,
    (mediaPage?.links ?? []).includes(`/review/${review.id}`),
    `the links were ${JSON.stringify(mediaPage?.links)}`,
  );

  /* ---- the about page, which is one of the Phase 6 routes ---- */
  await browser.goto(`${BASE}/about`, { waitMs: 2000 });

  const about = await browser.evalJs(`
    return {
      hasMain: Boolean(document.querySelector('main')),
      text: (document.querySelector('main')?.textContent ?? '').trim().length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(`${label}: /about renders real content`, (about?.text ?? 0) > 200, `${about?.text} characters`);
  check(
    `${label}: /about does not overflow horizontally`,
    (about?.overflow ?? 1) <= 0,
    `overflow was ${about?.overflow}px`,
  );

  /* ---- the demo profile ---- */
  await browser.goto(`${BASE}/u/noir`, { waitMs: 2500 });

  const noir = await browser.evalJs(`
    return {
      hasProfile: Boolean(document.querySelector('h1')),
      text: (document.body.textContent ?? '').trim().length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  `);

  check(`${label}: /u/noir still renders`, (noir?.text ?? 0) > 500, `${noir?.text} characters`);
  check(
    `${label}: /u/noir does not overflow horizontally`,
    (noir?.overflow ?? 1) <= 0,
    `overflow was ${noir?.overflow}px`,
  );
}

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);