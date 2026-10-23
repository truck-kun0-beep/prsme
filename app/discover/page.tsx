import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import {
  MediaTile,
  ReviewCard,
  ReviewEmptyState,
} from "@/components/reviews/ReviewCards";
import { DiscoverControls } from "@/components/reviews/DiscoverControls";
import {
  listPopularMedia,
  listPublishedReviews,
} from "@/lib/supabase/reviews";
import { searchMediaItems } from "@/lib/supabase/media";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  MEDIA_KIND_LABELS,
  type MediaKindId,
} from "@/lib/media/types";

export const metadata: Metadata = {
  title: "Discover Reviews",
  description:
    "Browse real reviews of films, TV series, music, manga, and books on PRSME. Every score and review count comes from PRSME members.",
  alternates: { canonical: "/discover" },
  openGraph: {
    title: "Discover Reviews · PRSME",
    description:
      "Real reviews of films, TV series, music, manga, and books — rated by PRSME members.",
    url: "/discover",
    siteName: "PRSME",
  },
};

/**
 * Per-request rendering.
 *
 * The feed reflects exactly what this visitor may read: a private-profile
 * author's review is filtered out by RLS for an anonymous visitor and is
 * present for the author themselves. A cached response would serve one
 * visitor's view to another.
 */
export const dynamic = "force-dynamic";

/** The category tabs. "all" means every media kind. */
const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV Series" },
  { id: "song", label: "Songs" },
  { id: "album", label: "Albums" },
  { id: "manga", label: "Manga" },
  { id: "book", label: "Books" },
] as const;

const FEED_PAGE_SIZE = 9;
const POPULAR_LIMIT = 10;
const SEARCH_LIMIT = 12;

