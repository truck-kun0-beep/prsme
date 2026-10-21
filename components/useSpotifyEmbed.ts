"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validateSpotifyUrl } from "@/lib/validate";

/**
 * Result of a successful Spotify oEmbed lookup. Only fields Spotify actually
 * returns are kept — no scraping of pages, no provider-injected metadata.
 */
export interface SpotifyEmbedData {
  trackUrl: string;
  /** Canonical kind: track, album, playlist, episode, or show. */
  kind: "track" | "album" | "playlist" | "episode" | "show";
  /** Spotify's title from oEmbed. Optional — artwork may exist without it. */
  title: string | null;
  /** Thumbnail URL on Spotify's public CDN. May be null if Spotify did not
   * include one for the link type. */
  thumbnailUrl: string | null;
  /** Provider attribution marker; the only attribution we surface. */
  provider: "Spotify";
}

type LookupStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: SpotifyEmbedData; resolvedAt: number }
  | { kind: "error"; error: string }
  | { kind: "stale" };

interface UseSpotifyEmbedOptions {
  /** Lookup after this many ms of inactivity. Defaults to 600 ms. */
  debounceMs?: number;
  /**
   * Optional callback fired only on success. Used by callers that want to
   * patch their own state — not the same as the returned status, which is
   * the canonical UI state.
   */
  onResolved?: (data: SpotifyEmbedData) => void;
}

/**
 * Validate + debounce + cancel Spotify oEmbed lookups.
 *
 * The hook accepts a URL string (typically bound to an input), waits for it
 * to settle, then calls `/api/spotify/oembed` and returns a status. While
 * the user is typing, in-flight requests are cancelled so an old answer
 * can never overwrite the new selection.
 */
export function useSpotifyEmbed(
  url: string,
  options: UseSpotifyEmbedOptions = {},
) {
  const debounceMs = options.debounceMs ?? 600;
  const onResolved = options.onResolved;

  const [status, setStatus] = useState<LookupStatus>({ kind: "idle" });
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Stable ref for the callback so we don't restart the timer on every render.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  const lookUp = useCallback(
    (target: string): Promise<SpotifyEmbedData | null> =>
      new Promise<SpotifyEmbedData | null>((resolve) => {
        const token = { cancelled: false };
        cancelRef.current = token;
        setStatus({ kind: "loading" });
        const ctrl = new AbortController();
        const fetchPromise = fetch(
          `/api/spotify/oembed?url=${encodeURIComponent(target)}`,
          {
            method: "GET",
            signal: ctrl.signal,
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          },
        );

        // After timeout, mark stale so a slow upstream cannot linger.
        const timer = window.setTimeout(() => {
          if (!token.cancelled) {
            setStatus({ kind: "stale" });
          }
          ctrl.abort();
        }, 8_000);

        fetchPromise
          .then(async (res) => {
            window.clearTimeout(timer);
            if (token.cancelled) return resolve(null);
            const json = (await res.json()) as
              | { ok: true; trackUrl: string; kind: SpotifyEmbedData["kind"]; title: string | null; thumbnailUrl: string | null; provider: "Spotify" }
              | { ok: false; error: string };
            if (!res.ok || !("ok" in json) || !json.ok) {
              const reason =
                "error" in json ? json.error : `Spotify responded with ${res.status}.`;
              setStatus({ kind: "error", error: reason });
              return resolve(null);
            }
            const data: SpotifyEmbedData = {
              trackUrl: json.trackUrl,
              kind: json.kind,
              title: json.title,
              thumbnailUrl: json.thumbnailUrl,
              provider: json.provider,
            };
            setStatus({ kind: "ok", data, resolvedAt: Date.now() });
            onResolvedRef.current?.(data);
            return resolve(data);
          })
          .catch((err: unknown) => {
            window.clearTimeout(timer);
            if (token.cancelled) return resolve(null);
            const aborted =
              err instanceof DOMException &&
              (err.name === "AbortError" || err.name === "TimeoutError");
            if (aborted) {
              // Already stamped `stale` by the timer in most cases; harmless.
              setStatus((prev) =>
                prev.kind === "stale" || prev.kind === "loading"
                  ? prev
                  : { kind: "error", error: "Could not reach Spotify." },
              );
              return resolve(null);
            }
            setStatus({
              kind: "error",
              error:
                err instanceof Error
                  ? err.message
                  : "Could not reach Spotify.",
            });
            return resolve(null);
          });
      }),
    [],
  );

  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      cancelRef.current.cancelled = true;
      setStatus({ kind: "idle" });
      return;
    }
    // Validate the URL strictly *before* hitting the network — pointless
    // round trips to `/api/spotify/oembed` are not the public profile's job.
    const result = validateSpotifyUrl(trimmed);
    if (!result.ok) {
      cancelRef.current.cancelled = true;
      setStatus({
        kind: "error",
        error: result.message ?? "Not a Spotify link.",
      });
      return;
    }

    const handle = window.setTimeout(() => {
      void lookUp(trimmed);
    }, debounceMs);

    // When the URL changes before the timer fires, cancel the timer and
    // quietly abort any in-flight request, leaving a `stale` marker so the
    // UI can show "Looking up previous selection…".
    return () => {
      window.clearTimeout(handle);
      cancelRef.current.cancelled = true;
    };
  }, [url, debounceMs, lookUp]);

  return { status } as const;
}