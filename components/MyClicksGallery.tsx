"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Artwork } from "./Artwork";
import type { ClicksPhoto } from "@/lib/noirProfile";
import { isSafeExternalUrl, classifyExternalUrl } from "@/lib/validate";

/** Frame aspect ratio per stored ratio id. Shared by the rail and the grid. */
const RATIO_CSS: Record<ClicksPhoto["ratio"], string> = {
  tall: "3 / 4",
  wide: "4 / 3",
  square: "1 / 1",
  portrait: "4 / 5",
};

/** Rail gap in px, mirrored in CSS so the arrow step matches the spacing. */
const GAP_PX = 14;

/**
 * How long a photograph may take before we call it unavailable.
 *
 * Some hosts hold a connection open instead of erroring, so without a deadline
 * the "honest fallback" would never appear. Twelve seconds is well past any
 * real photograph on a healthy connection and well before a visitor gives up.
 */
const LOAD_TIMEOUT_MS = 12_000;

/**
 * My Clicks gallery.
 *
 * Phase 4.3 turned this from a placeholder shelf into a real gallery of
 * *externally hosted* content. The rule that shapes every branch below:
 *
 *   PRSME never stores an image. It stores a URL and the browser fetches the
 *   picture from the owner's chosen host. Nothing is uploaded, proxied, or
 *   copied, which is why there is no image-processing code anywhere near this
 *   component and why a dead URL can only ever cost a broken image, never a
 *   server-side request on our behalf.
 *
 * Two rendering modes, kept visually explicit:
 *   - `image` — a direct image resource, loaded with `referrerPolicy="no-referrer"`
 *     so the host never learns which profile embedded it. Loading and error
 *     states are real states, not a blank square.
 *   - `post`  — a public social post. Instagram and Facebook are rendered
 *     through their official embed iframe when the post is public and the
 *     platform allows it; otherwise the entry degrades to an explicit
 *     "external post" card with a link. We never scrape a page, never read
 *     `og:image`, and never claim a private post can be shown.
 *
 * Layout: on mobile a touch-friendly horizontal snap scroller; on desktop an
 * editorial mosaic of varying ratios. Neither adds document-level horizontal
 * overflow.
 */
