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

  // The configured track URL is the primary link. The optional `externalUrl`
  // overrides it (used by the demo to point at the parent album instead of
  // the single track). Either way, this is a real, configured Spotify URL —
  // never the Spotify homepage.
  const destination = soundtrack.externalUrl ?? soundtrack.trackUrl;

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

        {/* Logo-only action — opens the configured track on Spotify. No text. */}
        <a
          href={destination}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Listen to ${soundtrack.trackTitle} by ${soundtrack.trackArtist} on Spotify`}
          title={`Listen to ${soundtrack.trackTitle} on Spotify`}
          className="pf-icon-btn"
        >
          <SpotifyGlyph className="h-[18px] w-[18px]" aria-hidden />
        </a>
      </div>
    </article>
  );
}

/**
 * The Spotify brand glyph.
 *
 * Inline SVG so PRSME doesn't depend on a third-party icon kit or extra file
 * — same pattern as `Wordmark.tsx` and `SocialIcons.tsx`. The path data is
 * the canonical 24×24 Spotify mark (circle + three concentric sound-wave
 * arcs), taken from the publicly-circulated Spotify brand reference. It is
 * not a Unicode character, emoji, or invented shape.
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
      fill="currentColor"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0Zm5.521 17.34a.749.749 0 0 1-1.029.249c-2.819-1.722-6.365-2.111-10.541-1.157a.749.749 0 1 1-.359-1.448c4.512-1.022 8.434-.585 11.539 1.32.358.219.479.696.265 1.036Zm1.474-3.297a.937.937 0 0 1-1.288.31c-3.225-1.982-8.143-2.557-11.953-1.401a.937.937 0 1 1-.5-1.806c4.358-1.207 9.776-.671 13.426 1.602.421.258.553.819.31 1.295h.005Zm.119-3.456c-3.869-2.297-10.249-2.51-13.94-1.39a1.122 1.122 0 0 1-.654-2.165c4.249-1.286 11.215-1.04 15.625 1.598a1.122 1.122 0 0 1-1.031 1.957Z" />
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