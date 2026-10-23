/**
 * Phase 6 — shared media catalogue data access.
 *
 * The one place that resolves a provider record to a canonical `media_items`
 * row. Everything that publishes a review goes through here, because the whole
 * point of the shared catalogue is that two accounts who pick the same work
 * land on the SAME row.
 *
 * Three rules govern this module:
 *
 *  1. **Identity is `(provider, provider_id)`.** Never the title. Two records
 *     with the same title from different providers stay separate, because a
 *     shared identifier is only as reliable as the provider that reported it.
 *
 *  2. **Concurrency is resolved by the database.** `media_items` has a UNIQUE
 *     constraint on `(provider, provider_id)`. When two people review the same
 *     new item at the same moment, one INSERT wins and the other gets a
 *     unique-violation — which this module resolves by re-reading the row that
 *     the winner created. We never rely on a client-side "does it exist yet?"
 *     check, because that check is always a race.
 *
 *  3. **Artwork stays external.** We store the provider's own URL plus the
 *     name of whoever owns it. Nothing is copied into Supabase Storage, and a
 *     URL whose host is not on the artwork allowlist is refused outright
 *     rather than stored and later rendered.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { isSupabaseConfigured } from "./config";
import { isAllowedArtworkUrl } from "@/lib/media/http";
import type {
  MediaKindId,
  MediaProviderId,
  MediaRecord,
} from "@/lib/media/types";

/** One row of `public.media_items`, as the database holds it. */
export interface MediaItemRow {
  id: string;
  provider: string;
  provider_id: string;
  kind: string;
  title: string;
  alternate_title: string | null;
  creator: string | null;
  creator_role: string | null;
  release_year: number | null;
  artwork_url: string | null;
  artwork_source: string | null;
  external_url: string | null;
  description: string | null;
  meta: unknown;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}

/** The application's view of a catalogue record. */
export interface MediaItem {
  id: string;
  provider: MediaProviderId;
  providerId: string;
  kind: MediaKindId;
  title: string;
  alternateTitle?: string;
  creator?: string;
  creatorRole?: string;
  year?: number;
  artworkUrl?: string;
  artworkSource?: string;
  externalUrl?: string;
  description?: string;
  meta?: Record<string, string>;
}

const PROVIDERS: readonly string[] = [
  "cinemeta",
  "tvmaze",
  "tmdb",
  "itunes",
  "musicbrainz",
  "mangadex",
  "openlibrary",
  "googlebooks",
];

const KINDS: readonly string[] = [
  "movie",
  "tv",
  "song",
  "album",
  "manga",
  "book",
];

/** Map a database row onto the application's shape. */
export function mediaItemFromRow(row: MediaItemRow): MediaItem {
  const meta =
    row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? (row.meta as Record<string, string>)
      : undefined;

  return {
    id: row.id,
    provider: row.provider as MediaProviderId,
    providerId: row.provider_id,
    kind: row.kind as MediaKindId,
    title: row.title,
    alternateTitle: row.alternate_title ?? undefined,
    creator: row.creator ?? undefined,
    creatorRole: row.creator_role ?? undefined,
    year: row.release_year ?? undefined,
    artworkUrl: row.artwork_url ?? undefined,
    artworkSource: row.artwork_source ?? undefined,
    externalUrl: row.external_url ?? undefined,
    description: row.description ?? undefined,
    meta,
  };
}

/**
 * Is this provider record safe to store?
 *
 * The provider id must be one PRSME knows, the kind must be one the
 * catalogue understands, and the item must have a provider id and a title —
 * without those it cannot be keyed or displayed.
 */
export function isStorableProviderRecord(
  record: Pick<MediaRecord, "provider" | "providerId" | "kind" | "title">,
): boolean {
  if (!PROVIDERS.includes(record.provider)) return false;
  if (!KINDS.includes(record.kind)) return false;
  if (!record.providerId.trim()) return false;
  if (!record.title.trim()) return false;
  return true;
}