export function MyClicksGallery({ photos }: { photos: ClicksPhoto[] }) {
  if (photos.length === 0) return <ClicksEmptyState />;

  return (
    <div className="pf-clicks">
      {/*
       * Phone: a touch rail. Every card gets an *intentional* width and refuses
       * to shrink, so the row is genuinely wider than the viewport and scrolls.
       * The `-mx`/padding trick pulls the rail into the profile's own gutter so
       * the first and last photographs are fully on-screen — they are not
       * cropped by the page padding.
       */}
      <ClicksRail photos={photos} />

      {/*
       * Desktop: an editorial grid whose tracks are sized by the photograph's
       * shape. Each `<li>` carries `pf-clicks-slot-{shape}`, and the CSS maps
       * that to a column span, so a landscape photograph gets roughly two
       * standard tiles and a tall one gets more presence — instead of every
       * image being squeezed into one of five identical narrow columns.
       */}
      <ul
        className="pf-clicks-grid"
        aria-label="My Clicks — photograph gallery"
        data-testid="clicks-desktop-grid"
      >
        {photos.map((photo) => (
          <li
            key={photo.id}
            className={`pf-clicks-griditem pf-clicks-slot-${photo.ratio}`}
            data-shape={photo.ratio}
          >
            <ClicksPhotoCard photo={photo} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where a card should send the visitor.
 *
 * Phase 4.5 — the card is the link, so there is no "SOURCE" text anywhere.
 *
 * Resolution order, and the reasoning behind it:
 *
 *   1. `sourceUrl` — the page the photograph came from. This is what a visitor
 *      actually wants when they click a photo: the post, the article, the
 *      listing that gives it context.
 *   2. `imageUrl` — the image file itself. Better than nothing when the owner
 *      never configured a source: clicking opens the full-size picture in a new
 *      tab, which is a real, useful destination.
 *   3. Neither — the card is NOT a link. We never render a link that goes
 *      nowhere, and we never invent a destination.
 *
 * `imageUrl` and `sourceUrl` stay separate everywhere else: `imageUrl` always
 * supplies the displayed image, `sourceUrl` only supplies the click target.
 */
function cardDestination(photo: ClicksPhoto): string | null {
  if (photo.mode === "post") {
    return isSafeExternalUrl(photo.postUrl) ? photo.postUrl : null;
  }
  if (isSafeExternalUrl(photo.sourceUrl)) return photo.sourceUrl;
  if (isSafeExternalUrl(photo.imageUrl)) return photo.imageUrl;
  return null;
}

/**
 * One gallery photograph, with a load state that belongs to *this card only*.
 *
 * Phase 4.4 — failure is tracked per card and keyed on the URL.
 *
 * Before, one `failed: Set<string>` lived in the parent and entries were only
 * ever added. Two defects followed:
 *
 *   - A URL that failed once stayed broken for the life of the page, even after
 *     the host recovered, because nothing retried it. Now a changed URL clears
 *     the flag, so editing an entry genuinely re-attempts the load.
 *   - Editing a photo left its *previous* URL in the set forever, so dead
 *     entries accumulated that nothing could clear.
 *
 * `naturalWidth`/`naturalHeight` are the honest success signal. An `onload`
 * event alone is not enough: some browsers fire it for a truncated or non-image
 * response, which produced tiles that reported success while showing nothing.
 * The timeout covers the other failure mode — a host that holds the connection
 * open and never fires either event.
 */
function ClicksPhotoCard({ photo }: { photo: ClicksPhoto }) {
  const [status, setStatus] = useState<"idle" | "ok" | "failed">("idle");
  const imageUrl = photo.imageUrl ?? null;
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A different URL deserves a different attempt.
  useEffect(() => {
    setStatus("idle");
  }, [imageUrl]);

  const failed = status === "failed";

  const markLoaded = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Zero natural dimensions means the browser decoded nothing, however
    // loudly it announced success.
    setStatus(img.naturalWidth > 0 && img.naturalHeight > 0 ? "ok" : "failed");
  }, []);

  const markFailed = useCallback(() => setStatus("failed"), []);

  const destination = cardDestination(photo);

  const frame = (
    <div
      className="pf-clicks-frame"
      style={{ aspectRatio: RATIO_CSS[photo.ratio] }}
    >
      {photo.mode === "post" ? (
        <ClickCardBody photo={photo} />
      ) : isSafeExternalUrl(photo.imageUrl) && !failed ? (
        <>
          <img
            ref={imgRef}
            src={photo.imageUrl as string}
            alt={photo.altText || photo.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            data-testid="clicks-image"
            className="pf-clicks-img"
            onLoad={markLoaded}
            onError={markFailed}
          />
          <LoadDeadline target={imgRef} onTimeout={markFailed} />
        </>
      ) : (
        <Artwork
          palette={photo.palette}
          ratio="auto"
          label={`${photo.title} — image unavailable`}
          className="pf-clicks-art"
        />
      )}
      {failed && (
        <div className="pf-clicks-failed" data-testid="clicks-image-failed">
          <span className="pf-clicks-failed-label">Image unavailable</span>
          <span className="pf-clicks-failed-hint">{photo.title}</span>
        </div>
      )}
    </div>
  );

  const meta = (
    <div className="pf-clicks-meta">
      <p className="pf-display pf-clicks-title" title={photo.title}>
        {photo.title}
      </p>
      {photo.place && (
        <p className="pf-meta pf-clicks-place" title={photo.place}>
          {photo.place}
        </p>
      )}
    </div>
  );

  /*
   * Phase 4.5 — the WHOLE card (photograph + caption) is one anchor.
   *
   * No nested interactive elements: the caption lives inside the anchor as
   * plain text, and there is no separate source button anywhere in the card.
   */
  if (destination) {
    return (
      <a
        href={destination}
        target="_blank"
        rel="noopener noreferrer"
        className="pf-clicks-card"
        data-testid="clicks-card"
        data-linked="true"
        aria-label={
          photo.mode === "post"
            ? `Open the post “${photo.title}” in a new tab`
            : `Open “${photo.title}” in a new tab`
        }
      >
        {frame}
        {meta}
      </a>
    );
  }

  return (
    <article className="pf-clicks-card" data-testid="clicks-card" data-linked="false">
      {frame}
      {meta}
    </article>
  );
}

/**
 * A guard that converts "the host never answered" into a visible failure.
 *
 * A browser that neither loads nor errors is a real case for hotlinked
 * photographs, and without a deadline the tile stays an empty grey box
 * forever — the exact "missing image" the owner reported.
 *
 * The deadline arms on *intersection*, not on mount, and that distinction is
 * the whole point. A `loading="lazy"` photograph that is still off-screen has
 * not started fetching, so a timer started at render would eventually
 * pronounce photographs the visitor had not even scrolled to as broken — which
 * is precisely the "missing image" complaint, manufactured by our own
 * deadline. We begin counting only once the real `<img>` is on screen and the
 * browser has therefore begun the request, and we disarm the moment either
 * event settles.
 */
function LoadDeadline({
  target,
  onTimeout,
}: {
  /** The real `<img>`; watched for the moment it enters the viewport. */
  target: React.RefObject<HTMLImageElement | null>;
  onTimeout: () => void;
}) {
  useEffect(() => {
    const img = target.current;
    if (!img) return;

    // Already decoded from cache, or already complete — nothing to watch.
    if (img.complete) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const timer = window.setTimeout(onTimeout, LOAD_TIMEOUT_MS);
        // Clear the timer as soon as the image settles in either direction.
        const settle = () => window.clearTimeout(timer);
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", settle, { once: true });
      },
      { rootMargin: "200px" },
    );
    io.observe(img);

    return () => io.disconnect();
  }, [target, onTimeout]);

  return null;
}

/**
 * The post-mode body. Kept separate so the image path above stays readable.
 */
function ClickCardBody({ photo }: { photo: ClicksPhoto }) {
  if (photo.mode === "post") return <PostCard photo={photo} />;
  return (
    <Artwork
      palette={photo.palette}
      ratio="auto"
      label={`${photo.title} photograph`}
      className="pf-clicks-art"
    />
  );
}

/**
 * The horizontal rail and its scroll affordances.
 *
 * Phase 4.4 — the old rail had no way to signal that it could move. On a phone
 * the row simply stopped at a hard edge, which reads as "that is everything".
 * The cue is derived from real geometry (`scrollWidth` vs `clientWidth`) and
 * flips as the user scrolls, so it cannot lie. The arrows are real buttons that
 * drive the rail's own `scrollBy`, keeping the scrolling behaviour in one place
 * and cooperating with scroll-snap.
 */
function ClicksRail({ photos }: { photos: ClicksPhoto[] }) {
  const railRef = useRef<HTMLUListElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px tolerance: fractional layout widths otherwise leave the arrow
    // permanently enabled at the true end of the rail.
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // Late-arriving `<img>` elements change `scrollWidth` without resizing the
    // rail itself, so watch for src swaps too.
    const mo = new MutationObserver(sync);
    mo.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, [sync, photos.length]);

  function step(dir: -1 | 1) {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-testid='clicks-card']");
    const amount = card ? card.offsetWidth + GAP_PX : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }

  return (
    <div className="pf-clicks-railwrap" data-testid="clicks-railwrap">
      <ul
        ref={railRef}
        className="pf-clicks-rail"
        data-testid="clicks-mobile-rail"
        tabIndex={0}
        aria-label="My Clicks gallery — scroll horizontally to see every photograph"
      >
        {/*
         * The rail carries the same shape classes as the grid. Same gallery
         * data and same source links in both layouts — only the composition
         * differs, and a shape-aware width is part of that composition.
         */}
        {photos.map((photo) => (
          <li
            key={photo.id}
            className={`pf-clicks-item pf-clicks-slot-${photo.ratio}`}
            data-shape={photo.ratio}
          >
            <ClicksPhotoCard photo={photo} />
          </li>
        ))}
      </ul>

      <div className="pf-clicks-controls">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!canPrev}
          className="pf-clicks-arrow"
          aria-label="Scroll gallery left"
          data-testid="clicks-prev"
        >
          <Chevron dir="left" />
        </button>
        <p className="pf-meta pf-clicks-cue" data-testid="clicks-scroll-cue">
          {canNext ? "Swipe or use the arrows" : "End of gallery"}
        </p>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canNext}
          className="pf-clicks-arrow"
          aria-label="Scroll gallery right"
          data-testid="clicks-next"
        >
          <Chevron dir="right" />
        </button>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/**
 * A public social post.
 *

/**
 * A public social post.
 *
 * Only two platforms have an official embed that PRSME may use:
 *
 *   - Instagram: the documented blockquote + script embed, which Instagram
 *     itself transforms into its own iframe. We render *their* markup inside a
 *     narrow sandbox — never user-supplied HTML, never our own scraping.
 *   - Facebook: the official plugin iframe, pointed at the post permalink.
 *
 * Anything else (a post that is not public, a URL we do not recognise, a
 * platform whose embed script refuses) falls through to `ExternalPostCard`,
 * which is a clearly-labelled link rather than a blank tile. Instagram's own
 * embed script rewrites the blockquote client-side; if it does not (blocked
 * script, no consent cookie), the fallback card is what the visitor sees.
 */