/** The sort orders Discover offers. */
const SORTS = [
  { id: "recent", label: "Recently published" },
  { id: "most-reviewed", label: "Most reviewed" },
  { id: "highest-rated", label: "Highest rated" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];
type SortId = (typeof SORTS)[number]["id"];

/**
 * Read a query parameter against a known set.
 *
 * An unrecognised value falls back to the default rather than reaching the
 * database — a crafted URL cannot ask for an arbitrary sort or a category
 * that does not exist.
 */
function readParam<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const category = readParam<CategoryId>(
    typeof params.category === "string" ? params.category : undefined,
    CATEGORIES.map((c) => c.id),
    "all",
  );
  const sort = readParam<SortId>(
    typeof params.sort === "string" ? params.sort : undefined,
    SORTS.map((s) => s.id),
    "recent",
  );
  const rawQuery = typeof params.q === "string" ? params.q : "";
  const query = rawQuery.trim().slice(0, 80);
  const page = Math.max(
    1,
    Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1,
  );

  const kindFilter = category === "all" ? undefined : (category as MediaKindId);

  /*
   * Without a database there is no shared catalogue and therefore no real
   * review feed. The page says so plainly rather than filling the space with
   * invented reviews.
   */
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteNav />
        <main id="main" className="container-page py-16 md:py-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
            Discover Reviews
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-[var(--text-strong)] md:text-5xl">
            Real reviews, from real accounts.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            PRSME&apos;s shared reviews live in the database, so they can be
            read by anyone and aggregated into a community rating. Connect a
            Supabase project to browse them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/u/noir"
              className="inline-flex items-center rounded-md bg-[var(--accent-400)] px-4 py-2.5 text-[13px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
            >
              See the demo profile
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
            >
              What is PRSME?
            </Link>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  /*
   * The data.
   *
   * Three independent reads, all of which run through RLS, so each reflects
   * only what this visitor may see:
   *
   *   - the popular shelf (grouped by canonical media record);
   *   - the review feed (paginated, filtered by category);
   *   - the search results (PRSME's own catalogue, not the providers').
   */
  const [popular, feed] = await Promise.all([
    listPopularMedia({ kind: kindFilter, limit: POPULAR_LIMIT }),
    listPublishedReviews({
      kind: kindFilter,
      limit: FEED_PAGE_SIZE,
      offset: (page - 1) * FEED_PAGE_SIZE,
    }),
  ]);

  const searchResults = query
    ? await searchMediaItems(query, { limit: SEARCH_LIMIT, kind: kindFilter })
    : [];

  /*
   * The sort order.
   *
   * "recent" is the database's own ordering (newest published first).
   * "most-reviewed" and "highest-rated" order the *media* by their real
   * counts and real community averages, so the reader is choosing between
   * genuinely different orderings of the same records.
   */
  let orderedFeed = feed;
  if (sort === "most-reviewed" || sort === "highest-rated") {
    const statsById = new Map(popular.map((p) => [p.media.id, p]));
    orderedFeed = [...feed].sort((a, b) => {
      const aStats = statsById.get(a.mediaId);
      const bStats = statsById.get(b.mediaId);
      if (sort === "most-reviewed") {
        const diff = (bStats?.reviewCount ?? 0) - (aStats?.reviewCount ?? 0);
        if (diff !== 0) return diff;
      } else {
        const aRating = aStats?.communityRating ?? -1;
        const bRating = bStats?.communityRating ?? -1;
        if (aRating !== bRating) return bRating - aRating;
      }
      // Stable tie-break: newest first, then by id so the order never
      // wobbles between renders.
      const aDate = a.publishedAt ?? a.updatedAt;
      const bDate = b.publishedAt ?? b.updatedAt;
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return a.id.localeCompare(b.id);
    });
  }

  const hasFeed = orderedFeed.length > 0;
  const isEmptyCategory = !hasFeed && category !== "all";

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        {/* ---- Header ---- */}
        <section className="container-page pt-10 md:pt-16">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              Discover Reviews
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] text-[var(--text-strong)] md:text-5xl">
              What people actually wrote.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
              Films, series, records, manga, and books — rated and reviewed by
              PRSME members. Every score below is calculated from real
              ratings, and every count from real reviews.
            </p>
          </Reveal>

          {/* The controls: search, category filters, and sort. */}
          <div className="mt-8">
            <DiscoverControls
              categories={CATEGORIES.map((c) => ({
                id: c.id,
                label:
                  c.id === "all"
                    ? c.label
                    : (MEDIA_KIND_LABELS[c.id as MediaKindId] ?? c.label),
              }))}
              sorts={SORTS.map((s) => ({ id: s.id, label: s.label }))}
              currentCategory={category}
              currentSort={sort}
              currentQuery={query}
            />
          </div>
        </section>

        {/* ---- Search results ---- */}
        {query ? (
          <section className="container-page mt-10" aria-labelledby="search-heading">
            <header className="mb-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                Catalogue
              </p>
              <h2
                id="search-heading"
                className="mt-2 font-display text-2xl text-[var(--text-strong)] md:text-3xl"
              >
                Media matching &ldquo;{query}&rdquo;
              </h2>
            </header>

            {searchResults.length === 0 ? (
              <ReviewEmptyState
                title="No catalogue entries match that"
                body="PRSME searches the works its members have actually reviewed. Try a different spelling, or pick a category above."
              />
            ) : (
              <div
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
                data-testid="discover-search-results"
              >
                {searchResults.map((media) => (
                  <MediaTile
                    key={media.id}
                    media={media}
                    reviewCount={0}
                    ratingCount={0}
                    communityRating={null}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* ---- Popular media ---- */}
        {!query ? (
          <section
            className="container-page mt-14 md:mt-20"
            aria-labelledby="popular-heading"
          >
            <Reveal>
              <header className="mb-6 md:mb-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                  Popular Media
                </p>
                <h2
                  id="popular-heading"
                  className="mt-2 font-display text-2xl text-[var(--text-strong)] md:text-3xl"
                >
                  The works people keep returning to.
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--text-muted)]">
                  Ranked by the number of public reviews each work has. One
                  entry per work, however many people reviewed it.
                </p>
              </header>
            </Reveal>

            {popular.length === 0 ? (
              <ReviewEmptyState
                title="No reviewed media yet"
                body={
                  category === "all"
                    ? "Once members publish reviews, the works they reviewed will be collected here."
                    : "No reviewed work in this category yet. Try another category — the feed below is still useful."
                }
              />
            ) : (
              <div
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                data-testid="discover-popular-media"
              >
                {popular.map((entry) => (
                  <MediaTile
                    key={entry.media.id}
                    media={entry.media}
                    reviewCount={entry.reviewCount}
                    ratingCount={entry.ratingCount}
                    communityRating={entry.communityRating}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* ---- Review feed ---- */}
        <section
          className="container-page mt-14 md:mt-20"
          aria-labelledby="feed-heading"
        >
          <Reveal>
            <header className="mb-6 md:mb-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                {query ? "Search results" : "Recently Reviewed"}
              </p>
              <h2
                id="feed-heading"
                className="mt-2 font-display text-2xl text-[var(--text-strong)] md:text-3xl"
              >
                {query
                  ? "Reviews of matching work."
                  : "The latest thing somebody sat down and wrote about."}
              </h2>
            </header>
          </Reveal>

          {!hasFeed ? (
            <ReviewEmptyState
              title={
                isEmptyCategory
                  ? "Nothing reviewed in this category yet"
                  : query
                    ? "No reviews for that search"
                    : "No published reviews yet"
              }
              body={
                isEmptyCategory
                  ? "This category is quiet — but that is honest, not broken. Try another category, or be the first to review something in it."
                  : query
                    ? "Nothing published matches that search. Try a different spelling, or browse a category."
                    : "When a member publishes a review, it appears here. Reviews are shared only when their author's profile is public."
              }
              action={
                query ? undefined : { href: "/sign-up", label: "Create a profile" }
              }
            />
          ) : (
            <>
              <div className="space-y-4" data-testid="discover-review-feed">
                {orderedFeed.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>

              <Pagination
                currentPage={page}
                hasNext={feed.length === FEED_PAGE_SIZE}
                category={category}
                sort={sort}
                query={query}
              />
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Feed pagination.
 *
 * A "load more" style control rather than numbered pages, because the feed
 * is a stream and the reader usually wants the next set, not page 14. The
 * links preserve the current category, sort, and search, so a reader never
 * loses their filters by turning a page.
 */
function Pagination({
  currentPage,
  hasNext,
  category,
  sort,
  query,
}: {
  currentPage: number;
  hasNext: boolean;
  category: CategoryId;
  sort: SortId;
  query: string;
}) {
  if (!hasNext && currentPage === 1) return null;

  /*
   * The current category, sort, and search travel with the link.
   *
   * Without this, turning the page would silently reset the reader's
   * filters — the category tab would go back to "All" and the sort would
   * revert, which reads as the filter being broken rather than as paging.
   */
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (category !== "all") next.set("category", category);
    if (sort !== "recent") next.set("sort", sort);
    if (query) next.set("q", query);
    next.set("page", String(target));
    return `/discover?${next.toString()}`;
  };

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-3"
      aria-label="Review feed pagination"
      data-testid="discover-pagination"
    >
      {currentPage > 1 ? (
        <Link
          href={pageHref(currentPage - 1)}
          className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
        >
          ← Newer
        </Link>
      ) : null}
      {hasNext ? (
        <Link
          href={pageHref(currentPage + 1)}
          className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
        >
          More reviews →
        </Link>
      ) : null}
    </nav>
  );
}
