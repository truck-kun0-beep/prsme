/**
 * Apple iTunes Search — song and album metadata with available cover art.
 *
 * https://itunes.apple.com/search?term={query}&media=music|music&entity=song|album&limit={n}
 *
 * The API requires no key. We always fetch artwork URLs through the rate of
 * `artworkUrl100`, which the response provides, and **upgrade** them to a
 * 600-pixel variant by swapping the path segment before display.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import {
  ALLOWED_ARTWORK_HOSTS,
  fetchProviderJson,
  isAllowedArtworkUrl,
} from "../http";

const PROVIDER: MediaProviderId = "itunes";

interface ITunesArtwork {
  "#text"?: string;
}

interface ITunesResult {
  wrapperType?: "track" | "collection" | "artist";
  kind?: "song" | "feature-movie" | "music-video" | "podcast" | "tv-episode" | "audiobook";
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  collectionArtistName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  artworkUrl30?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
  trackTimeMillis?: number;
  viewUrl?: string;
  collectionViewUrl?: string;
  artistViewUrl?: string;
  previewUrl?: string;
}

/**
 * iTunes serves artwork at multiple sizes; we resolve to the largest. The host
 * `is1-ssl.mzstatic.com` is allowlisted, so the URL only leaves after this
 * check.
 */
function bestArtwork(r: ITunesResult): { url: string; source: string } | null {
  const raw =
    r.artworkUrl100 ??
    r.artworkUrl60 ??
    r.artworkUrl30 ??
    null;
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!ALLOWED_ARTWORK_HOSTS.has(parsed.hostname)) return null;
  // Apple's CDN answers on https for the same path; some collection responses
  // hand back an `http://` URL, which the artwork allowlist (https-only) would
  // otherwise reject and silently drop the cover.
  if (parsed.protocol !== "https:") parsed.protocol = "https:";
  // 100x100 is too small; upgrade to 600x600 if available, otherwise 300x300.
  parsed.pathname = parsed.pathname.replace(/\/\d+x\d+bb\./, "/600x600bb.");
  if (isAllowedArtworkUrl(parsed.toString())) {
    return { url: parsed.toString(), source: "Apple artwork" };
  }
  parsed.pathname = parsed.pathname.replace(/\/\d+x\d+bb\./, "/300x300bb.");
  if (isAllowedArtworkUrl(parsed.toString())) {
    return { url: parsed.toString(), source: "Apple artwork" };
  }
  return null;
}

function releaseYear(r: ITunesResult): number | undefined {
  if (!r.releaseDate) return undefined;
  const parsed = Number.parseInt(r.releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Normalise an iTunes song. */
function normaliseSong(r: ITunesResult): MediaRecord | null {
  if (r.wrapperType !== "track" || r.kind !== "song") return null;
  const providerId = String(r.trackId ?? "").trim();
  const title = String(r.trackName ?? "").trim();
  if (!providerId || !title) return null;
  const artwork = bestArtwork(r);
  const artistName = String(r.artistName ?? "Unknown artist").trim();
  return {
    id: mediaRecordId(PROVIDER, providerId),
    kind: "song",
    provider: PROVIDER,
    providerId,
    title,
    alternateTitle: r.collectionName ? `from ${r.collectionName}` : undefined,
    creator: artistName,
    creatorRole: "Song by",
    year: releaseYear(r),
    coverUrl: artwork?.url ?? null,
    coverSource: artwork?.source,
    externalUrl:
      r.trackId ? `https://music.apple.com/song/${r.trackId}` :
      r.viewUrl ?? undefined,
    meta: r.collectionName ? { album: r.collectionName } : undefined,
  };
}

/** Normalise an iTunes album/collection. */
function normaliseAlbum(r: ITunesResult): MediaRecord | null {
  if (r.wrapperType !== "collection") return null;
  const providerId = String(r.collectionId ?? "").trim();
  const title = String(r.collectionName ?? "").trim();
  if (!providerId || !title) return null;
  const artwork = bestArtwork(r);
  return {
    id: mediaRecordId(PROVIDER, providerId),
    kind: "album",
    provider: PROVIDER,
    providerId,
    title,
    creator:
      String(r.artistName ?? r.collectionArtistName ?? "Unknown artist").trim(),
    creatorRole: "Album by",
    year: releaseYear(r),
    coverUrl: artwork?.url ?? null,
    coverSource: artwork?.source,
    externalUrl:
      r.collectionViewUrl ??
      `https://music.apple.com/album/${r.collectionId}`,
    meta: r.trackCount ? { tracks: String(r.trackCount) } : undefined,
  };
}

interface ITunesSearchResponse {
  resultCount?: number;
  results?: ITunesResult[];
}

export async function searchItunes(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "song" && kind !== "album") {
    return { results: [], status: "unavailable", message: "iTunes does not serve this kind." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const params = new URLSearchParams({
    term: q,
    media: "music",
    entity: kind,
    limit: "8",
  });
  const url = `https://itunes.apple.com/search?${params.toString()}`;
  try {
    const response = await fetchProviderJson<ITunesSearchResponse>(url, { timeoutMs: 5_000 });
    const list = Array.isArray(response.results) ? response.results : [];
    const normalised = list
      .map((r) => (kind === "song" ? normaliseSong(r) : normaliseAlbum(r)))
      .filter((r): r is MediaRecord => r !== null);
    return normalised.length === 0
      ? { results: [], status: "empty" }
      : { results: normalised, status: "ok" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}