function PostCard({ photo }: { photo: ClicksPhoto }) {
  const url = isSafeExternalUrl(photo.postUrl) ? photo.postUrl : undefined;
  const classified = url ? classifyExternalUrl(url) : null;

  if (!url || !classified) return <ExternalPostCard photo={photo} />;

  if (classified.kind === "instagram") {
    return (
      <div className="pf-post-embed h-full w-full overflow-hidden" data-testid="clicks-post-embed" data-platform="instagram">
        <blockquote
          className="instagram-media"
          data-instgrm-captioned
          data-instgrm-permalink={url}
        >
          <a href={url} target="_blank" rel="noopener noreferrer" className="pf-body block p-4 text-[13px]">
            {photo.title}
          </a>
        </blockquote>
        <PostFallbackNote photo={photo} href={url} />
      </div>
    );
  }

  if (classified.kind === "facebook") {
    return (
      <div className="pf-post-embed h-full w-full overflow-hidden" data-testid="clicks-post-embed" data-platform="facebook">
        <iframe
          src={`https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=500`}
          title={`${photo.title} — embedded Facebook post`}
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-full min-h-[18rem] w-full border-0"
        />
      </div>
    );
  }

  return <ExternalPostCard photo={photo} />;
}

/**
 * The honest fallback for a post PRSME cannot embed.
 *
 * This is a first-class visual state, not an error state: it names the
 * platform, shows the owner's caption, and links to the original. We do not
 * claim to be displaying a post we could not display.
 */
