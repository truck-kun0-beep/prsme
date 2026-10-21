/**
 * TVMaze adapter — TV series search (including Korean dramas, which PRSME
 * models as ordinary TV).
 *
 * https://api.tvmaze.com/search/shows?q=…
 * https://api.tvmaze.com/shows/{id}   (by id)
 *
 * TVMaze is openly documented and key-free. Search returns scored results.
 * We use this for `tv`; a Korean show is a `tv` record whose `meta.language`
 * happens to be "Korean".
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "tvmaze";

interface TVMazeImage {
  medium?: string;
  original?: string;
}

interface TVMazeShow {
  id?: number;
  url?: string;
  name?: string;
  type?: string;
  language?: string;
  genres?: string[];
  status?: string;
  runtime?: number | null;
  averageRuntime?: number | null;
  premiered?: string;
  ended?: string | null;
  officialSite?: string | null;
  summary?: string;
  rating?: { average?: number | null };
  image?: TVMazeImage;
  premieredDate?: string;
  network?: { name?: string; country?: { name?: string } };
}

interface TVMazeSearch {
  score?: number;
  show?: TVMazeShow;
}

/**
 * TVMaze's `/search/shows` endpoint returns a **bare JSON array**, not an
 * object with a `results` key. We accept both shapes defensively so a future
 * upstream wrapper change does not silently produce zero results.
 */
type TVMazeSearchResponse = TVMazeSearch[] | { results?: TVMazeSearch[] };

function extractSearchResults(payload: unknown): TVMazeSearch[] {
  if (Array.isArray(payload)) return payload as TVMazeSearch[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: TVMazeSearch[] }).results;
  }
  return [];
}

/** A K-drama is a Korean-language scripted show. TVMaze tags them by language. */
function pickKindFor(show: TVMazeShow): MediaKindId {
  void show;
  return "tv";
}

function firstAirYear(show: TVMazeShow): number | undefined {
  const date = show.premiered ?? show.premieredDate ?? "";
  if (!date) return undefined;
  const parsed = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coverUrl(show: TVMazeShow): { url: string; source: string } | null {
  // TVMaze serves show artwork from tvmaze.com; the actual host is not on our
  // CDN allowlist, so we publish a *placeholder* and skip. The HTML response
  // pages still link to a canonical tvmaze page.
  const medium = show.image?.medium ?? show.image?.original;
  if (!medium) return null;
  if (!isAllowedArtworkUrl(medium)) {
    // TVMaze image hosts (`static.tvmaze.com`) are not on our allowlist. We
    //   intentionally don't render them so the route's no-unexpected-host
    //   invariant holds. Returns null → the placeholder shows in the UI.
    return null;
  }
  return { url: medium, source: "TVMaze artwork" };
}

function normalise(item: TVMazeSearch): MediaRecord | null {
  const show = item.show;
  if (!show?.id || !show.name) return null;
  const artwork = coverUrl(show);
  const meta: Record<string, string> = {};
  if (show.genres && show.genres.length > 0) meta.genres = show.genres.slice(0, 3).join(", ");
  if (show.runtime) meta.runtime = `${show.runtime} min`;
  if (show.status) meta.status = show.status;
  if (show.network?.name) meta.network = show.network.name;
  if (show.language) meta.language = show.language;
  return {
    id: mediaRecordId(PROVIDER, String(show.id)),
    kind: pickKindFor(show),
    provider: PROVIDER,
    providerId: String(show.id),
    title: show.name,
    year: firstAirYear(show),
    coverUrl: artwork?.url ?? null,
    coverSource: artwork?.source,
    externalUrl: show.url ?? `https://www.tvmaze.com/shows/${show.id}`,
    description: typeof show.summary === "string"
      ? show.summary.replace(/<[^>]+>/g, "").slice(0, 600)
      : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

export async function searchTvMaze(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "tv") {
    return { results: [], status: "unavailable", message: "TVMaze only serves TV shows." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
  try {
    const response = await fetchProviderJson<TVMazeSearchResponse>(url, { timeoutMs: 5_500 });
    const list = extractSearchResults(response);
    const normalised = list
      .map(normalise)
      .filter((r): r is MediaRecord => r !== null);
    // All TVMaze results are `tv`; no language pre-filter (the picker shows
    // the language pill to keep origin visible).
    return normalised.length === 0
      ? { results: [], status: "empty" }
      : { results: normalised.slice(0, 8), status: "ok" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}