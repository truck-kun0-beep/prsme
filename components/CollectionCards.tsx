"use client";

/**
 * Collection layout components.
 *
 * Phase 4.2 rebuilt all four compositions. Three genuinely distinct
 * treatments plus one new music-specific one, all consuming the
 * profile-scoped `--pf-*` tokens so a theme switch recolours artwork frames,
 * ratings, borders, and metadata together:
 *
 *   - `PosterGridCollection` -> a horizontal media shelf. Poster cards get a
 *     readable minimum width and a preserved `aspect-ratio: 2 / 3`, with the
 *     rail's overflow contained inside the shelf (never widening the page).
 *   - `FeaturedCollection`  -> ONE hero card with its own independent artwork
 *     container, beside a SEPARATE list card holding every other item. The two
 *     are separate grid children, so they cannot overlap. Text sits over a
 *     deliberate bottom gradient, inside that one hero card only.
 *   - `CompactCollection`   -> a dense `artwork | title + meta | rating` list
 *     built on an explicit CSS Grid with fixed column sizing. The index column
 *     is a small fixed gutter *next to* the title, never spread to the far
 *     edge of the page.
 *   - `SoundtrackListCollection` -> a vertical list of compact soundtrack cards
 *     (square art / title / artist / album / rating) for music collections.
 *
 * Every item's personal rating is rendered by `RatingBadge` from its OWN
 * `myRating`, so a rating is never shown against the wrong item.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Artwork } from "./Artwork";
import { RatingBadge } from "./RatingBadge";
import { hasReview } from "./ReviewExcerptLink";
import type { ProfileCollection, ProfileMediaItem } from "@/lib/noirProfile";

/** Word-boundary truncation for a short review excerpt. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}\u2026`;
}

/**
 * The profile these cards belong to.
 *
 * Phase 4 already hard-codes the demo owner here (the review route resolves
 * from the same draft), so this stays a single source rather than threading a
 * username through every layout.
 */
const USERNAME = "noir";

/** The full-review path every layout links to. */
function reviewHref(itemId: string): string {
  return `/u/${USERNAME}/review/${itemId}`;
}

/**
 * Phase 4.2 -- the review excerpt IS the interaction.
 *
 * Section 8 removes the separate "Full review" button. What replaces it is the
 * whole excerpt block wrapped in a real anchor, so it is keyboard-navigable,
 * open-in-new-tab works, and it carries an accessible name. The visible cue is
 * the excerpt text itself plus a quiet chevron, which reads as "this opens"
 * without shouting "button" over the owner's prose.
 */
