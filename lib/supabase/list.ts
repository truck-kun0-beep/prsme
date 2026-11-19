/**
 * My List — data access.
 *
 * The one place that reads and writes `user_list_items`.
 *
 * THE RULES, IN ORDER OF IMPORTANCE
 *
 *   1. **Identity comes from the session.** `user_id` is derived from the
 *      verified claims. There is no parameter a caller can pass to say whose
 *      list this is, and the RLS policies enforce the same rule a second
 *      time at the database.
 *
 *   2. **The list item is the canonical media item, not a review.** Two
 *      reviews of the same film produce ONE list entry. A review is never a
 *      list item.
 *
 *   3. **One row per (account, media item).** The UNIQUE constraint is what
 *      makes that true; the application upserts on the same key, so "Add to
 *      List" is idempotent and a double-click cannot produce two entries.
 *
 *   4. **Nothing is invented.** The title, artwork, year, and kind all come
 *      from the joined `media_items` row. An entry whose catalogue record has
 *      gone is not rendered at all — the FK cascade removes it, so this
 *      cannot happen, but the join is `inner` anyway.
 */

import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import type { MediaItem } from "./media";
import { kindsForCategory, type ListCategoryId } from "@/lib/media/list";

/** One row of `public.user_list_items`, as the database holds it. */
export interface ListItemRow {
  id: string;
  user_id: string;
  media_id: string;
  created_at: string;
}

/** A list entry, joined with the media record it points at. */
export interface ListEntry {
  /** The list row's id. */
  id: string;
  /** The canonical media item. */
  media: MediaItem;
  /** When the owner added it. */
  createdAt: string;
}

/**
 * The select clause that joins a list entry to its media record.
 *
 * The join is `!inner`, so an entry whose catalogue row is missing is not
 * returned rather than returned half-populated. The FK cascade means that
 * cannot happen, but an inner join makes the guarantee structural rather
 * than dependent on the cascade having fired.
 */
const LIST_SELECT = `
  id, user_id, media_id, created_at,
  media_items!inner(id, provider, provider_id, kind, title, alternate_title,
             creator, creator_role, release_year, artwork_url, artwork_source,
             external_url, description)
`;

/** Map a joined row onto the application's shape. */
function toEntry(row: Record<string, unknown>): ListEntry | null {
  const mediaRow = row.media_items as Record<string, unknown> | undefined;
  if (!mediaRow) return null;

  const media: MediaItem = {
    id: String(mediaRow.id),
    provider: mediaRow.provider as MediaItem["provider"],
    providerId: String(mediaRow.provider_id),
    kind: mediaRow.kind as MediaItem["kind"],
    title: String(mediaRow.title),
    alternateTitle: (mediaRow.alternate_title as string) ?? undefined,
    creator: (mediaRow.creator as string) ?? undefined,
    creatorRole: (mediaRow.creator_role as string) ?? undefined,
    year: (mediaRow.release_year as number) ?? undefined,
    artworkUrl: (mediaRow.artwork_url as string) ?? undefined,
    artworkSource: (mediaRow.artwork_source as string) ?? undefined,
    externalUrl: (mediaRow.external_url as string) ?? undefined,
    description: (mediaRow.description as string) ?? undefined,
  };

  return {
    id: String(row.id),
    media,
    createdAt: String(row.created_at),
  };
}

/**
 * The current user's list.
 *
 * Scoped by the session, so it can only ever return the caller's own rows —
 * there is no user id parameter to point at somebody else's list.
 *
 * `category` filters by the media item's catalogue kind, which is how the
 * three filters on the page work. The filter is applied in the QUERY rather
 * than in JavaScript after the page is taken, so a filtered page shows every
 * matching item rather than the first N of them.
 *
 * Ordering is newest-added first, with the row id as the tie-break so two
 * entries saved in the same millisecond still have a stable order.
 */
