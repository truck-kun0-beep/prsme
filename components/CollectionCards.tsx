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
import { isSafeExternalUrl } from "@/lib/validate";
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
        <li key={item.id} className="pf-compact-row" data-testid="compact-row">
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
 *
 * Phase 4.5 -- **the row is the link.**
 *
 * Previously the artwork and text sat in an inert `<li>` and a small outlined
 * square button was parked on the right edge. Two real problems with that:
 *
 *   - The square button looked like an administration control, so the shelf read
 *     as a table of rows with action buttons rather than as someone's music.
 *   - The obvious target -- the whole row, especially the artwork and title --
 *     did nothing, so every visit needed a precise tap on a 32px icon.
 *
 * Now a row with a usable `externalUrl` renders as one real `<a>`, giving it
 * native keyboard focus, open-in-new-tab, and a correct accessible name for
 * free. A row *without* one stays a plain `<li>`: we never render a link that
 * goes nowhere.
 *
 * **Nested interactive elements are avoided by construction.** When the row is
 * itself an anchor it cannot also contain the `ReviewExcerpt` anchor (an `<a>`
 * inside an `<a>` is invalid HTML and breaks click handling), so the excerpt is
 * rendered as plain text in that case. The review itself stays reachable via
 * the item's own review page for non-linked rows, and non-linked rows keep the
 * interactive excerpt exactly as before.
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
      {collection.items.map((item) => {
        // A catalogue URL must be an actual https link, not merely a non-empty
        // string, before we are willing to turn the whole row into one.
        const href = isSafeExternalUrl(item.externalUrl) ? item.externalUrl : null;

        const inner = (
          <>
            <div className="pf-soundtrack-thumb pf-soundtrack-thumb--rounded" aria-hidden>
              <Artwork
                palette={item.palette}
                src={item.coverUrl}
                ratio="1/1"
                label={`${item.title} cover artwork`}
                alt={`${item.title} cover`}
              />
            </div>

            <div className="pf-soundtrack-meta">
              <h4
                className="pf-display pf-soundtrack-title pf-clamp-2"
                title={item.title}
              >
                {item.title}
              </h4>
              {/*
               * For a song: artist + album.  For an album: artist (no album
               * line). A music item's `format` tells us which it is -- Phase
               * 4.2 sees `kind: "music"` on both, with no album-only flag yet,
               * so we render `byline` (the artist) on every row. The studio can
               * refine this when a `format: 'album' | 'song'` is added to
               * `ProfileMediaItem`.
               */}
              {item.byline && (
                <p className="pf-meta pf-soundtrack-artist" title={item.byline}>
                  {item.byline}
                </p>
              )}
              {/*
               * The excerpt is the review's own link. Inside an anchor that is
               * invalid HTML and would hijack the row's click, so a linked row
               * shows the words as plain text; a non-linked row keeps the real
               * review link.
               */}
              {href ? (
                hasReview(item) && (
                  <p className="pf-meta pf-soundtrack-quote">
                    &ldquo;{truncate((item.myReview ?? item.myReviewTitle ?? "").trim(), 110)}&rdquo;
                  </p>
                )
              ) : (
                <ReviewExcerpt item={item} variant="list" maxChars={110} />
              )}
            </div>

            {item.myRating !== undefined && (
              <div className="pf-soundtrack-rating">
                <RatingBadge value={item.myRating} size="sm" />
              </div>
            )}
          </>
        );

        if (href) {
          return (
            <li key={item.id} className="pf-soundtrack-item">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="pf-soundtrack-row pf-soundtrack-row--link"
                data-testid="soundtrack-row"
                aria-label={`Open ${item.title} by ${item.byline ?? "the artist"} in its catalogue`}
              >
                {inner}
              </a>
            </li>
          );
        }

        return (
          <li key={item.id} className="pf-soundtrack-item">
            <div
              className="pf-soundtrack-row"
              data-testid="soundtrack-row"
              data-linked="false"
            >
              {inner}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Poster Wall (new)                             */
/* -------------------------------------------------------------------------- */

/**
 * Poster Wall -- a wrapping, vertically-scrolling poster grid.
 *
 * The important distinction from `PosterGridCollection` is scroll direction.
 * The shelf is a horizontal rail (`overflow-x`) meant for browsing a large
 * catalogue sideways; a wall is the opposite: the *page* scrolls and the grid
 * simply wraps onto as many rows as the items need. That makes it the right
 * layout for a curated set of twenty films where each one deserves a caption
 * you can actually read, rather than a rail you flick through.
 *
 * Implementation notes that keep the page from overflowing:
 *   - `repeat(auto-fill, minmax(...))` with a capped `min()`, so mobile gets
 *     few wide cards and desktop gets more columns.
 *   - No `overflow-x` anywhere in the component: the wall cannot scroll
 *     sideways, so it cannot widen the document.
 *   - Every card is `min-width: 0`, so a long title wraps rather than pushing.
 */
export function PosterWallCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <div
      className="pf-poster-wall"
      data-testid="poster-wall-collection"
      data-collection-rows="wrap"
    >
      {collection.items.map((item) => (
        <article className="pf-wall-card" key={item.id} data-testid="poster-wall-card">
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
          <div className="mt-2 min-w-0">
            <h3
              className="pf-display pf-clamp-2 text-[0.9375rem] leading-snug text-[var(--pf-text-strong)]"
              title={item.title}
            >
              {item.title}
            </h3>
            <Byline item={item} />
            {/* The excerpt is the link to the full review, same as everywhere. */}
            <ReviewExcerpt item={item} variant="poster" maxChars={84} />
          </div>
        </article>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Review Journal (new)                            */
/* -------------------------------------------------------------------------- */

/**
 * Review Journal -- for shelves where the owner's opinion is the content.
 *
 * The composition is deliberately *not* a table and *not* a poster grid. Each
 * entry is an editorial row: a fixed-size artwork on the left on desktop, the
 * title and creator beside it, the rating on the trailing edge, and the review
 * excerpt as the click target. On mobile the artwork shrinks rather than
 * disappearing, so the entry still reads as "a thing I reviewed" rather than
 * "a line of text".
 *
 * An entry with no review renders *without* an excerpt and without pretending
 * there is one -- `ReviewExcerpt` returns null, so the row collapses to
 * title / creator / rating. We never substitute external scores or invent
 * review text.
 */
export function ReviewJournalCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <ul className="pf-journal" data-testid="review-journal-collection">
      {collection.items.map((item) => (
        <li className="pf-journal-entry" key={item.id} data-testid="journal-entry">
          <div className="pf-journal-art" aria-hidden>
            <Artwork
              palette={item.palette}
              src={item.coverUrl}
              ratio="auto"
              label={`${item.title} cover artwork`}
              alt={`${item.title} cover`}
              className="!rounded-none"
            />
          </div>

          <div className="pf-journal-body">
            <div className="pf-journal-head">
              <h4
                className="pf-display pf-clamp-2 min-w-0 text-[1.0625rem] leading-snug text-[var(--pf-text-strong)]"
                title={item.title}
              >
                {item.title}
              </h4>
              {item.myRating !== undefined && (
                <RatingBadge value={item.myRating} size="md" className="shrink-0" />
              )}
            </div>
            <Byline item={item} />
            {/*
              `variant="list"` renders the excerpt as a real anchor. The whole
              entry is NOT a link, so the surrounding article stays selectable
              text and the only click target is the review itself.
            */}
            <ReviewExcerpt item={item} variant="list" maxChars={220} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Album Gallery (new)                             */
/* -------------------------------------------------------------------------- */

/**
 * Album Gallery -- the visual music layout.
 *
 * Square, softly-rounded covers in a wrapping grid that scrolls with the page.
 * This is intentionally *not* `PosterWallCollection` with narrower cards: the
 * corner radius, the 1:1 frame, the artist-under-title stacking, and the
 * larger minimum cover are what make it read as a music collection instead of
 * a film shelf. Columns are capped so a 1440px screen does not produce eight
 * postage-stamp covers.
 *
 * Phase 4.4 -- the card IS the button.
 *
 * Previously the cover was a dead `<article>` and a small external-link glyph
 * sat on its own line underneath. That was the "button below" that looked wrong:
 * a lone icon below an album cover reads as debris rather than as an
 * affordance, and the biggest, most obvious target (the artwork) did nothing
 * when clicked. Now:
 *
 *   - With an `externalUrl`, the whole card renders as one anchor — real
 *     `href`, `target`, and `rel`, so keyboard focus, open-in-new-tab, and
 *     screen-reader link semantics all come for free.
 *   - Without one, it stays a plain `<article>` rather than a link that goes
 *     nowhere. We never render a clickable card for an item with no
 *     destination.
 *
 * The lift/scale/border animation lives in CSS on `.pf-album-card`, so it
 * also fires for keyboard focus (`:focus-visible`) and not for pointer hover
 * alone.
 */
export function AlbumGalleryCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  if (collection.items.length === 0) return <EmptyShelf />;

  return (
    <div className="pf-album-gallery" data-testid="album-gallery-collection">
      {collection.items.map((item) => {
        const href = item.externalUrl;
        const inner = (
          <>
            <div className="pf-album-frame">
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
            <div className="mt-2 min-w-0">
              <h3
                className="pf-display pf-album-title pf-clamp-2 text-[0.9375rem] leading-snug"
                title={item.title}
              >
                {item.title}
              </h3>
              {item.byline && (
                <p className="pf-meta mt-0.5 line-clamp-1 text-[12px] text-[var(--pf-text-muted)]">
                  {item.byline}
                </p>
              )}
            </div>
          </>
        );

        if (href) {
          return (
            <a
              key={item.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="pf-album-card group"
              data-testid="album-card"
              aria-label={`Open ${item.title} in its catalogue`}
            >
              {inner}
            </a>
          );
        }

        return (
          <article key={item.id} className="pf-album-card" data-testid="album-card">
            {inner}
          </article>
        );
      })}
    </div>
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
    case "poster-wall":
      return <PosterWallCollection collection={collection} />;
    case "review-journal":
      return <ReviewJournalCollection collection={collection} />;
    case "soundtrack-list":
      return <SoundtrackListCollection collection={collection} />;
    case "album-gallery":
      return <AlbumGalleryCollection collection={collection} />;
    case "poster-grid":
    default:
      return <PosterGridCollection collection={collection} />;
  }
}