function ReviewExcerpt({
  item,
  variant = "list",
  maxChars = 150,
}: {
  item: ProfileMediaItem;
  variant?: "hero" | "list" | "poster";
  maxChars?: number;
}) {
  if (!hasReview(item)) return null;
  const text = item.myReview?.trim() ?? item.myReviewTitle?.trim() ?? "";
  const preview = truncate(text, maxChars);

  if (variant === "hero") {
    return (
      <Link
        href={reviewHref(item.id)}
        data-testid={`review-link-${item.id}`}
        className="pf-featured-review group/review mt-3 inline-flex max-w-full flex-col rounded-md text-left text-[var(--pf-text)] transition-colors hover:text-[var(--pf-text-strong)] focus-visible:outline-none"
        aria-label={`Read the full review of ${item.title}`}
      >
        <span className="pf-clamp-3 text-[14px] leading-relaxed">
          &ldquo;{preview}&rdquo;
        </span>
        <span className="pf-meta mt-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--pf-text-muted)] group-hover/review:underline group-hover/review:decoration-dotted group-hover/review:underline-offset-2">
          Read the whole review
          <Chevron direction="right" className="h-3 w-3" />
        </span>
      </Link>
    );
  }

  if (variant === "poster") {
    return (
      <Link
        href={reviewHref(item.id)}
        data-testid={`review-link-${item.id}`}
        className="pf-meta mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--pf-text-muted)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--pf-text-strong)] focus-visible:outline-none"
        aria-label={`Read the full review of ${item.title}`}
      >
        My review
        <Chevron direction="right" className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <Link
      href={reviewHref(item.id)}
      data-testid={`review-link-${item.id}`}
      className="pf-review-row group/review mt-1.5 inline-flex max-w-full items-baseline gap-1.5 text-left transition-colors hover:text-[var(--pf-text-strong)] focus-visible:outline-none"
      aria-label={`Read the full review of ${item.title}`}
    >
      <span className="pf-clamp-2 min-w-0 text-[13px] leading-relaxed text-[var(--pf-text-muted)] group-hover/review:text-[var(--pf-text)]">
        &ldquo;{preview}&rdquo;
      </span>
      <Chevron
        direction="right"
        className="h-3 w-3 shrink-0 translate-y-px text-[var(--pf-text-faint)]"
      />
    </Link>
  );
}

/**
 * The owner's creator / year / format line.
 *
 * A light novel carries a small, subtle subtype label. Manga, films, TV, and
 * music never get one -- PRSME does not relabel a work it has no evidence for.
 */
function Byline({ item }: { item: ProfileMediaItem }) {
  const parts = [item.byline, item.year].filter(Boolean) as (string | number)[];
  if (parts.length === 0 && item.format !== "light-novel") return null;
  return (
    <p
      className="pf-meta mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--pf-text-muted)]"
      title={item.byline ?? ""}
    >
      {parts.length > 0 && <>{parts.join(" \u00b7 ")}</>}
      {item.format === "light-novel" && (
        <>
          {parts.length > 0 && <span className="px-1">&middot;</span>}
          <span
            className="rounded-sm border border-[var(--pf-border-strong)] px-1 py-px font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--pf-text-faint)]"
            data-testid="light-novel-label"
          >
            Light novel
          </span>
        </>
      )}
    </p>
  );
}

/** Chevron glyph used by the shelf arrows and the review affordance. */
function Chevron({
  direction,
  className = "h-4 w-4",
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === "left" ? (
        <polyline points="14.5,6 8.5,12 14.5,18" />
      ) : (
        <polyline points="9.5,6 15.5,12 9.5,18" />
      )}
    </svg>
  );
}

/** Shared empty state so every layout says the same honest thing. */
function EmptyShelf() {
  return (
    <div className="pf-empty" data-testid="collection-empty">
      <p className="pf-body text-[14px]">No items in this shelf yet.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Poster Grid (media shelf)                        */
/* -------------------------------------------------------------------------- */

export function PosterGridCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState({ prev: false, next: false });

  const syncArrows = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    setCanScroll({
      prev: rail.scrollLeft > 4,
      next: rail.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    syncArrows();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    return () => {
      rail.removeEventListener("scroll", syncArrows);
      window.removeEventListener("resize", syncArrows);
    };
  }, [syncArrows, collection.items.length]);

  /** Scroll the rail by roughly two cards. */
  const scrollByCards = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>(".pf-poster-card");
    const step = card ? card.offsetWidth + 16 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: direction * step * 2, behavior: "smooth" });
  };

  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <div className="relative">
      <div
        ref={railRef}
        className="pf-shelf"
        data-testid={`collection-shelf-${collection.id}`}
        role="group"
        aria-label={`${collection.name} — horizontal shelf`}
        tabIndex={0}
      >
        {collection.items.map((item) => (
          <PosterCard key={item.id} item={item} />
        ))}
      </div>

      {/* Desktop arrows only -- they genuinely scroll the rail and carry
          accessible names. Hidden on touch devices where the rail snaps. */}
      <div className="pointer-events-none absolute -top-[3.25rem] right-0 hidden gap-1.5 md:flex">
        <button
          type="button"
          onClick={() => scrollByCards(-1)}
          disabled={!canScroll.prev}
          aria-label={`Scroll ${collection.name} left`}
          className="pf-icon-btn pointer-events-auto h-8 w-8 disabled:opacity-35"
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          onClick={() => scrollByCards(1)}
          disabled={!canScroll.next}
          aria-label={`Scroll ${collection.name} right`}
          className="pf-icon-btn pointer-events-auto h-8 w-8 disabled:opacity-35"
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}

/**
 * One poster card.
 *
 * The artwork frame owns the 2:3 ratio; `Artwork` is given `ratio="auto"` so
 * it fills exactly that frame instead of adding a second ratio of its own.
 * The rating badge sits *over* the artwork in a predictable corner -- never over
 * the title below it -- and it is always this item's own score.
 */
