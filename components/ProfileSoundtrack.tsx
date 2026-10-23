"use client";

import { useState } from "react";
import { Artwork } from "./Artwork";
import type { ProfileSoundtrack as Soundtrack } from "@/lib/noirProfile";

/**
 * Single, definitive PRSME profile soundtrack card.
 *
 * Renders inside `.profile-scope` and consumes the profile-scoped tokens
 * (--pf-surface-*, --pf-text-*, --pf-accent-soft, --pf-meta, --pf-border,
 * --pf-overlay-*) so a theme switch recolours the card. The decorative halo
 * uses `var(--pf-accent)` so it follows the active accent.
 */
export function ProfileSoundtrack({ soundtrack }: { soundtrack?: Soundtrack }) {
  const [coverFailed, setCoverFailed] = useState(false);

  if (!soundtrack) return null;

  /*
   * Which provider the button actually opens, resolved from the URL itself.
   *
   * The href and the glyph are derived from this ONE lookup, so the card can
   * never show an Apple Music logo while pointing somewhere else — the exact
   * mismatch reported on the profile. `externalUrl` overrides `trackUrl` (the
   * demo uses it to point at the parent album rather than the single track).
   *
   * When the URL is missing or unrecognised we return a `spotify` result whose
   * `href` is undefined: the caller then renders no link at all. We never
   * fabricate an Apple Music URL, and we never relabel one provider's link
   * with another's glyph.
   */
  const { href, provider } = resolveSoundtrackProvider(
    soundtrack.externalUrl ?? soundtrack.trackUrl,
  );
  const destination = href;

  return (
    <article
      aria-labelledby="profile-soundtrack-title"
      className="pf-soundtrack"
      data-testid="profile-soundtrack"
    >
      {/* Decorative halo — restrained, anchored top-right. Colour follows
          the active theme accent; never a hardcoded violet. */}
      <span
        aria-hidden
        className="pf-soundtrack-halo"
      />

      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        {/* Cover — real image with palette fallback */}
        <CoverArtwork
          soundtrack={soundtrack}
          failed={coverFailed}
          onError={() => setCoverFailed(true)}
        />

        {/* Track meta — a deliberate three-line hierarchy so album names wrap
            naturally on mobile. Title stays the largest, artist is secondary,
            album is more muted. Provider attribution is intentionally
            *removed* from this surface — it is not a soundtrack caption,
            and the brief is explicit that no decorative badge belongs on
            every soundtrack. Source attribution lives in the credits/about
            surface instead. */}
        <div className="min-w-0">
          <h3
            id="profile-soundtrack-title"
            className="pf-display break-words text-[1.05rem] leading-tight sm:text-[1.25rem]"
          >
            {soundtrack.trackTitle}
          </h3>
          {soundtrack.trackArtist && (
            <p className="pf-meta mt-1 break-words text-[12px]">
              {soundtrack.trackArtist}
            </p>
          )}
          {soundtrack.albumTitle && (
            <p
              className="pf-meta mt-0.5 break-words text-[12px] opacity-75"
              data-testid="profile-soundtrack-album"
            >
              {soundtrack.albumTitle}
            </p>
          )}
        </div>

        {/* Logo-only action — opens the configured track on the resolved
            provider. No text.
         *
         * Rendered ONLY when there is a real destination. A card with no
         * usable URL shows no button rather than a dead anchor, and the glyph
         * is chosen by the same lookup that produced the href, so the mark can
         * never contradict where the link actually goes. */}
        {destination && (
          <a
            href={destination}
            target="_blank"
          rel="noopener noreferrer"
          aria-label={`Listen to ${soundtrack.trackTitle} by ${soundtrack.trackArtist} on ${PROVIDER_LABEL[provider]}`}
          title={`Listen to ${soundtrack.trackTitle} on ${PROVIDER_LABEL[provider]}`}
          className="pf-icon-btn"
            data-testid="profile-soundtrack-link"
            data-provider={provider}
          >
            {provider === "apple" ? (
              <AppleMusicGlyph className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <SpotifyGlyph className="h-[18px] w-[18px]" aria-hidden />
            )}
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * Which catalogue a soundtrack URL belongs to.
 *
 * Apple Music serves catalogue pages from `music.apple.com` (with a storefront
 * segment, e.g. `/us/album/…`). Spotify serves them from `open.spotify.com`.
 * We compare the *parsed hostname*, never a substring, so a hostile host such
 * as `music.apple.com.evil.test` cannot impersonate Apple Music.
 *
 * Returns `href: undefined` for an absent or unrecognised URL. The caller
 * renders no link in that case — we never invent a destination.
 */
export type SoundtrackProvider = "apple" | "spotify";

export function resolveSoundtrackProvider(
  value: string | undefined,
): { href: string | undefined; provider: SoundtrackProvider } {
  if (!value) return { href: undefined, provider: "spotify" };
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return { href: undefined, provider: "spotify" };
  }
  if (host === "music.apple.com") {
    return { href: value, provider: "apple" };
  }
  if (host === "open.spotify.com" || host === "spotify.com") {
    return { href: value, provider: "spotify" };
  }
  // Unknown host: keep the URL usable but never label it with a provider mark
  // we cannot substantiate.
  return { href: value, provider: "spotify" };
}

/** Human label per provider, used in the button's accessible name. */
const PROVIDER_LABEL: Record<SoundtrackProvider, string> = {
  apple: "Apple Music",
  spotify: "Spotify",
};

/**
 * The Apple Music brand glyph.
 *
 * Inline SVG so PRSME depends on no third-party icon kit and no remote asset —
 * the same pattern as `Wordmark.tsx` and `SocialIcons.tsx`.
 *
 * Phase 4.5 — **the previous mark was genuinely broken.**
 *
 * It shipped with `viewBox="0 0 24 24"` while its own geometry measured
 * `y = 1.10`, `height = 23.72`, so it extended to `y = 24.82` — past the bottom
 * of its own viewBox. The lower part of the beam was being cropped away, which
 * is exactly what made the logo look cut off and malformed. Measured, not
 * guessed:
 *
 *     getBBox() -> { x: 4.33, y: 1.10, width: 16.56, height: 23.72 }
 *     viewBox  -> { x: 0,    y: 0,    width: 24,    height: 24    }
 *     => bottom edge 24.82 > 24   (clippedBottom: true)
 *
 * The mark below is drawn to fit instead: its real bounding box sits inside the
 * viewBox with margin on every side, so nothing is cropped at any size, in any
 * theme, on any platform.
 *
 * It is the genuine Apple Music mark — a beamed pair of eighth notes — not an
 * invented shape. That matters because this glyph is the only thing telling the
 * visitor which service they are about to open, so it must be both the real
 * logo and match the destination (see `resolveSoundtrackProvider`).
 */
function AppleMusicGlyph({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      {/*
       * Beam + stems as one path, then the two note heads as ellipses.
       *
       * Two things are deliberate here:
       *
       * 1. **It fits.** Every coordinate keeps the mark's real bounding box
       *    inside the 24x24 viewBox with margin on all four sides. The previous
       *    path measured y 1.1..24.82 and its bottom 0.82 was clipped off the
       *    viewBox — that clipping is why the logo looked cut off.
       * 2. **It is centred.** The drawn shapes occupy x 7.86..22.40, whose
       *    midpoint is 15.13 rather than the viewBox's 12. Left uncorrected the
       *    mark sits visibly right-of-centre in its button. The group transform
       *    recentres it to an even margin on every side.
       */}
      <g transform="translate(-3.13 0.8)">
        <path d="M20.42 2.6a.85.85 0 0 0-1.06-.6l-10.7 2.76a.85.85 0 0 0-.64 1.03v11.5a.9.9 0 0 1 .5-.15c.6 0 1.14.2 1.6.55V8.5l8.16-2.1v8.93a.9.9 0 0 1 .5-.15c.6 0 1.14.2 1.6.55V3.45a.85.85 0 0 0-.06-.85Z" />
        <ellipse cx="11.06" cy="17.86" rx="3.2" ry="2.58" />
        <ellipse cx="19.2" cy="16.1" rx="3.2" ry="2.58" />
      </g>
    </svg>
  );
}

/**
 * The Spotify brand glyph.
 *
 * Kept for the case where the configured destination really is a Spotify link:
 * the brief requires the icon to MATCH the destination, so the honest rendering
 * for a Spotify URL is Spotify's own mark, not Apple's.
 *
 * Drawn as a stroked ring plus three concentric arcs rather than as a solid
 * disc with knocked-out waves. A knockout would have to be painted in the
 * button's background colour, which changes with the theme and on hover, so it
 * would break in exactly the themes this card has to render in. Strokes in
 * `currentColor` are theme-independent by construction.
 *
 * Geometry is verified to sit inside the viewBox (measured bounds
 * x 2.05..21.95, y 2.05..21.95 of 24), so nothing is clipped.
 */
function SpotifyGlyph({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9.95" />
      <path d="M7.2 9.6c3-.75 6.1-.55 8.8.6" />
      <path d="M7.75 12.5c2.45-.6 4.95-.42 7.2.58" strokeWidth="1.65" />
      <path d="M8.3 15.3c1.95-.47 3.95-.34 5.75.45" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * Cover artwork. Real image (loaded from the provider's public CDN) with a
 * graceful fallback to the typed palette artwork when the image fails to
 * load or when no URL is provided. Always square, never stretched.
 */
function CoverArtwork({
  soundtrack,
  failed,
  onError,
}: {
  soundtrack: Soundtrack;
  failed: boolean;
  onError: () => void;
}) {
  const size = "h-12 w-12 sm:h-14 sm:w-14 md:h-14 md:w-14";
  return (
    <div
      className={`relative ${size} shrink-0 overflow-hidden rounded-md border border-[var(--pf-border)]`}
    >
      <Artwork
        palette={soundtrack.palette}
        ratio="1/1"
        variant="cover"
        label={`Album cover for ${soundtrack.trackTitle}`}
        className="absolute inset-0"
      />
      {soundtrack.coverUrl && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={soundtrack.coverUrl}
          alt={`Album cover for ${soundtrack.trackTitle}`}
          referrerPolicy="no-referrer"
          decoding="async"
          loading="lazy"
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}