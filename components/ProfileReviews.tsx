"use client";

/**
 * Phase 6 — the public profile's reviews section.
 *
 * Renders the profile owner's ACTUAL published reviews, read from the shared
 * `media_reviews` table. These are the same records that appear on the media
 * page and in the Discover feed — one review, one record, three surfaces.
 *
 * Design rules, all inherited from the profile system:
 *
 *   - The section consumes the profile-scoped `--pf-*` tokens, so it
 *     recolours with the owner's chosen theme rather than sitting on the
 *     site palette like a graft.
 *   - It renders NOTHING AT ALL when the owner has no published reviews. An
 *     empty section would be a gap in somebody's profile, and a profile with
 *     a heading and no content under it looks broken.
 *   - A review is NOT duplicated here because its media also appears in a
 *     collection. The collection shows the item; this shows the review. They
 *     are different facts about the same work.
 *   - The excerpt is the link to the full review. There is no separate "Full
 *     review" button — a second control that restates what the excerpt
 *     already offers is noise.
 */

import Link from "next/link";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import type { Review } from "@/lib/supabase/reviews";
import { MEDIA_KIND_LABELS, type MediaKindId } from "@/lib/media/types";

/** Word-boundary truncation for a review excerpt. */
function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`;
}

export function ProfileReviews({ reviews }: { reviews: Review[] }) {
  // Only written reviews belong here — a rating-only record is a score, not
  // something to show as a written entry.
  const written = reviews.filter((review) => review.body.trim().length > 0);

  if (written.length === 0) return null;

  return (
    <section
      aria-labelledby="reviews-heading"
      className="profile-canvas pf-section"
      data-testid="profile-reviews-section"
    >
      <header className="pf-eyebrow">Reviews</header>
      <h2
        id="reviews-heading"
        className="pf-display mt-2.5 text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]"
      >
        What they wrote.
      </h2>
      <p className="pf-body mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--pf-text-muted)]">
        {written.length} published {written.length === 1 ? "review" : "reviews"} —
        the same ones shown on each title&apos;s page.
      </p>

      <ul className="pf-collection mt-7 space-y-4">
        {written.map((review) => {
          const media = review.media;
          return (
            <li key={review.id}>
              <article
                className="pf-collection flex gap-4 p-3.5 sm:p-4"
                data-testid="profile-review"
              >
                {media ? (
                  <Link
                    href={`/media/${media.id}`}
                    className="h-24 w-[4.25rem] shrink-0 overflow-hidden rounded-md sm:h-28 sm:w-20"
                    aria-label={`Open ${media.title}`}
                    tabIndex={-1}
                  >
                    <Artwork
                      palette="iris"
                      src={media.artworkUrl}
                      alt={`${media.title} cover`}
                      ratio="2/3"
                      className="!rounded-none"
                    />
                  </Link>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      {media ? (
                        <h3
                          className="pf-display pf-clamp-2 text-[1.0625rem] leading-snug"
                          title={media.title}
                        >
                          <Link
                            href={`/media/${media.id}`}
                            className="hover:underline hover:decoration-dotted hover:underline-offset-4"
                          >
                            {media.title}
                          </Link>
                        </h3>
                      ) : null}
                      <p className="pf-meta mt-0.5">
                        {[
                          media
                            ? (MEDIA_KIND_LABELS[media.kind as MediaKindId] ??
                              "Media")
                            : null,
                          media?.year,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    {review.rating !== null ? (
                      <RatingBadge
                        value={review.rating}
                        size="md"
                        className="shrink-0"
                      />
                    ) : null}
                  </div>

                  {review.title ? (
                    <h4 className="pf-body mt-2 text-[14px] font-medium leading-snug text-[var(--pf-text-strong)]">
                      {review.title}
                    </h4>
                  ) : null}

                  {review.isSpoiler ? (
                    <details className="pf-collection mt-2.5 px-3 py-2.5">
                      <summary className="pf-body cursor-pointer text-[13px] font-medium text-[var(--pf-text-strong)]">
                        Contains spoilers — click to reveal
                      </summary>
                      <p className="pf-body mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--pf-text)]">
                        {truncate(review.body, 320)}
                      </p>
                    </details>
                  ) : (
                    <Link
                      href={`/review/${review.id}`}
                      className="group mt-2 inline-flex max-w-full items-baseline gap-1.5 text-left"
                      aria-label={`Read the full review${
                        media ? ` of ${media.title}` : ""
                      }`}
                      data-testid={`profile-review-link-${review.id}`}
                    >
                      <span className="pf-body pf-clamp-3 text-[14px] leading-relaxed text-[var(--pf-text-muted)] group-hover:text-[var(--pf-text)]">
                        &ldquo;{truncate(review.body, 260)}&rdquo;
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 shrink-0 translate-y-px text-[var(--pf-text-faint)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="9.5,6 15.5,12 9.5,18" />
                      </svg>
                    </Link>
                  )}

                  <p className="pf-meta mt-2">
                    {review.publishedAt
                      ? `Published ${new Date(
                          review.publishedAt,
                        ).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}`
                      : "Published"}
                  </p>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
