"use client";

import { useEffect, useRef, useState } from "react";
import { Artwork } from "./Artwork";
import type { ProfileSoundtrack as Soundtrack } from "@/lib/noirProfile";

/**
 * Convert a public Spotify URL into the `/embed/` URL the Spotify Player
 * iframe accepts. Returns null when the URL doesn't match a known
 * embeddable shape — in that case the component shows the external link
 * honestly instead of mounting an iframe that won't load.
 *
 * Exported for unit testing.
 */
export function toEmbedUrl(trackUrl: string): string | null {
  try {
    const u = new URL(trackUrl);
    if (u.hostname !== "open.spotify.com" && u.hostname !== "spotify.com") {
      return null;
    }
    // Accept /track/{id}, /album/{id}, /playlist/{id}, /artist/{id},
    // /episode/{id}, /show/{id}. Anything else (root, /search, etc.) is
    // not officially embeddable.
    const match = u.pathname.match(
      /^\/(track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+(?=\/|$)/,
    );
    if (!match) return null;
    return `https://open.spotify.com/embed/${match[1]}/${u.pathname.split("/")[2]}${u.search ?? ""}`;
  } catch {
    return null;
  }
}

type LoadState = "idle" | "loading" | "loaded" | "error";

/**
 * Compact profile soundtrack component.
 *
 * Visual intent: a deliberate, editorial soundtrack row — album cover
 * (real or local-palette fallback), title in display serif, artist
 * metadata, eyebrow label, and a primary Listen/Stop action. The Stop
 * action genuinely unmounts the embedded player, so audio stops for
 * real (no faked state).
 *
 * Behavior contracts:
 *  - Never autoplays; the visitor must press the explicit Listen button.
 *  - If the provider URL isn't embeddable (root, search, malformed),
 *    shows a fallback external link with an honest label, never
 *    pretending playback is happening.
 *  - Reduced-motion: no internal motion; the existing global
 *    `prefers-reduced-motion` styles take care of any CSS transitions.
 *  - Keyboard: all controls are real buttons / anchors with aria-labels.
 *  - When `soundtrack` is undefined, the component renders nothing.
 */
export function ProfileSoundtrack({ soundtrack }: { soundtrack?: Soundtrack }) {
  const [mounted, setMounted] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [embedAvailable, setEmbedAvailable] = useState<boolean | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Determine upfront whether the URL is officially embeddable.
  // Done in an effect so SSR doesn't choke on absent URL APIs.
  useEffect(() => {
    if (!soundtrack) return;
    setEmbedAvailable(toEmbedUrl(soundtrack.trackUrl) !== null);
  }, [soundtrack]);

  if (!soundtrack) return null;

  const start = () => {
    setMounted(true);
    setLoadState("loading");
  };
  const stop = () => {
    // Removing the iframe from the DOM genuinely stops the audio playback.
    setMounted(false);
    setLoadState("idle");
  };

  const embedUrl = toEmbedUrl(soundtrack.trackUrl);
  const provider = providerLabel(soundtrack.provider);
  const showRealCover = !!soundtrack.coverUrl && !coverFailed;
  const showFullAlbumFallback =
    embedAvailable === false && !soundtrack.externalUrl;

  return (
    <section
      aria-labelledby="profile-soundtrack-title"
      className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--surface-2)]"
      data-testid="profile-soundtrack"
    >
      {/* Decorative prismatic gradient halo behind the cover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--iris-400), transparent 70%)",
        }}
      />

      <div className="relative grid grid-cols-1 gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6 sm:p-6 md:p-7">
        {/* Cover — real image with a graceful local-palette fallback */}
        <CoverArtwork soundtrack={soundtrack} failed={coverFailed} onError={() => setCoverFailed(true)} />

        {/* Track meta */}
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-400">
            <span
              aria-hidden
              className={
                mounted
                  ? "h-1.5 w-1.5 rounded-full bg-iris-300 animate-iris-pulse"
                  : "h-1.5 w-1.5 rounded-full bg-iris-300/70"
              }
            />
            <span>
              {mounted ? "Now playing in profile" : soundtrack.caption ?? "Profile soundtrack"}
            </span>
            <span className="text-muted-500" aria-hidden>·</span>
            <span className="text-muted-300">{provider}</span>
          </p>

          <h3
            id="profile-soundtrack-title"
            className="mt-2 font-display text-[1.35rem] leading-tight text-muted-50 sm:text-[1.55rem] md:text-[1.7rem]"
          >
            {soundtrack.trackTitle}
          </h3>

          <p className="mt-1 truncate text-[13px] text-muted-300">
            <span>{soundtrack.trackArtist}</span>
            {soundtrack.albumTitle && (
              <>
                <span aria-hidden className="mx-2 text-muted-500">·</span>
                <span className="text-muted-400">{soundtrack.albumTitle}</span>
              </>
            )}
          </p>

          {/* Status line: load state + provider credit */}
          <p
            className={`mt-2 text-[11px] ${
              loadState === "error" ? "text-rose-300" : "text-muted-500"
            }`}
            role="status"
            aria-live="polite"
          >
            {mounted
              ? loadState === "error"
                ? "Embed blocked. Press Stop to dismiss the player."
                : loadState === "loaded"
                  ? "Press play inside the embedded player above to start audio."
                  : "Loading the embedded player from Spotify…"
              : embedAvailable === false
                ? showFullAlbumFallback
                  ? "This track URL isn't in an embeddable format."
                  : "Open the track on Spotify to listen — playback happens on the provider's site."
                : "Press Listen to open the embedded player on this page."}
          </p>

          {soundtrack.coverUrl && soundtrack.coverSource && showRealCover && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-500">
              Album art · {soundtrack.coverSource}
            </p>
          )}
        </div>

        {/* Action column */}
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[10.5rem] sm:items-end">
          {embedAvailable === false ? (
            // URL is not in an embeddable shape — there's no iframe to show.
            // The only honest primary action is the external page link.
            soundtrack.externalUrl ? (
              <a
                href={soundtrack.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-iris-400 px-5 text-[13px] font-medium text-ink-950 shadow-glow transition-transform duration-200 ease-soft hover:-translate-y-0.5 hover:bg-iris-300 focus-visible:outline-none"
                aria-label={`Open ${soundtrack.trackTitle} by ${soundtrack.trackArtist} on ${provider} in a new tab`}
              >
                <span aria-hidden>↗</span>
                <span>Open on {provider}</span>
              </a>
            ) : (
              <p className="text-[12px] text-muted-400">
                No playable link is configured for this soundtrack.
              </p>
            )
          ) : !mounted ? (
            <button
              type="button"
              onClick={start}
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-md bg-iris-400 px-5 text-[13px] font-medium text-ink-950 shadow-glow transition-transform duration-200 ease-soft hover:-translate-y-0.5 hover:bg-iris-300 focus-visible:outline-none"
              aria-label={`Listen to ${soundtrack.trackTitle} by ${soundtrack.trackArtist} on ${provider}`}
            >
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-full bg-ink-950/15 transition-transform duration-200 ease-soft group-hover:translate-x-0.5"
              >
                ▶
              </span>
              <span>Listen</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-ink-700/80 px-5 text-[13px] font-medium text-muted-50 transition-colors hover:border-iris-400/40 focus-visible:outline-none"
              aria-label="Stop playback"
            >
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-sm bg-iris-400/15 text-iris-300"
              >
                ■
              </span>
              <span>Stop</span>
            </button>
          )}

          {soundtrack.externalUrl && embedAvailable !== false && (
            <a
              href={soundtrack.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] text-muted-300 transition-colors hover:text-muted-50 focus-visible:outline-none sm:self-end"
              aria-label={`Open the album ${soundtrack.albumTitle ?? "containing this track"} on ${provider} in a new tab`}
            >
              <span aria-hidden>↗</span>
              <span>Open album</span>
            </a>
          )}
        </div>
      </div>

      {/* The mounted iframe. Unmounting it stops audio completely. */}
      {mounted && embedUrl && (
        <div className="relative border-t border-[var(--line-soft)] px-3 pb-4 pt-3 sm:px-5 sm:pb-5 md:px-7">
          <div className="overflow-hidden rounded-md border border-[var(--line-soft)] bg-ink-950">
            <iframe
              ref={iframeRef}
              title={`${soundtrack.trackTitle} on ${provider}`}
              src={embedUrl}
              width="100%"
              height="152"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              onLoad={() => setLoadState("loaded")}
              onError={() => setLoadState("error")}
              className="block w-full"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Cover artwork. Renders the real cover image when present, with a
 * graceful fallback to the typed palette artwork when the image fails
 * to load or when no URL is provided. The fallback is layered as the
 * back layer, then the real image overlays it — so a broken image is
 * not a blank square.
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
  // Square cover, large enough to read as a real album tile.
  const size =
    "h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36";
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-md shadow-ring`}>
      {/* Fallback layer — always rendered */}
      <Artwork
        palette={soundtrack.palette}
        ratio="1/1"
        variant="cover"
        label={`Cover artwork for ${soundtrack.trackTitle} — ${soundtrack.coverSource ?? "local fallback"}`}
        className="absolute inset-0"
      />
      {soundtrack.coverUrl && !failed && (
        // Real image, layered above the local palette fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={soundtrack.coverUrl}
          alt={`Album cover for ${soundtrack.trackTitle} on ${providerLabel(soundtrack.provider)}`}
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

function providerLabel(provider: Soundtrack["provider"]): string {
  switch (provider) {
    case "spotify":
      return "Spotify";
  }
}