export async function listOwnList(
  category: ListCategoryId = "all",
): Promise<ListEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  let query = supabase
    .from("user_list_items")
    .select(LIST_SELECT)
    .eq("user_id", userId);

  const kinds = kindsForCategory(category);
  if (kinds.length > 0) {
    /*
     * `media_items.kind` is on the JOINED table, so the filter only works
     * because the embed above uses `!inner` — PostgREST turns that into an
     * INNER JOIN, which is what makes the joined table's columns usable as
     * filters.
     */
    query = query.in("media_items.kind", kinds as string[]);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>)
    .map(toEntry)
    .filter((entry): entry is ListEntry => entry !== null);
}

/**
 * Is this media item on the current user's list?
 *
 * The `maybeSingle` is safe because the UNIQUE constraint means there is at
 * most one row for this (account, media) pair — so "maybe" never returns
 * two.
 */
export async function isOnOwnList(
  mediaId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("user_list_items")
    .select("id")
    .eq("user_id", userId)
    .eq("media_id", mediaId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

/**
 * The media ids on the current user's list.
 *
 * Used by the bookmark control to render its correct state without one
 * request per card. A card that asked "am I saved?" individually would issue
 * dozens of round-trips on a Discover page.
 */
export async function listOwnListMediaIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("user_list_items")
    .select("media_id")
    .eq("user_id", userId);

  if (error || !data) return [];
  return (data as Array<{ media_id: string }>).map((r) => r.media_id);
}

/**
 * Add a media item to the current user's list.
 *
 * The UPSERT is on `(user_id, media_id)` — the same key the UNIQUE constraint
 * uses — so a second save of the same item updates the existing row rather
 * than creating a duplicate. The `created_at` is NOT overwritten on conflict,
 * because the list's order is "when you added it", and re-clicking a
 * bookmark should not bump an item back to the top.
 */
export async function addToOwnList(
  mediaId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Accounts aren't set up on this build." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, message: "Accounts aren't set up on this build." };
  }

  const { error } = await supabase.from("user_list_items").upsert(
    {
      user_id: userId,
      media_id: mediaId,
    },
    {
      onConflict: "user_id,media_id",
      ignoreDuplicates: true,
    },
  );

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Remove a media item from the current user's list.
 *
 * The RLS policy means this can only ever remove the caller's own entry;
 * asking for somebody else's returns no rows and reports that nothing was
 * removed.
 */
export async function removeFromOwnList(
  mediaId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Accounts aren't set up on this build." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, message: "Accounts aren't set up on this build." };
  }

  const { error } = await supabase
    .from("user_list_items")
    .delete()
    .eq("media_id", mediaId)
    .eq("user_id", userId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * How many items are on the current user's list, and how many in each
 * category.
 *
 * The counts are computed from the caller's own rows only. The category
 * counts are derived in JavaScript from the joined kind — the list is a
 * personal queue, not an analytics dashboard, and one query is cheaper than
 * three.
 */
export async function countOwnList(): Promise<{
  total: number;
  toWatch: number;
  toRead: number;
  toListen: number;
}> {
  const empty = { total: 0, toWatch: 0, toRead: 0, toListen: 0 };
  if (!isSupabaseConfigured()) return empty;

  const userId = await getCurrentUserId();
  if (!userId) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from("user_list_items")
    .select("media_items!inner(kind)")
    .eq("user_id", userId);

  if (error || !data) return empty;

  const rows = data as Array<{ media_items?: { kind?: string } | null }>;
  let toWatch = 0;
  let toRead = 0;
  let toListen = 0;

  for (const row of rows) {
    const kind = row.media_items?.kind;
    if (kind === "movie" || kind === "tv") toWatch += 1;
    else if (kind === "book" || kind === "manga") toRead += 1;
    else if (kind === "song" || kind === "album") toListen += 1;
  }

  return {
    total: rows.length,
    toWatch,
    toRead,
    toListen,
  };
}
