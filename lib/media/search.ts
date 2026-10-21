/**
 * Search facade — fans out to one or more providers per kind, merges while
 * preserving provider identities, and removes accidental duplicates **only**
 * when both `(provider, providerId)` match (which is already prevented by the
 * id scheme). Two recordings with similar titles from different providers
 * stay distinct on purpose.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  type MediaSearchResponse,
  type ProviderReport,
  type ProviderStatus,
} from "./types";

/**
 * Phase 4.2 — book-format subtype. Local to this module because only the
 * search runner needs to name it; the picker and the persisted profile model
 * use the same union (see `ProfileMediaItem.format` and `recordToItem`).
 */
type BookFormat = "standard" | "light-novel";
import { searchItunes } from "./providers/itunes";
import { searchMusicBrainz } from "./providers/musicbrainz";
import { searchMangaDex } from "./providers/mangadex";
import { searchOpenLibrary } from "./providers/openlibrary";
import { searchGoogleBooks } from "./providers/googlebooks";
import { searchTvMaze } from "./providers/tvmaze";
import { searchTmdb } from "./providers/tmdb";
import { searchCinemeta } from "./providers/cinemeta";
import { providerErrorMessage } from "./http";

interface ProviderHandle {
  id: MediaProviderId;
  forKind: (kind: MediaKindId) => boolean;
  search: (
    kind: MediaKindId,
    query: string,
    options?: { format?: "standard" | "light-novel" },
  ) => Promise<{ results: MediaRecord[]; status: ProviderStatus; message?: string }>;
}

const ALL: ProviderHandle[] = [
  // Cinemeta is the default movie source — key-free, and its path-segment
  // search (`/catalog/movie/top/search={q}.json`) returns genuine matches.
  { id: "cinemeta", forKind: (k) => k === "movie", search: searchCinemeta },
  // TVMaze is the default for series — openly documented and key-free.
  { id: "tvmaze", forKind: (k) => k === "tv", search: searchTvMaze },
  // TMDB is optional: it only answers when the server has TMDB_API_KEY set.
  { id: "tmdb", forKind: (k) => k === "movie" || k === "tv", search: searchTmdb },
  { id: "itunes", forKind: (k) => k === "song" || k === "album", search: searchItunes },
  { id: "musicbrainz", forKind: (k) => k === "song" || k === "album", search: searchMusicBrainz },
  { id: "mangadex", forKind: (k) => k === "manga", search: searchMangaDex },
  { id: "openlibrary", forKind: (k) => k === "book", search: searchOpenLibrary },
  // Google Books is the second book source — it carries many edition-level
  // cover images that Open Library's work-level records miss.
  { id: "googlebooks", forKind: (k) => k === "book", search: searchGoogleBooks },
];

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("search-timeout")), ms),
  );
}

/**
 * Public surface — one function, one response shape. Caller awaits it; the
 * route maps it to JSON. Per-provider failures are reported via `providers`
 * so the UI can render honestly. "degraded" is true when *all* providers for
 * the kind failed.
 */
export async function runMediaSearch(
  kind: MediaKindId,
  query: string,
  options: {
    perProviderTimeoutMs?: number;
    totalTimeoutMs?: number;
    /**
     * Phase 4.2 — optional book-format subtype. Forwarded only to providers
     * that understand a format hint. A provider that ignores it degrades
     * gracefully: no error, and no result is ever *relabelled* to match.
     */
    format?: BookFormat;
  } = {},
): Promise<MediaSearchResponse> {
  const perProvider = options.perProviderTimeoutMs ?? 7_000;
  const total = options.totalTimeoutMs ?? 8_500;
  const candidates = ALL.filter((p) => p.forKind(kind));
  const startedAt = Date.now();

  // Run all providers in parallel, with a hard per-provider cap. The route
  // can wait the full `total` budget for the slowest provider.
  const reports: ProviderReport[] = [];
  const settled: MediaRecord[] = [];

  const work = candidates.map(async (provider) => {
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        provider.search(kind, query, { format: options.format }),
        timeout(perProvider).then(() => null),
      ]);
      const tookMs = Date.now() - t0;
      if (!result) {
        reports.push({
          provider: provider.id,
          status: "unavailable",
          count: 0,
          tookMs,
          message: "Exceeded the PRSME lookup time limit. Try again.",
        });
        return;
      }
      reports.push({
        provider: provider.id,
        status: result.status,
        count: result.results.length,
        tookMs,
        message:
          result.status === "unavailable"
            ? providerErrorMessage({ code: "timeout" })
            : result.status === "empty"
            ? "No matches in this catalogue for that query."
            : result.status === "disabled"
            ? result.message
            : undefined,
      });
      settled.push(...result.results);
    } catch (error) {
      reports.push({
        provider: provider.id,
        status: "error",
        count: 0,
        tookMs: Date.now() - t0,
        message: providerErrorMessage(error),
      });
    }
  });

  await Promise.race([
    Promise.all(work),
    new Promise((r) => setTimeout(r, total)),
  ]);

  // Rank and dedupe by stable identity. Identical `(provider, providerId)` —
  // which should never happen across providers — is collapsed; otherwise we
  // preserve each provider's identity.
  const dedup = new Map<string, MediaRecord>();
  for (const record of settled) {
    if (!dedup.has(record.id)) {
      dedup.set(record.id, record);
    }
  }
  const results = Array.from(dedup.values()).sort((a, b) => {
    // Records that actually have artwork come first: a cover is the whole
    // point of the picker, so a coverless MusicBrainz match should not
    // outrank an iTunes match for the same release. Ties fall back to title.
    const coverA = a.coverUrl ? 0 : 1;
    const coverB = b.coverUrl ? 0 : 1;
    if (coverA !== coverB) return coverA - coverB;
    return a.title.localeCompare(b.title);
  });

  const okCount = results.length;
  const degraded =
    okCount === 0 &&
    reports.length > 0 &&
    reports.every((r) => r.status !== "ok");

  return {
    query,
    kind,
    results,
    providers: reports,
    degraded,
    nextCursor: null,
  };
}

/** Convenience for the route — avoid leaking internal symbols. */
export const HANDLED_KINDS: MediaKindId[] = [
  "movie",
  "tv",
  "song",
  "album",
  "manga",
  "book",
];