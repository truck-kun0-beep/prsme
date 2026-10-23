/**
 * Phase 6 — shared review presentation components.
 *
 * These render a *database-backed* review: the normalised `media_reviews`
 * row joined to its canonical media record and its author. They are used by
 * the Discover feed, the media detail page, and the public profile, so a
 * review looks the same wherever it appears.
 *
 * Honesty rules encoded here:
 *
 *   - A rating is only rendered when there IS a rating. No score means no
 *     badge, never a zero that reads like a real judgement.
 *   - The community rating is rendered as a *community* figure and is
 *     explicitly "no score yet" when the database has no valid ratings.
 *   - A review count is the count of published reviews with written text.
 *     There is no engagement, no likes, no views, no made-up popularity.
 *   - A spoiler review is collapsed behind a real `<details>` element, so it
 *     is hidden from the page and from a screen reader until asked for.
 *
 * The site tokens (`--surface-*`, `--text-*`, `--accent-*`) are used rather
 * than the profile-scoped `--pf-*` ones: these components live on the site
 * pages, not inside somebody's themed profile.
 */

import Link from "next/link";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import type { Review, MediaItem } from "@/lib/supabase/reviews";
import { MEDIA_KIND_LABELS, MEDIA_PROVIDER_LABELS, type MediaKindId } from "@/lib/media/types";

