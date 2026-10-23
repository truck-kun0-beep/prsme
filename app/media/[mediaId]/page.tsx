import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import {
  ReviewCard,
  ReviewEmptyState,
  formatDate,
  mediaKindLabel,
} from "@/components/reviews/ReviewCards";
import { MediaReviewPanel } from "@/components/reviews/MediaReviewPanel";
import { getMediaItemById, isUuid } from "@/lib/supabase/media";
import {
  getMediaReviewStats,
  listPublishedReviews,
} from "@/lib/supabase/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MEDIA_PROVIDER_LABELS } from "@/lib/media/types";

interface Params {
  mediaId: string;
}

/**
 * Per-request rendering.
 *
 * A media page shows reviews, and which reviews are visible depends on who
 * is asking: a private-profile author's review is invisible to a visitor and
 * visible to its author. A cached response would therefore serve one
 * visitor's view of another visitor's page.
 */
export const dynamic = "force-dynamic";

const REVIEWS_PER_PAGE = 12;

const NOT_FOUND_METADATA: Metadata = {
  title: "Media not found",
  description: "This PRSME media page doesn't exist yet.",
};

/**
 * Page metadata for sharing.
 *
 * Built from the actual media record — its title, its year, and the artwork
 * the provider supplied — so a shared link shows the work rather than a
 * generic string.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { mediaId } = await params;

  if (!isSupabaseConfigured() || !isUuid(mediaId)) return NOT_FOUND_METADATA;

  const media = await getMediaItemById(mediaId);
  if (!media) return NOT_FOUND_METADATA;

  const title = media.title;
  const description = media.creator
    ? `${mediaKindLabel(media.kind)} · ${media.creator}${
        media.year ? ` · ${media.year}` : ""
      }. Reviews and community rating on PRSME.`
    : `${mediaKindLabel(media.kind)}${
        media.year ? ` · ${media.year}` : ""
      }. Reviews and community rating on PRSME.`;

  return {
    title,
    description,
    alternates: { canonical: `/media/${media.id}` },
    openGraph: {
      title: `${title} · PRSME`,
      description,
      type: "article",
      url: `/media/${media.id}`,
      siteName: "PRSME",
      ...(media.artworkUrl ? { images: [media.artworkUrl] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · PRSME`,
      description,
      ...(media.artworkUrl ? { images: [media.artworkUrl] } : {}),
    },
  };
}

/**
 * The media detail page.
 *
 * One canonical media record, every published review of it, and the community
 * rating computed from real ratings. Two people who reviewed the same work
 * both appear here — under ONE media entry, not two.
 */
export default async function MediaPage({ params }: { params: Promise<Params> }) {
  const { mediaId } = await params;

  // Without a database there is no shared catalogue, so there is no media
  // page to show. The demo profile keeps working; this route says so.
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteNav />
        <main id="main" className="container-page py-20">
          <h1 className="font-display text-2xl text-[var(--text-strong)]">
            Media pages need a connected account
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--text-muted)]">
            PRSME&apos;s shared media catalogue lives in the database. Connect a
            Supabase project to browse real reviews here — the demo profile at{" "}
            <Link href="/u/noir" className="underline underline-offset-4">
              /u/noir
            </Link>{" "}
            works without one.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (!isUuid(mediaId)) notFound();

  const media = await getMediaItemById(mediaId);
  if (!media) notFound();

  const [stats, reviews] = await Promise.all([
    getMediaReviewStats(media.id),
    listPublishedReviews({ mediaId: media.id, limit: REVIEWS_PER_PAGE }),
  ]);

  const providerLabel = MEDIA_PROVIDER_LABELS[media.provider];

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        {/* ---- Media header ---- */}
        <section className="container-page pt-10 md:pt-14">
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
              <div className="w-36 shrink-0 sm:w-48">
                <div className="overflow-hidden rounded-xl border border-[var(--line-soft)]">
                  <Artwork
                    palette="iris"
                    src={media.artworkUrl}
                    alt={`${media.title} cover`}
                    ratio="2/3"
                    className="!rounded-none"
                  />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                  {mediaKindLabel(media.kind)}
                </p>
                <h1
                  className="mt-2 font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl"
                  data-testid="media-page-title"
                >
                  {media.title}
                </h1>
                {media.alternateTitle ? (
                  <p className="mt-1 text-[13px] italic text-[var(--text-futed)]">
                    {media.alternateTitle}
                  </p>
                ) : null}

                <p className="mt-2 text-[14px] text-[var(--text-muted)]">
                  {[
                    media.creator
                      ? media.creatorRole
                        ? `${media.creatorRole} ${media.creator}`
                        : media.creator
                      : null,
                    media.year ? String(media.year) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {/* The community score — real ratings only. */}
                <div
                  className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"
                  data-testid="media-page-stats"
                >
                  {stats.communityRating !== null ? (
                    <span className="inline-flex items-center gap-2">
                      <RatingBadge
                        value={stats.communityRating}
                        size="lg"
                        withLabel
                      />
                      <span className="text-[12px] text-[var(--text-faint)]">
                        community rating
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-[13px] text-[var(--text-faint)]"
                      data-testid="media-page-no-rating"
                    >
                      No community rating yet
                    </span>
                  )}

                  <span
                    className="text-[13px] text-[var(--text-muted)]"
                    data-testid="media-page-review-count"
                  >
                    {stats.reviewCount}{" "}
                    {stats.reviewCount === 1 ? "review" : "reviews"}
                  </span>

                  {stats.lastReviewedAt ? (
                    <span className="text-[12px] text-[var(--text-faint)]">
                      Last reviewed {formatDate(stats.lastReviewedAt)}
                    </span>
                  ) : null}
                </div>

                {media.externalUrl ? (
                  <p className="mt-4">
                    <a
                      href={media.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] text-[var(--text-default)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
                      data-testid="media-page-external-link"
                    >
                      View on {providerLabel ?? "the source catalogue"}
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M7 17 17 7" />
                        <path d="M9 7h8v8" />
                      </svg>
                    </a>
                  </p>
                ) : null}

                {media.description ? (
                  <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-[var(--text-muted)]">
                    {media.description}
                  </p>
                ) : null}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---- Reviews + write panel ---- */}
        <section className="container-page mt-12 md:mt-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
            <div className="min-w-0">
              <header className="mb-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                  Reviews
                </p>
                <h2 className="mt-2 font-display text-2xl text-[var(--text-strong)] md:text-3xl">
                  What people wrote.
                </h2>
              </header>

              {reviews.length === 0 ? (
                <ReviewEmptyState
                  title="No reviews yet"
                  body={
                    stats.ratingCount > 0
                      ? "People have rated this, but nobody has written a review yet. Yours would be the first."
                      : "Nobody has reviewed this yet. If you've seen it, yours would be the first."
                  }
                />
              ) : (
                <div className="space-y-4" data-testid="media-page-reviews">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} showMedia={false} />
                  ))}
                </div>
              )}
            </div>

            {/* The write panel. The media item is already selected, so the
                owner never has to search for it again. */}
            <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <MediaReviewPanel media={media} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
