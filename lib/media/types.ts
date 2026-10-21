/**
 * Phase 4 — provider-independent media model.
 *
 * The single rule that keeps this phase honest: **catalogue identity is not the
 * same thing as personal data.** `MediaRecord` below is what a provider told
 * us about a work. `ProfileMediaItem` (in `lib/noirProfile.ts`) is a work plus
 * the PRSME owner's rating and review. Reviews are never written back into a
 * provider record, and provider records are never merged with ratings.
 *
 * A `MediaRecord` is keyed by `(provider, providerId)` — a stable external
 * identifier. Two different films with the same display title produce two
 * different records because their ids differ. We never merge on name.
 */

/**
 * The kinds PRSME understands. A Korean drama is a TV series — PRSME does not
 * maintain a separate K-drama kind. Country of origin, language, and genre
 * survive as descriptive metadata on `MediaRecord.meta` when the provider
 * returns them, but the catalogue kind is simply `tv`.
 */
export type MediaKindId =
  | "movie"
  | "tv"
  | "song"
  | "album"
  | "manga"
  | "book";

export const MEDIA_KIND_IDS: MediaKindId[] = [
  "movie",
  "tv",
  "song",
  "album",
  "manga",
  "book",
];

export const MEDIA_KIND_LABELS: Record<MediaKindId, string> = {
  movie: "Films",
  tv: "TV series",
  song: "Songs",
  album: "Albums",
  manga: "Manga",
  book: "Books",
};

/** Human-facing provider name. Used for the visible "source" label only. */
export type MediaProviderId =
  | "cinemeta"
  | "tvmaze"
  | "tmdb"
  | "itunes"
  | "musicbrainz"
  | "mangadex"
  | "openlibrary"
  | "googlebooks";

export const MEDIA_PROVIDER_LABELS: Record<MediaProviderId, string> = {
  cinemeta: "Cinemeta",
  tvmaze: "TVMaze",
  tmdb: "TMDB",
  itunes: "Apple Music / iTunes",
  musicbrainz: "MusicBrainz",
  mangadex: "MangaDex",
  openlibrary: "Open Library",
  googlebooks: "Google Books",
};

/**
 * A normalised catalogue record.
 *
 * `coverUrl` is null when the provider has no artwork for this record. We never
 * invent a URL and never fabricate a successful lookup — a missing cover is an
 * honest null that the UI renders as the existing designed placeholder.
 */
export interface MediaRecord {
  /** Stable PRSME identity: `${provider}:${providerId}`. */
  id: string;
  kind: MediaKindId;
  provider: MediaProviderId;
  /** The provider's own stable id (imdb id, MusicBrainz MBID, MangaDex uuid…). */
  providerId: string;
  title: string;
  /** Original-language or alternate title, when the provider supplies one. */
  alternateTitle?: string;
  /** Director, artist, author, or lead actor — depends on `kind`. */
  creator?: string;
  /** Supporting credit, e.g. "Written and directed by …". */
  creatorRole?: string;
  /** Release or publication year. */
  year?: number;
  /** External artwork URL exactly as the provider returned it, or null. */
  coverUrl: string | null;
  /** Whose artwork this is, for attribution. Null when `coverUrl` is null. */
  coverSource?: string;
  /** Canonical public page on the provider, for "view on <provider>". */
  externalUrl?: string;
  /** Short catalogue description. Never a review. */
  description?: string;
  /** Free-form provider extras (runtime, episodes, ISBN…) kept for display. */
  meta?: Record<string, string>;
}

/** Per-provider outcome so the UI can say honestly what happened. */
export type ProviderStatus =
  | "ok"
  | "empty"
  | "unavailable"
  | "error"
  | "disabled";

export interface ProviderReport {
  provider: MediaProviderId;
  status: ProviderStatus;
  /** How many results this provider contributed. */
  count: number;
  /** Milliseconds, surfaced in the UI so a slow provider is visible. */
  tookMs?: number;
  /** Short, non-technical explanation. Never a raw upstream error string. */
  message?: string;
}

export interface MediaSearchResponse {
  query: string;
  kind: MediaKindId;
  results: MediaRecord[];
  providers: ProviderReport[];
  /** True when every configured provider for this kind failed. */
  degraded: boolean;
  /** Optional cursor for load-more. Providers here are single-page, so this
   *  stays null; the field exists so pagination can be added without a
   *  breaking API change. */
  nextCursor: string | null;
}

/**
 * The set of kinds each provider can serve. Used by the route to decide the
 * fan-out and by the picker to offer a collection-aware category selector.
 */
export const PROVIDER_KIND_MATRIX: Record<MediaProviderId, MediaKindId[]> = {
  cinemeta: ["movie", "tv"],
  tvmaze: ["tv"],
  tmdb: ["movie", "tv"],
  itunes: ["song", "album"],
  musicbrainz: ["song", "album"],
  mangadex: ["manga"],
  openlibrary: ["book"],
  googlebooks: ["book"],
};

/**
 * Stable internal id for a provider record. Deliberately deterministic so the
 * same record added to two collections produces the same identity.
 */
export function mediaRecordId(
  provider: MediaProviderId,
  providerId: string,
): string {
  return `${provider}:${providerId}`;
}

/**
 * Two records are "the same work" only when their provider identities match.
 * A title match alone is explicitly *not* enough — see the module note.
 */
export function isSameWork(a: MediaRecord, b: MediaRecord): boolean {
  return a.provider === b.provider && a.providerId === b.providerId;
}