function PosterCard({ item }: { item: ProfileMediaItem }) {
  return (
    <article className="pf-poster-card group" data-testid="poster-card">
      <div className="pf-poster-frame">
        <Artwork
          palette={item.palette}
          src={item.coverUrl}
          ratio="auto"
          label={`${item.title} cover artwork`}
          alt={`${item.title} cover`}
          className="!rounded-none"
        />
        {item.myRating !== undefined && (
          <RatingBadge value={item.myRating} size="sm" className="pf-poster-rating" />
        )}
      </div>
      <div className="min-w-0">
        <h3
          className="pf-display pf-clamp-2 text-[0.9375rem] leading-snug text-[var(--pf-text-strong)]"
          title={item.title}
        >
          {item.title}
        </h3>
        <Byline item={item} />
        <ReviewExcerpt item={item} variant="poster" maxChars={90} />
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Featured                                   */
/* -------------------------------------------------------------------------- */

/**
 * Featured layout -- Phase 4.2 complete redesign.
 *
 * The old composition put the hero artwork and every secondary row inside one
 * flow where absolutely-positioned layers escaped their cards, so artwork from
 * one item could sit over text belonging to another. This version removes the
 * possibility structurally rather than cosmetically:
 *
 *   - The hero and the list are two *separate grid children* of `.pf-featured`
 *     (`grid-template-columns` on wide screens, one column when stacked).
 *   - The hero card owns exactly ONE image. Secondary items never render that
 *     image, and the hero image never escapes its frame.
 *   - Everything inside the hero is scoped by `.pf-featured-hero-frame > *`,
 *     and the copy layer carries an explicit `z-index` so paint order is
 *     unambiguous.
 *   - The supporting copy is placed *over* the poster on a bottom scrim (the
 *     deliberate editorial treatment), with the review excerpt as the click
 *     target for the full review.
 *
 * On mobile the two children stack, so the hero is full width and the list sits
 * cleanly underneath -- no unrelated images share a card.
 */
export function FeaturedCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  const [hero, ...rest] = collection.items;
  if (!hero) return <EmptyShelf />;

  return (
    <div className="pf-featured" data-testid="featured-collection">
      {/* ---- Primary item: its own card, its own artwork container ---- */}
      <article className="pf-featured-hero" data-testid="featured-hero">
        <div className="pf-featured-hero-frame">
          <Artwork
            palette={hero.palette}
            src={hero.coverUrl}
            ratio="auto"
            label={`${hero.title} cover artwork`}
            alt={`${hero.title} cover`}
            className="!rounded-none"
          />
          <div className="pf-featured-scrim" aria-hidden />
          <div className="pf-featured-copy">
            <span className="pf-eyebrow">Featured pick</span>
            <h3 className="pf-display pf-clamp-2 text-[1.35rem] leading-tight text-[var(--pf-text-strong)] md:text-[1.75rem]">
              {hero.title}
            </h3>
            <Byline item={hero} />
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              {hero.myRating !== undefined && (
                <RatingBadge value={hero.myRating} size="md" withLabel />
              )}
            </div>
            <ReviewExcerpt item={hero} variant="hero" maxChars={190} />
          </div>
        </div>
      </article>

      {/* ---- Secondary items: their own rows, their own artwork ---- */}
      {rest.length > 0 && (
        <ul className="pf-featured-list" data-testid="featured-list">
          {rest.map((item) => (
            <li
              key={item.id}
              className="pf-collection p-3"
              data-testid="featured-list-item"
            >
              <div className="flex items-start gap-3">
                <div className="pf-featured-thumb" aria-hidden>
                  <Artwork
                    palette={item.palette}
                    src={item.coverUrl}
                    ratio="auto"
                    label={`${item.title} cover artwork`}
                    alt={`${item.title} cover`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h4
                      className="pf-display min-w-0 flex-1 text-[1rem] leading-snug text-[var(--pf-text-strong)]"
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                    {item.myRating !== undefined && (
                      <RatingBadge
                        value={item.myRating}
                        size="sm"
                        className="shrink-0"
                      />
                    )}
                  </div>
                  <Byline item={item} />
                  <ReviewExcerpt item={item} variant="list" maxChars={140} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Compact                                   */
/* -------------------------------------------------------------------------- */

/**
 * Compact layout -- a dense, scannable list.
 *
 * Section 4's requirement: no huge empty gap between the item number and its
 * title. The row is an explicit four-column CSS Grid:
 *
 *     index (fixed gutter) | artwork (fixed) | title+meta (1fr, min-width: 0)
 *     | rating (auto)
 *
 * The number sits immediately left of the artwork and title, so it can never
 * drift to the far edge. `justify-content: space-between` is explicitly
 * avoided: that is what produced the Phase 3 gap.
 */
export function CompactCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <ul className="pf-collection pf-compact-list" data-testid="compact-collection">
      {collection.items.map((item, idx) => (
        <li key={item.id} className="pf-compact-row">
          {/* Small index gutter, adjacent to the artwork by construction. */}
          <span className="pf-compact-index" aria-hidden>
            {String(idx + 1).padStart(2, "0")}
          </span>

          {/* Flexible middle: artwork + title/meta. min-width:0 lets text wrap
              and clamp instead of pushing the rating off-screen. */}
          <div className="pf-compact-main">
            <div className="pf-featured-thumb" aria-hidden>
              <Artwork
                palette={item.palette}
                src={item.coverUrl}
                ratio="auto"
                alt={`${item.title} cover`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="pf-display text-[0.9375rem] leading-snug text-[var(--pf-text-strong)]">
                <span className="line-clamp-2">{item.title}</span>
              </h4>
              <Byline item={item} />
              <ReviewExcerpt item={item} variant="list" maxChars={120} />
            </div>
          </div>

          {/* Trailing personal rating, right-aligned. */}
          <div className="pf-compact-side">
            {item.myRating !== undefined && (
              <RatingBadge value={item.myRating} size="md" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Soundtrack List (music collections)                  */
/* -------------------------------------------------------------------------- */

/**
 * Soundtrack List -- a music-specific layout, new in Phase 4.2.
 *
 * Each row deliberately mirrors the shape of the profile's single soundtrack
 * card (`ProfileSoundtrack`): square art on the left, title (largest), artist,
 * then album, with the personal rating on the trailing edge. What it does *not*
 * do is render a player or per-track playback controls -- PRSME never promises
 * audio playback; the optional external link goes to the catalogue page.
 */
export function SoundtrackListCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <ul
      className="pf-collection pf-soundtrack-list"
      data-testid="soundtrack-list-collection"
    >
      {collection.items.map((item) => (
        <li key={item.id} className="pf-soundtrack-row">
          <div className="pf-soundtrack-thumb" aria-hidden>
            <Artwork
              palette={item.palette}
              src={item.coverUrl}
              ratio="1/1"
              label={`${item.title} cover artwork`}
              alt={`${item.title} cover`}
            />
          </div>

          <div className="pf-soundtrack-meta">
            <div className="flex items-start justify-between gap-3">
              <h4
                className="pf-display pf-clamp-2 min-w-0 flex-1 text-[1rem] leading-snug text-[var(--pf-text-strong)]"
                title={item.title}
              >
                {item.title}
              </h4>
              {item.myRating !== undefined && (
                <RatingBadge value={item.myRating} size="sm" className="shrink-0" />
              )}
            </div>
            {/* `byline` is the artist for a music item. */}
            {item.byline && (
              <p className="pf-meta line-clamp-1 mt-0.5 text-[12px] text-[var(--pf-text-muted)]">
                {item.byline}
              </p>
            )}
            <ReviewExcerpt item={item} variant="list" maxChars={110} />
          </div>

          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pf-soundtrack-link"
              aria-label={`Open ${item.title} in its catalogue`}
              title="View in the source catalogue"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M14 4h6v6" />
                <path d="M20 4l-9 9" />
                <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Collection router                               */
/* -------------------------------------------------------------------------- */

export function CollectionBlock({
  collection,
}: {
  collection: ProfileCollection;
}) {
  switch (collection.layout) {
    case "featured":
      return <FeaturedCollection collection={collection} />;
    case "compact":
      return <CompactCollection collection={collection} />;
    case "soundtrack-list":
      return <SoundtrackListCollection collection={collection} />;
    case "poster-grid":
    default:
      return <PosterGridCollection collection={collection} />;
  }
}