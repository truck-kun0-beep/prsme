import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import { formatDate, mediaKindLabel } from "@/components/reviews/ReviewCards";
import { getReviewById } from "@/lib/supabase/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MEDIA_PROVIDER_LABELS } from "@/lib/media/types";

interface Params {
  reviewId: string;
}

/**
 * Per-request rendering.
 *
 * Whether a review is readable depends on its author's profile visibility,
 * so a cached copy could serve one visitor's view of another visitor's page.
 */
export const dynamic = "force-dynamic";

const NOT_FOUND_METADATA: Metadata = {
  title: "Review not found",
  description: "This PRSME review doesn't exist, or isn't public.",
};

/**
 * The full review.
 *
 * One review, read from the database, with the author's attribution and the
 * media it is about. This is the destination for every review excerpt in
 * Discover, on a media page, and on a public profile.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { reviewId } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteNav />
        <main id="main" className="container-page py-20">
          <h1 className="font-display text-2xl text-[var(--text-strong)]">
            Reviews need a connected account
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--text-muted)]">
            PRSME&apos;s shared reviews live in the database. Connect a Supabase
            project to read real reviews here.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  // A missing or unreadable review is a not-found, not a blank page. The
  // two cases are deliberately indistinguishable: a private-profile author's
  // review must not be discoverable by its absence.
  const review = await getReviewById(reviewId);
  if (!review || !review.media) notFound();

  const media = review.media;
  const providerLabel = MEDIA_PROVIDER_LABELS[media.provider];
  const authorLabel = review.authorUsername
    ? `@${review.authorUsername}`
    : review.authorDisplayName ?? "A PRSME member";

  return (
    <>
      <SiteNav />
      <main id="main" className="container-page py-10 md:py-14">
        <Link
          href={`/media/${media.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--text-default)]"
        >
          ← Back to {media.title}
        </Link>

        <article
          className="mt-5 overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)]"
          data-testid="review-detail"
        >
          <header className="flex gap-4 border-b border-[var(--line-soft)] p-5 sm:gap-6 sm:p-7">
            <Link
              href={`/media/${media.id}`}
              className="h-32 w-24 shrink-0 overflow-hidden rounded-lg sm:h-44 sm:w-32"
              aria-label={`Open ${media.title}`}
            >
              <Artwork
                palette="iris"
                src={media.artworkUrl}
                alt={`${media.title} cover`}
                ratio="2/3"
                className="!rounded-none"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                {mediaKindLabel(media.kind)}
              </p>
              <h1
                className="mt-1.5 font-display text-2xl leading-tight text-[var(--text-strong)] sm:text-3xl"
                data-testid="review-detail-title"
              >
                {media.title}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                {[
                  media.creator,
                  media.year ? String(media.year) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {review.rating !== null ? (
                <div className="mt-3">
                  <RatingBadge
                    value={review.rating}
                    size="lg"
                    withLabel
                  />
                </div>
              ) : null}

              <p className="mt-3 text-[12px] text-[var(--text-faint)]">
                Reviewed by {authorLabel}
                {review.publishedAt
                  ? ` · ${formatDate(review.publishedAt)}`
                  : ""}
              </p>
            </div>
          </header>

          <div className="p-5 sm:p-7">
            {review.title ? (
              <h2
                className="font-display text-xl leading-snug text-[var(--text-strong)] sm:text-2xl"
                data-testid="review-detail-headline"
              >
                {review.title}
              </h2>
            ) : null}

            {review.isSpoiler ? (
              <details
                className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)] p-4"
                data-testid="review-detail-spoiler"
              >
                <summary className="cursor-pointer text-[14px] font-medium text-[var(--text-strong)]">
                  Contains spoilers — click to reveal
                </summary>
                <p
                  className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-default)]"
                  data-testid="review-detail-body"
                >
                  {review.body}
                </p>
              </details>
            ) : (
              <p
                className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-default)]"
                data-testid="review-detail-body"
              >
                {review.body}
              </p>
            )}

            {media.externalUrl ? (
              <p className="mt-7 border-t border-[var(--line-soft)] pt-4 text-[12px] text-[var(--text-faint)]">
                Catalogue entry:{" "}
                <a
                  href={media.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-muted)]"
                >
                  {providerLabel ?? "the source catalogue"}
                </a>
              </p>
            ) : null}
          </div>
        </article>

        <div className="mt-8">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
          >
            ← More reviews on Discover
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { reviewId } = await params;

  if (!isSupabaseConfigured()) return NOT_FOUND_METADATA;

  const review = await getReviewById(reviewId);
  if (!review || !review.media) return NOT_FOUND_METADATA;

  const title = review.title
    ? `${review.title} — ${review.media.title}`
    : `A review of ${review.media.title}`;

  return {
    title,
    description: review.body.slice(0, 200),
    alternates: { canonical: `/review/${review.id}` },
    openGraph: {
      title: `${title} · PRSME`,
      description: review.body.slice(0, 200),
      type: "article",
      url: `/review/${review.id}`,
      siteName: "PRSME",
      ...(review.media.artworkUrl
        ? { images: [review.media.artworkUrl] }
        : {}),
    },
  };
}