function ExternalPostCard({ photo }: { photo: ClicksPhoto }) {
  const href = isSafeExternalUrl(photo.postUrl)
    ? photo.postUrl
    : isSafeExternalUrl(photo.sourceUrl)
    ? photo.sourceUrl
    : null;
  const platform =
    photo.postPlatform === "instagram"
      ? "Instagram"
      : photo.postPlatform === "facebook"
      ? "Facebook"
      : "External post";

  return (
    <div
      className="pf-post-card flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center"
      data-testid="clicks-post-card"
      data-platform={photo.postPlatform ?? "external"}
    >
      <span className="pf-eyebrow text-[10px]">{platform}</span>
      <p className="pf-display pf-clamp-2 text-[0.95rem] leading-snug text-[var(--pf-text-strong)]">
        {photo.title}
      </p>
      <p className="pf-meta text-[11px] leading-relaxed text-[var(--pf-text-muted)]">
        View this post on {platform}.
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="pf-link mt-1 rounded-md border border-[var(--pf-border)] px-2.5 py-1 text-[11px]"
        >
          Open post
        </a>
      ) : (
        <p className="pf-meta text-[11px] text-[var(--pf-text-faint)]">
          No public link for this entry.
        </p>
      )}
    </div>
  );
}

/**
 * A small, permanent line under an Instagram embed.
 *
 * Instagram's script upgrades the blockquote in place; if it does not run (the
 * visitor blocks third-party scripts, or the post is not public) the visitor
 * still gets a working link rather than a blank tile.
 */
function PostFallbackNote({ photo, href }: { photo: ClicksPhoto; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pf-meta absolute inset-x-0 bottom-0 z-10 block truncate px-3 py-1.5 text-[10px] text-[var(--pf-text-muted)]"
      data-testid="clicks-post-fallback-link"
    >
      {photo.place ? `${photo.place} · ` : ""}Open on Instagram ↗
    </a>
  );
}

/**
 * Empty state. The brief asks for something that actually explains the two
 * ways to add a click, rather than "nothing here".
 */
function ClicksEmptyState() {
  return (
    <div className="pf-empty" data-testid="clicks-empty">
      <p className="pf-eyebrow mb-2">My Clicks</p>
      <p className="pf-body text-[14px] leading-relaxed">
        No clicks yet. In the Customization Studio you can add one in two ways:
        paste a <strong>direct HTTPS image URL</strong> you have permission to
        display, or paste a <strong>public Instagram or Facebook post URL</strong>
        that can be embedded. PRSME never receives the picture itself — your
        browser loads it straight from its host.
      </p>
    </div>
  );
}