/** Word-boundary truncation for a review excerpt. */
export function truncateExcerpt(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`;
}

/** The human label for a catalogue kind. */
export function mediaKindLabel(kind: string): string {
  return MEDIA_KIND_LABELS[kind as MediaKindId] ?? "Media";
}

/**
 * The link to a review's full text.
 *
 * Reviews live at `/review/[id]` — a stable route that reads the row from the
 * database, so it works for any review by any account.
 */
export function reviewHref(reviewId: string): string {
  return `/review/${reviewId}`;
}

/**
 * The palette for a media item's placeholder artwork.
 *
 * A deterministic pick from the media id, so the same work always renders the
 * same placeholder colour between renders. A random pick would make a
 * Discover card change appearance on every re-render, which reads as a bug.
 */
const PLACEHOLDER_PALETTES = [
  "amber",
  "iris",
  "rose",
  "cyan",
  "forest",
  "sand",
  "mono",
  "violet",
  "rust",
] as const;

function paletteForMedia(media: MediaItem | null) {
  const seed = media?.id ?? "";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_PALETTES[hash % PLACEHOLDER_PALETTES.length]!;
}

/**
 * A media tile — the artwork, title, kind, and optional community score.
 *
 * Used by the Popular Media shelf. The whole tile links to the media page, so
 * a reader can get from a shelf to the reviews of one work in one click.
 */
export function MediaTile({
  media,
  reviewCount,
  communityRating,
  ratingCount,
}: {
  media: MediaItem;
  reviewCount: number;
  communityRating: number | null;
  ratingCount: number;
}) {
  const providerLabel = MEDIA_PROVIDER_LABELS[media.provider];

  return (
    <article className="group min-w-0" data-testid="media-tile">
      <Link
        href={`/media/${media.id}`}
        className="block focus-visible:outline-none"
        aria-label={`${media.title} — ${reviewCount} ${
          reviewCount === 1 ? "review" : "reviews"
        }`}
      >
        <div className="relative overflow-hidden rounded-lg border border-[var(--line-soft)] transition-colors group-hover:border-[var(--line-strong)]">
          <Artwork
            palette={paletteForMedia(media)}
            src={media.artworkUrl}
            alt={`${media.title} cover`}
            ratio="2/3"
            className="!rounded-none"
          />
        </div>
        <h3 className="mt-2.5 line-clamp-2 text-[14px] font-medium leading-snug text-[var(--text-strong)]">
          {media.title}
        </h3>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          {mediaKindLabel(media.kind)}
          {media.year ? ` · ${media.year}` : ""}
        </p>
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {communityRating !== null ? (
          <span
            className="inline-flex items-center gap-1.5"
            data-testid="media-tile-community-rating"
          >
            <RatingBadge value={communityRating} size="sm" />
            <span className="text-[11px] text-[var(--text-faint)]">
              community
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-faint)]">
            No community score yet
          </span>
        )}
        <span
          className="text-[11px] text-[var(--text-faint)]"
          data-testid="media-tile-review-count"
        >
          {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
          {ratingCount > 0 ? ` · ${ratingCount} ${
            ratingCount === 1 ? "rating" : "ratings"
          }` : ""}
        </span>
      </div>
      {providerLabel ? (
        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
          Artwork and details from {providerLabel}
        </p>
      ) : null}
    </article>
  );
}

/**
 * A review card — the feed's primary unit.
 *
 * The artwork is on the left, the review's words on the right, and the
 * personal score is visually prominent because it is the thing the reader
 * came for.
 *
 * The excerpt IS the link to the full review. There is deliberately no
 * separate "Full review" button: a second click on a control that restates
 * what the excerpt already offers is noise. The visible cue is the excerpt
 * text plus a quiet chevron.
 *
 * Cards are NOT a fixed height. The brief asks for excerpts that stay
 * readable without every card being forced to the same height, so the card
 * grows with its content and the grid aligns to the top.
 */
export function ReviewCard({
  review,
  showMedia = true,
}: {
  review: Review;
  showMedia?: boolean;
}) {
  const media = review.media;
  const excerpt = truncateExcerpt(review.body, 320);
  const authorLabel = review.authorUsername
    ? `@${review.authorUsername}`
    : review.authorDisplayName ?? "A PRSME member";
  const publishedLabel = formatDate(review.publishedAt ?? review.updatedAt);

  return (
    <article
      className="surface-card flex gap-4 p-4 sm:gap-5 sm:p-5"
      data-testid="review-card"
      data-review-id={review.id}
    >
      {showMedia && media ? (
        <Link
          href={`/media/${media.id}`}
          className="shrink-0"
          aria-label={`Open ${media.title}`}
          tabIndex={-1}
        >
          <div className="h-28 w-[4.5rem] overflow-hidden rounded-md sm:h-36 sm:w-24">
            <Artwork
              palette={paletteForMedia(media)}
              src={media.artworkUrl}
              alt={`${media.title} cover`}
              ratio="2/3"
              className="!rounded-none"
            />
          </div>
        </Link>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            {showMedia && media ? (
              <h3 className="truncate text-[15px] font-medium text-[var(--text-strong)]">
                <Link
                  href={`/media/${media.id}`}
                  className="hover:underline hover:decoration-dotted hover:underline-offset-4"
                >
                  {media.title}
                </Link>
              </h3>
            ) : null}
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              {showMedia && media ? (
                <>
                  {mediaKindLabel(media.kind)}
                  {media.creator ? ` · ${media.creator}` : ""}
                </>
              ) : null}
            </p>
          </div>

          {review.rating !== null ? (
            <RatingBadge
              value={review.rating}
              size="md"
              withLabel
              className="shrink-0"
            />
          ) : null}
        </div>

        {review.title ? (
          <h4 className="mt-2 text-[14px] font-medium leading-snug text-[var(--text-default)]">
            {review.title}
          </h4>
        ) : null}

        {review.isSpoiler ? (
          <details
            className="mt-2.5 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5"
            data-testid="review-card-spoiler"
          >
            <summary className="cursor-pointer text-[13px] font-medium text-[var(--text-default)]">
              Contains spoilers — click to reveal
            </summary>
            <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-default)]">
              {excerpt}
            </p>
          </details>
        ) : (
          <Link
            href={reviewHref(review.id)}
            className="group mt-2.5 inline-flex max-w-full items-baseline gap-1.5 text-left"
            aria-label={`Read the full review of ${
              media?.title ?? "this title"
            } by ${authorLabel}`}
            data-testid="review-card-excerpt"
          >
            <span className="line-clamp-3 text-[14px] leading-relaxed text-[var(--text-muted)] group-hover:text-[var(--text-default)]">
              &ldquo;{excerpt}&rdquo;
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 translate-y-px text-[var(--text-faint)]"
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

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-faint)]">
          <span data-testid="review-card-author">{authorLabel}</span>
          {publishedLabel ? (
            <>
              <span aria-hidden>·</span>
              <span>{publishedLabel}</span>
            </>
          ) : null}
          {review.status === "draft" ? (
            <span className="rounded-full border border-[var(--line-strong)] px-1.5 py-0.5 uppercase tracking-[0.14em]">
              Draft
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}

/**
 * The empty state for a review list.
 *
 * Deliberately says what is missing rather than filling the space with
 * example reviews. A feed that shows fake content is worse than an empty
 * feed.
 */
export function ReviewEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] px-5 py-10 text-center"
      data-testid="review-empty-state"
    >
      <h3 className="text-[15px] font-medium text-[var(--text-strong)]">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--text-muted)]">
        {body}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3.5 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Format an ISO timestamp as a readable date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
