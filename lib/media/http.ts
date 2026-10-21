/**
 * Outbound HTTP for Phase 4 media providers.
 *
 * Two security properties matter here and are enforced centrally:
 *
 *  1. **Host allowlist.** `fetchProviderJson` only accepts URLs whose host is
 *     in `ALLOWED_PROVIDER_HOSTS`. This route is therefore not a generic
 *     open proxy — a caller cannot use it to reach an arbitrary host.
 *  2. **No raw upstream errors.** `ProviderFetchError` carries a short internal
 *     code; the user-facing message is chosen by the adapter, never by passing
 *     an upstream body or stack through to the browser.
 */

export class ProviderFetchError extends Error {
  constructor(
    readonly code: "timeout" | "network" | "http" | "malformed" | "blocked",
    /** Short operator-facing detail. Safe to log server-side. */
    readonly detail?: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "ProviderFetchError";
  }
}

/** Hosts PRSME is willing to contact. Adding a provider means adding its hosts
 *  here — that is deliberate, so the blast radius of this route is auditable. */
export const ALLOWED_PROVIDER_HOSTS = new Set<string>([
  // Cinemeta — direct movie/series metadata by id (not a search engine).
  "v3-cinemeta.strem.io",
  "image-cdn.cinemeta.io",
  /*
   * Phase 4.2 — Wikipedia's REST + MediaWiki endpoints. Allowlisted so the
   * Cinemeta adapter can resolve a poster for a film whose own artwork path
   * has stopped serving images. Only the *summary* endpoint and the
   * `generator=images` MediaWiki endpoint are contacted; we never query
   * arbitrary article bodies or any URL not explicitly constructed below
   * (`lib/media/providers/cinemeta.ts`).
   */
  "en.wikipedia.org",
  // TVMaze — open TV / series search. Key-free, documented.
  "api.tvmaze.com",
  // TMDB — optional; only contacted when TMDB_API_KEY is configured.
  "api.themoviedb.org",
  // Apple — music search + artwork.
  "itunes.apple.com",
  // MusicBrainz + Cover Art Archive.
  "musicbrainz.org",
  "coverartarchive.org",
  // MangaDex — manga metadata + covers.
  "api.mangadex.org",
  "uploads.mangadex.org",
  // Open Library — book metadata + covers.
  "openlibrary.org",
  "covers.openlibrary.org",
  // Google Books — second permitted book source. Public, no key for
  // basic search.
  "www.googleapis.com",
  "books.google.com",
]);

/**
 * Artwork hosts we are willing to surface to the browser. Narrower than the
 * request allowlist: it only contains hosts that actually serve images.
 *
 * `m.media-amazon.com` is intentionally NOT here — IMDb-derived posters
 * frequently hot-link-block non-IMDb referrers. Cinemeta hydrates each search
 * hit via its own `/meta/{id}.json`, which mirrors the same poster onto the
 * allowlisted `images.metahub.space` mirror.
 */
export const ALLOWED_ARTWORK_HOSTS = new Set<string>([
  "image-cdn.cinemeta.io",
  "images.metahub.space",
  /*
   * Phase 4.2 — Wikimedia Commons.
   *
   * This is the public, key-free host behind every Wikipedia infobox image.
   * It is a *fallback* poster source for films, added because Cinemeta's own
   * artwork path has degraded: `images.metahub.space` no longer resolves and
   * `image-cdn.cinemeta.io` answers with an HTML document rather than an image,
   * so every film poster PRSME produced silently rendered as a placeholder.
   * Wikipedia is stable, serves plain JPEGs, and needs no key.
   *
   * Only the binary host is allowlisted here \u2014 `en.wikipedia.org` itself is
   * allowlisted separately as a *provider* for the metadata API.
   */
  "upload.wikimedia.org",
  // TVMaze show artwork.
  "static.tvmaze.com",
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
  "uploads.mangadex.org",
  "covers.openlibrary.org",
  // Google Books thumbnail CDN.
  "books.google.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

const DEFAULT_TIMEOUT_MS = 6_000;
const USER_AGENT =
  "PRSME/0.4 (+https://prsme.app; media catalogue lookup)";

/**
 * Reject anything that is not plain https to a known host. Also blocks
 * userinfo tricks (`https://openlibrary.org@evil.test/`) because we compare the
 * parsed hostname, not the raw string.
 */
export function assertAllowedProviderUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderFetchError("blocked", "malformed url");
  }
  if (parsed.protocol !== "https:") {
    throw new ProviderFetchError("blocked", `scheme ${parsed.protocol}`);
  }
  if (!ALLOWED_PROVIDER_HOSTS.has(parsed.hostname)) {
    throw new ProviderFetchError("blocked", `host ${parsed.hostname}`);
  }
  return parsed;
}

/** Same allowlist, but for artwork URLs that will be rendered in the browser. */
export function isAllowedArtworkUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_ARTWORK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function fetchProviderJson<T = unknown>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const parsed = assertAllowedProviderUrl(url);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        // MusicBrainz requires a descriptive UA and rejects the default one.
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...options.headers,
      },
      // Provider metadata changes rarely; a short CDN-friendly revalidation is
      // safe and keeps repeat searches snappy without storing anything locally.
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new ProviderFetchError(
        "http",
        `status ${response.status}`,
        response.status,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderFetchError("malformed", "invalid json body");
    }
  } catch (error) {
    if (error instanceof ProviderFetchError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderFetchError("timeout", `> ${timeoutMs}ms`);
    }
    throw new ProviderFetchError("network", (error as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn a thrown provider error into the short sentence the UI shows. Raw
 * upstream messages never leave the server.
 */
export function providerErrorMessage(error: unknown): string {
  if (!(error instanceof ProviderFetchError)) return "Could not reach this catalogue.";
  switch (error.code) {
    case "timeout":
      return "That catalogue took too long to answer. Try again in a moment.";
    case "blocked":
      return "That catalogue is not available to PRSME right now.";
    case "malformed":
      return "That catalogue returned an unreadable response.";
    case "http":
      // 429 is a rate limit, which is worth distinguishing honestly.
      if (error.status === 429) {
        return "That catalogue is rate-limiting requests. Try again shortly.";
      }
      if (error.status === 404) return "No match in that catalogue.";
      return "That catalogue is temporarily unavailable.";
    case "network":
    default:
      return "Could not reach that catalogue.";
  }
}