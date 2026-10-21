/**
 * TMDB adapter — OPTIONAL movie/TV search.
 *
 * TMDB is the best free movie metadata source, but it requires a registered
 * API key and its terms carry attribution and commercial-use conditions that
 * PRSME has not yet signed off for. So this adapter is **off by default** and
 * activates only when the server environment provides `TMDB_API_KEY`.
 *
 * When it is absent, movie search reports an honest `unavailable` status that
 * the studio surfaces as "no configured movie catalogue" — it never invents
 * results. The key is read server-side only and is never sent to the browser.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "tmdb";

interface TMDBSearchResult {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
}

interface TMDBSearchResponse {
  results?: TMDBSearchResult[];
}

/** TMDB images live on this CDN. It is not in the default allowlist, so we
 *  add it locally here and extend the artwork check for this provider only. */
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function tmdbImage(path: string | null | undefined, size = "w342"): string | null {
  if (!path) return null;
  const url = `${TMDB_IMAGE_BASE}/${size}${path}`;
  // Deliberate: this provider's CDN is trusted for artwork, so we allow it
  // explicitly rather than widening the global allowlist for every provider.
  if (!/^https:\/\/image\.tmdb\.org\/t\/p\//.test(url)) return null;
  return url;
}

export function tmdbConfigured(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
}

export async function searchTmdb(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable" | "disabled"; message?: string }> {
  if (kind !== "movie" && kind !== "tv") {
    return { results: [], status: "unavailable", message: "TMDB does not serve this kind." };
  }
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return {
      results: [],
      status: "disabled",
      message:
        "TMDB is optional and not configured for this deployment (TMDB_API_KEY is unset).",
    };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const endpoint = kind === "movie" ? "search/movie" : "search/tv";
  const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${encodeURIComponent(
    key,
  )}&query=${encodeURIComponent(q)}&include_adult=false`;
  try {
    const response = await fetchProviderJson<TMDBSearchResponse>(url, { timeoutMs: 6_000 });
    const list = Array.isArray(response?.results) ? response.results : [];
    const results: MediaRecord[] = list
      .map((r): MediaRecord | null => {
        const title = (r.title ?? r.name ?? "").trim();
        const id = r.id;
        if (!title || typeof id !== "number") return null;
        const isMovie = Boolean(r.title);
        const date = r.release_date ?? r.first_air_date ?? "";
        const year = date ? Number.parseInt(date.slice(0, 4), 10) : NaN;
        const cover = tmdbImage(r.poster_path);
        return {
          id: mediaRecordId(PROVIDER, String(id)),
          kind: isMovie ? "movie" : kind,
          provider: PROVIDER,
          providerId: String(id),
          title,
          year: Number.isFinite(year) ? year : undefined,
          coverUrl: cover,
          coverSource: cover ? "TMDB poster" : undefined,
          externalUrl: isMovie
            ? `https://www.themoviedb.org/movie/${id}`
            : `https://www.themoviedb.org/tv/${id}`,
          description: r.overview ? r.overview.slice(0, 600) : undefined,
          meta: { attribution: "Data by TMDB" },
        };
      })
      .filter((r): r is MediaRecord => r !== null)
      .slice(0, 8);
    return results.length === 0
      ? { results: [], status: "empty" }
      : { results, status: "ok" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}

void isAllowedArtworkUrl;