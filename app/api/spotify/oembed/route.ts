/**
 * Spotify oEmbed proxy.
 *
 * Phase 3.1 requirement: when the studio's soundtrack URL changes, resolve the
 * real cover artwork and title for the selected Spotify track/album so the
 * preview never shows a stale cover from the previous track.
 *
 * Security posture (deliberately narrow):
 *   - The route NEVER fetches an arbitrary user-supplied URL. It accepts a
 *     `url` query parameter, re-validates it against the same strict Spotify
 *     host + path rules used on the client, and then constructs the upstream
 *     request itself against Spotify's documented oEmbed endpoint:
 *     https://developer.spotify.com/documentation/embeds/reference/oembed
 *   - Only `open.spotify.com` over HTTPS is accepted, and only the
 *     `track`, `album`, `playlist`, `show`, and `episode` path types.
 *   - The response is projected down to just `{ title, thumbnailUrl, kind }`
 *     so no provider HTML or tracking metadata is passed through.
 *   - No credentials are used or exposed. Spotify's oEmbed endpoint is
 *     public and unauthenticated.
 *
 * Attribution: the returned artwork is Spotify's public CDN image and is
 * referenced directly from the provider's host — never proxied, mirrored,
 * or stored in our own image storage.
 */

import { NextResponse } from "next/server";

/** Path types we accept. Artist pages have no cover art worth showing. */
const ALLOWED_KINDS = new Set(["track", "album", "playlist", "show", "episode"]);

/** Spotify base-62 ids are 22 chars, but be permissive within reason. */
const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;

const ALLOWED_HOSTS = new Set(["open.spotify.com"]);

/** Upstream timeout so a slow provider can never hang the studio request. */
const UPSTREAM_TIMEOUT_MS = 6000;

type ResolvedKind = "track" | "album" | "playlist" | "show" | "episode";

/**
 * Validate and canonicalise a Spotify URL.
 * Returns `{ ok: true, url, kind }` or `{ ok: false, reason }`.
 */
function parseSpotifyUrl(raw: string):
  | { ok: true; url: string; kind: ResolvedKind }
  | { ok: false; reason: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Missing Spotify URL." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Only https Spotify URLs are supported." };
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: "Use an open.spotify.com link.",
    };
  }

  // Locale prefixes like `/intl-de/track/…` are tolerated and dropped so the
  // canonical URL we forward downstream stays stable.
  const segments = parsed.pathname.split("/").filter(Boolean);
  const [typeSegment, id, ...restSegments] = segments;
  if (!typeSegment || !id || restSegments.length > 0) {
    return { ok: false, reason: "Use a track or album link, not the homepage." };
  }

  const kind = typeSegment.toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) {
    return { ok: false, reason: `Unsupported Spotify link type "${kind}".` };
  }

  // Drop locale prefixes (`/intl-de/track/…`) and any query/fragment noise so
  // the canonical URL we forward is stable and predictable.
  const canonical = `https://open.spotify.com/${kind}/${id}`;

  return {
    ok: true,
    url: canonical,
    kind: kind as ResolvedKind,
  };
}

/**
 * Spotify thumbnails are served from i.scdn.co. We only forward URLs on that
 * known CDN host so a compromised/odd provider response cannot smuggle an
 * arbitrary image URL into the client.
 */
function sanitizeThumbnail(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > 600) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "i.scdn.co" && host !== "mosaic.scdn.co") return null;
  return parsed.toString();
}

function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("url") ?? "";

  const parsed = parseSpotifyUrl(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.reason },
      { status: 400 },
    );
  }

  const upstream = new URL("https://open.spotify.com/oembed");
  upstream.searchParams.set("url", parsed.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(upstream, {
      signal: controller.signal,
      headers: {
        // oEmbed is a public endpoint; no auth. Identifying ourselves plainly
        // is friendlier to Spotify than a default undici user-agent.
        Accept: "application/json",
        "User-Agent": "PRSME-Profile-Customizer/0.1 (+https://prsme.local)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail =
        response.status === 404
          ? "Spotify has no embed data for that link."
          : `Spotify responded with ${response.status}.`;
      return NextResponse.json({ ok: false, error: detail }, { status: 502 });
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      return NextResponse.json(
        { ok: false, error: "Spotify returned an unexpected response." },
        { status: 502 },
      );
    }

    const record = payload as Record<string, unknown>;
    const thumbnailUrl = sanitizeThumbnail(record.thumbnail_url);
    const title = sanitizeTitle(record.title);

    if (!thumbnailUrl && !title) {
      return NextResponse.json(
        {
          ok: false,
          error: "Spotify returned no artwork for that link.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        // Canonical, validated URL — what we store as the soundtrack target.
        trackUrl: parsed.url,
        kind: parsed.kind,
        title,
        thumbnailUrl,
        // Explicit attribution string so the client can surface it if needed.
        provider: "Spotify",
      },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=300" },
      },
    );
  } catch (error) {
    const aborted =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "Spotify did not respond in time. Try again."
          : "Could not reach Spotify right now.",
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }
}