/**
 * Resolve a provider record to its canonical catalogue row, creating the row
 * when it does not exist yet.
 *
 * Returns `null` when Supabase is not configured, when the record is not
 * storable, or when the write fails for a reason the caller cannot fix.
 */
export async function resolveMediaItem(
  record: MediaRecord,
): Promise<MediaItem | null> {
  if (!isSupabaseConfigured()) return null;
  if (!isStorableProviderRecord(record)) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const existing = await findMediaItemByProviderId(
    supabase,
    record.provider,
    record.providerId,
  );
  if (existing) return existing;

  const inserted = await insertMediaItem(supabase, record);
  if (inserted) return inserted;

  /*
   * The insert lost a race: another request created the same catalogue
   * record between our read and our write. That is the expected outcome of
   * two people reviewing the same new film at once, and the UNIQUE
   * constraint is exactly what resolved it. Re-read the winner's row.
   */
  const raced = await findMediaItemByProviderId(
    supabase,
    record.provider,
    record.providerId,
  );
  return raced;
}

/**
 * Look up a catalogue row by its provider identity.
 *
 * Exported because the media page and the review editor both need it, and
 * because it is the read that must never be done client-side with a
 * client-supplied provider id.
 */
export async function findMediaItemByProviderId(
  supabase: SupabaseClient,
  provider: string,
  providerId: string,
): Promise<MediaItem | null> {
  const { data, error } = await supabase
    .from("media_items")
    .select("*")
    .eq("provider", provider)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (error || !data) return null;
  return mediaItemFromRow(data as MediaItemRow);
}

/**
 * Insert a catalogue row.
 *
 * `coverUrl` is accepted only when its host is on the artwork allowlist. An
 * unlisted host is dropped rather than stored: a catalogue row is public
 * metadata that will be rendered on a Discover card for every visitor, so an
 * unvetted URL there is a tracking vector, not a cosmetic problem.
 */
async function insertMediaItem(
  supabase: SupabaseClient,
  record: MediaRecord,
): Promise<MediaItem | null> {
  const artworkUrl = isAllowedArtworkUrl(record.coverUrl)
    ? record.coverUrl
    : null;

  const { data, error } = await supabase
    .from("media_items")
    .insert({
      provider: record.provider,
      provider_id: record.providerId,
      kind: record.kind,
      title: record.title.trim(),
      alternate_title: record.alternateTitle?.trim() || null,
      creator: record.creator?.trim() || null,
      creator_role: record.creatorRole?.trim() || null,
      release_year: Number.isFinite(record.year) ? record.year : null,
      artwork_url: artworkUrl,
      artwork_source: artworkUrl ? (record.coverSource?.trim() || null) : null,
      external_url: record.externalUrl?.trim() || null,
      description: record.description?.trim() || null,
      meta: record.meta ?? {},
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  return mediaItemFromRow(data as MediaItemRow);
}

/**
 * A catalogue row by its canonical internal id.
 *
 * Returns `null` for an unknown id — the caller renders a not-found state
 * rather than an empty page.
 */
export async function getMediaItemById(
  id: string,
): Promise<MediaItem | null> {
  if (!isSupabaseConfigured()) return null;
  if (!isUuid(id)) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("media_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mediaItemFromRow(data as MediaItemRow);
}

/**
 * Search the catalogue by title.
 *
 * This searches PRSME's own catalogue — the works that real accounts have
 * actually reviewed — not the upstream providers. A visitor searching for
 * "Breaking Bad" on Discover should find the media PRSME knows about, with
 * real reviews under it, rather than a list of external records with no
 * reviews attached.
 */
export async function searchMediaItems(
  term: string,
  options: { limit?: number; kind?: MediaKindId } = {},
): Promise<MediaItem[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  let query = supabase.from("media_items").select("*");

  if (options.kind) {
    query = query.eq("kind", options.kind);
  }

  const { data, error } = await query
    .ilike("title", `%${term.replace(/[%_]/g, "")}%`)
    .order("title", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return (data as MediaItemRow[]).map(mediaItemFromRow);
}

/** Is this a syntactically valid UUID? Used to reject junk ids early. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
