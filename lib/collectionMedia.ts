/**
 * Phase 4 — turning a catalogue record into a stored profile item.
 *
 * This is the one place where a `MediaRecord` becomes part of the user's
 * profile. It encodes three rules:
 *
 *  1. **Identity is provider-based.** The stored item keeps
 *     `(provider, providerId)` so the same work added to two collections is
 *     recognised as one work.
 *  2. **No accidental duplicates inside a collection.** Adding a record whose
 *     provider identity already exists in that collection is a no-op.
 *  3. **Reviews are owner data.** They are never copied in from the
 *     catalogue — a record has no rating or review, ever.
 */

import {
  type MediaRecord,
  type MediaKindId,
} from "./media/types";
import { profileKindFor, type ProfileCollection, type ProfileMediaItem } from "./noirProfile";

/**
 * A short, deterministic, human-legible id. We prefer a provider-scoped slug
 * so the id stays stable across sessions without needing a random source
 * (which would make server-rendered snapshots differ).
 */
function itemIdFor(record: MediaRecord): string {
  const slug = record.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const providerId = record.providerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `media-${record.provider}-${providerId || slug}`;
}

/** Does this collection already contain this provider record? */
export function collectionHasRecord(
  collection: ProfileCollection,
  record: MediaRecord,
): boolean {
  return collection.items.some(
    (item) =>
      item.provider === record.provider && item.providerId === record.providerId,
  );
}

/**
 * Build the stored item. Pure — does not mutate anything.
 *
 * Phase 4.2 — books now carry a `format` (standard vs light novel). The
 * default here is "standard"; the picker stamps `"light-novel"` whenever
 * the user explicitly chose that subtype.
 */
export function recordToItem(
  record: MediaRecord,
  opts: { format?: "standard" | "light-novel" } = {},
): ProfileMediaItem {
  const profileKind = profileKindFor(
    record.kind as Exclude<typeof record.kind, undefined>,
  );
  const format = profileKind === "book" ? opts.format ?? "standard" : undefined;
  return {
    id: itemIdFor(record),
    title: record.title,
    byline: record.creator,
    kind: profileKind,
    format,
    year: record.year,
    // A palette keeps the placeholder meaningful when artwork is absent.
    palette: "iris",
    provider: record.provider,
    providerId: record.providerId,
    coverUrl: record.coverUrl ?? undefined,
    coverSource: record.coverSource,
    externalUrl: record.externalUrl,
  };
}

export type AddRecordOutcome =
  | { ok: true; item: ProfileMediaItem; collectionId: string }
  | { ok: false; reason: "duplicate"; existingId: string; collectionId: string };

/**
 * Add a record to a collection, refusing duplicates.
 *
 * The same work may live in more than one collection — that is allowed and
 * intentional. Only a repeat *within one collection* is rejected.
 */
export function addRecordToCollection(
  collections: ProfileCollection[],
  collectionId: string,
  record: MediaRecord,
  options: { format?: "standard" | "light-novel" } = {},
): { collections: ProfileCollection[]; outcome: AddRecordOutcome } {
  const index = collections.findIndex((c) => c.id === collectionId);
  if (index === -1) {
    return {
      collections,
      outcome: { ok: false, reason: "duplicate", existingId: "", collectionId },
    };
  }
  const target = collections[index]!;

  if (collectionHasRecord(target, record)) {
    const existing = target.items.find(
      (item) =>
        item.provider === record.provider && item.providerId === record.providerId,
    )!;
    return {
      collections,
      outcome: { ok: false, reason: "duplicate", existingId: existing.id, collectionId },
    };
  }

  const item = recordToItem(record, { format: options.format });
  const next = collections.map((c, i) =>
    i === index
      ? {
          ...c,
          items: [...c.items, item],
          // Re-adding clears the tombstone so the item shows again.
          removedItemIds: (c.removedItemIds ?? []).filter((id) => id !== item.id),
        }
      : c,
  );
  return { collections: next, outcome: { ok: true, item, collectionId } };
}

/**
 * Remove an item by its id from the given collection.
 *
 * Removal is recorded two ways because the public profile merges demo items
 * with draft items: a removed *demo* item must stay removed across renders, so
 * its id is added to `removedItemIds`; a removed *draft* item is simply gone.
 */
export function removeItemFromCollection(
  collections: ProfileCollection[],
  collectionId: string,
  itemId: string,
): ProfileCollection[] {
  return collections.map((c) => {
    if (c.id !== collectionId) return c;
    return {
      ...c,
      items: c.items.filter((i) => i.id !== itemId),
      removedItemIds: Array.from(new Set([...(c.removedItemIds ?? []), itemId])),
    };
  });
}

/**
 * Apply a review to an item, wherever it lives. Reviews follow the item, so
 * editing from any collection updates the same underlying review.
 */
export function applyReviewToItem(
  collections: ProfileCollection[],
  itemId: string,
  patch: {
    myRating?: number;
    myReviewTitle?: string;
    myReview?: string;
    myReviewSpoiler?: boolean;
  },
): ProfileCollection[] {
  return collections.map((c) => ({
    ...c,
    items: c.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            ...patch,
            myReviewUpdatedAt: new Date().toISOString(),
          }
        : i,
    ),
  }));
}

/**
 * Guess which picker kinds a collection accepts, based on the media kinds it
 * already holds. An empty collection accepts everything. This keeps the
 * category consistent — a film shelf does not silently collect songs.
 */
export function allowedKindsForCollection(
  collection: ProfileCollection,
): MediaKindId[] {
  if (collection.items.length === 0) {
    return ["movie", "tv", "song", "album", "manga", "book"];
  }
  const fromKinds = new Set<MediaKindId>();
  let sawMusic = false;
  for (const item of collection.items) {
    if (item.provider === undefined) continue; // demo item, no opinion
    if (item.kind === "music") sawMusic = true;
    else fromKinds.add(item.kind as MediaKindId);
  }
  // A music shelf holds songs and albums in the picker. `ProfileMediaItem.kind`
  // collapses both to "music", so restore the split rather than pinning the
  // shelf to songs only.
  if (sawMusic) {
    fromKinds.add("song");
    fromKinds.add("album");
  }
  if (fromKinds.size === 0) {
    return ["movie", "tv", "song", "album", "manga", "book"];
  }
  return Array.from(fromKinds);
}

/** The picker kind a collection should open on. */
export function defaultKindForCollection(
  collection: ProfileCollection,
): MediaKindId {
  const allowed = allowedKindsForCollection(collection);
  if (collection.items.length > 0) {
    const first = collection.items[0]!;
    if (first.kind === "music") return "song";
    if (allowed.includes(first.kind as MediaKindId)) return first.kind as MediaKindId;
  }
  // Fall back to the dominant demo kind for this collection, else movie.
  if (collection.id.includes("music")) return "song";
  if (collection.id.includes("manga")) return "manga";
  if (collection.id.includes("book")) return "book";
  if (collection.id.includes("tv")) return "tv";
  return "movie";
}