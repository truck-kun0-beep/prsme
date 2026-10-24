/**
 * Phase 6 — review and rating data access.
 *
 * Every read and write of `media_reviews` goes through this module, for the
 * same reason `profiles.ts` exists: the rules about *who may see what* must
 * be written down in exactly one place, and they must be enforced by the
 * server's session rather than by anything the browser supplies.
 *
 * The rules, in order of importance:
 *
 *  1. **Identity comes from the session.** `user_id` is derived from the
 *     verified claims. There is no parameter a caller can pass to say whose
 *     review this is. The RLS policies enforce the same thing a second time.
 *
 *  2. **One row per person per media item.** Editing updates; it never
 *     inserts a second row. The database's UNIQUE constraint is what makes
 *     that true, and this module upserts on it.
 *
 *  3. **A draft is private; a published review follows the author's profile
 *     visibility.** A published review by a private-profile author is not
 *     public. That rule lives in the SELECT policy, so it applies to every
 *     query in this file — including the aggregates.
 *
 *  4. **Nothing is invented.** A rating comes from the row. A review count
 *     comes from a count. A community rating is the average of real ratings.
 *     When there are none, the value is `null` and the UI says so.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import type { MediaItem } from "./media";

export type { MediaItem };

/** One row of `public.media_reviews`. */
export interface ReviewRow {
  id: string;
  user_id: string;
  media_id: string;
  rating: string | number | null;
  title: string | null;
  body: string | null;
  is_spoiler: boolean;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** The application's view of a review, joined with its media and author. */
export interface Review {
  id: string;
  userId: string;
  mediaId: string;
  rating: number | null;
  title: string | null;
  body: string;
  isSpoiler: boolean;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** The author's public username, when the profile is readable. */
  authorUsername: string | null;
  /** The author's display name, when the profile is readable. */
  authorDisplayName: string | null;
  /** The media this review is about. */
  media: MediaItem | null;
}

/**
 * A row with the profile and media fields joined in.
 *
 * PostgREST's `!inner` hint on a many-to-one embed is typed by the generated
 * client as an ARRAY, and the relation fields are therefore kept as `unknown`
 * here and normalised at runtime. The mapping below accepts either shape —
 * object or one-item array — so it does not matter which one arrives.
 */
type ReviewWithRelations = ReviewRow & {
  profiles?: unknown;
  media_items?: unknown;
};

/**
 * Normalise a many-to-one embed to a single object.
 *
 * PostgREST returns the related row as an object for a to-one embed, but
 * the generated client types it as an array. Both are accepted.
 */
function relationToObject<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return (first ?? null) as T | null;
  }
  return value as T;
}

export const REVIEW_BODY_MAX = 4_000;
export const REVIEW_TITLE_MAX = 140;

/**
 * Read the review body's author.
 *
 * The profile's display name lives inside `profile_state` (the JSON document),
 * not in a column, so it is read through the same validated mapper the rest
 * of the app uses. A profile whose JSON is unreadable yields the username
 * alone rather than a fabricated name.
 */
function displayNameFromProfileState(
  profileState: unknown,
  fallback: string,
): string {
  if (
    profileState &&
    typeof profileState === "object" &&
    !Array.isArray(profileState)
  ) {
    const identity = (profileState as Record<string, unknown>).displayName;
    if (typeof identity === "string" && identity.trim()) return identity.trim();
  }
  return fallback;
}

/** Map a joined row onto the application's shape. */
function toReview(row: ReviewWithRelations): Review {
  const profile = relationToObject<{ username: string; profile_state: unknown }>(
    row.profiles,
  );

  const mediaRow = relationToObject<Record<string, unknown>>(row.media_items);

  return {
    id: row.id,
    userId: row.user_id,
    mediaId: row.media_id,
    rating:
      row.rating === null || row.rating === undefined
        ? null
        : Number(row.rating),
    title: row.title,
    body: row.body ?? "",
    isSpoiler: row.is_spoiler,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    authorUsername: profile?.username ?? null,
    authorDisplayName: profile
      ? displayNameFromProfileState(profile.profile_state, profile.username)
      : null,
    media: mediaRow
      ? ({
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
        } satisfies MediaItem)
      : null,
  };
}

/**
 * The select clause that joins a review to its author and its media.
 *
 * The join to `profiles` is an INNER join in PostgREST's `inner` syntax, so a
 * review whose author has no readable profile row simply does not come back —
 * which is the privacy rule expressed in the query as well as in the policy.
 *
 * The join to `media_items` is an INNER join too, and for a different reason:
 * it is what lets the query be filtered on the media's KIND in the database
 * rather than in JavaScript after the page has been taken. See
 * `listPublishedReviews`.
 */
const REVIEW_SELECT = `
  id, user_id, media_id, rating, title, body, is_spoiler, status,
  created_at, updated_at, published_at,
  profiles!inner(username, profile_state),
  media_items!inner(id, provider, provider_id, kind, title, alternate_title, creator,
             creator_role, release_year, artwork_url, artwork_source,
             external_url, description)
`;

/* -------------------------------------------------------------------------- */
/*                                   Reads                                    */
/* -------------------------------------------------------------------------- */

/**
 * The published review feed.
 *
 * Only reviews with written text are returned: a rating-only record is a
 * score, not a review, and putting it in a review feed would misrepresent
 * it. RLS additionally removes anything whose author is not publicly visible.
 *
 * `kind` filters by the media item's catalogue kind, which is how the
 * Discover category tabs work.
 */
export async function listPublishedReviews(options: {
  kind?: string;
  mediaId?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = supabase
    .from("media_reviews")
    .select(REVIEW_SELECT)
    .eq("status", "published")
    /*
     * A rating-only record is a score, not a review, so it does not belong in
     * a review feed.
     *
     * The filter has to be `body IS NOT NULL AND body <> ''`. That is the
     * loosest condition that still removes a rating-only record, and it is
     * deliberately not tightened to "the body is not only whitespace":
     * the aggregate view uses `length(btrim(body)) > 0`, and `btrim` strips
     * spaces only, so a body of tabs is counted as text by the view but not
     * by `btrim`. Matching the view exactly would need the same trim set on
     * both sides.
     *
     * The body the application writes is already trimmed (see
     * `saveReview`), so a body of nothing but spaces cannot reach the
     * database through the app. A direct client write could plant one, and
     * the JavaScript filter below removes it — the page is then one row
     * short, which is honest rather than wrong: the row is not a review.
     *
     * This MUST be in the query rather than in JavaScript. It used to be a
     * `.filter()` AFTER `.range(offset, offset + limit - 1)`, which meant the
     * database paged over every published row and the application then threw
     * away the ones that did not qualify — so a page could show fewer reviews
     * than existed, and the "More reviews" link (which is driven by whether
     * the page came back full) could stop early. Filtering first means the
     * page is full of real reviews, and the offset counts real reviews.
     */
    .not("body", "is", null)
    .neq("body", "");

  if (options.mediaId) query = query.eq("media_id", options.mediaId);
  if (options.authorId) query = query.eq("user_id", options.authorId);

  /*
   * The category filter is the media item's catalogue kind, which lives on
   * the JOINED table.
   *
   * `media_items!inner(...)` in the select clause is what makes this
   * possible: PostgREST turns an `!inner` embed into an INNER JOIN, and only
   * then can the embedded table's columns be used as filters.
   *
   * This is a correctness fix, not an optimisation. The filter used to be
   * applied in JavaScript AFTER the page was taken, so the Discover category
   * tabs paged over every kind and then discarded the mismatches. A category
   * page could therefore show fewer reviews than existed — and, when the
   * page's rows were all of another kind, show NONE at all, while the
   * reviews were sitting there unread.
   */
  if (options.kind) {
    query = query.eq("media_items.kind", options.kind);
  }

  const { data, error } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return [];

  const rows = data as ReviewWithRelations[];

  /*
   * A body of only whitespace is not written review text.
   *
   * The query above already removed the empty bodies. This is the narrower
   * rule: a body of nothing but spaces is not a review either, and the
   * application writes trimmed bodies, so this can only ever remove a row
   * somebody planted with a direct client write.
   */
  return rows
    .filter((r) => (r.body ?? "").trim().length > 0)
    .map(toReview);
}

/**
 * A single review by its id.
 *
 * Returns `null` when the id is unknown, when the review is a draft belonging
 * to somebody else, or when its author is not publicly visible. RLS decides
 * the last two; this function just reports what it was given.
 */
export async function getReviewById(id: string): Promise<Review | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("media_reviews")
    .select(REVIEW_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toReview(data as ReviewWithRelations);
}

/**
 * The current user's own review for a media item, draft or published.
 *
 * This is what the review editor opens with, so that reopening a published
 * review shows the content that was actually saved.
 */
export async function getOwnReviewForMedia(
  mediaId: string,
): Promise<Review | null> {
  if (!isSupabaseConfigured()) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("media_reviews")
    .select(REVIEW_SELECT)
    .eq("media_id", mediaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toReview(data as ReviewWithRelations);
}

/**
 * The current user's own reviews, newest first.
 *
 * Used by the owner's own profile view and by the Studio's "my reviews"
 * list, where drafts must be visible to their author.
 */
export async function listOwnReviews(): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("media_reviews")
    .select(REVIEW_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return (data as ReviewWithRelations[]).map(toReview);
}

/* -------------------------------------------------------------------------- */
/*                                 Aggregates                                 */
/* -------------------------------------------------------------------------- */

/** The community summary for one media item. */
export interface MediaReviewStats {
  reviewCount: number;
  ratingCount: number;
  communityRating: number | null;
  lastReviewedAt: string | null;
}

/**
 * The community rating and review count for a media item.
 *
 * Read from the `media_review_stats` view, which is `security_invoker` — so it
 * aggregates exactly the rows this caller is allowed to read. A private
 * profile's reviews are invisible to the aggregate as well as to the feed.
 *
 * The rating is the average of PRSME users' own scores. There is no external
 * provider score in this path, and with no valid ratings the value is `null`
 * rather than a zero.
 */
export async function getMediaReviewStats(
  mediaId: string,
): Promise<MediaReviewStats> {
  const empty: MediaReviewStats = {
    reviewCount: 0,
    ratingCount: 0,
    communityRating: null,
    lastReviewedAt: null,
  };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from("media_review_stats")
    .select("review_count, rating_count, community_rating, last_reviewed_at")
    .eq("media_id", mediaId)
    .maybeSingle();

  if (error || !data) return empty;

  const row = data as {
    review_count: number;
    rating_count: number;
    community_rating: number | string | null;
    last_reviewed_at: string | null;
  };

  return {
    reviewCount: Number(row.review_count ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    communityRating:
      row.community_rating === null || row.community_rating === undefined
        ? null
        : Number(row.community_rating),
    lastReviewedAt: row.last_reviewed_at ?? null,
  };
}

/** A media item with its community summary attached. */
export interface PopularMediaEntry {
  media: MediaItem;
  reviewCount: number;
  ratingCount: number;
  communityRating: number | null;
  lastReviewedAt: string | null;
}

/**
 * The "Popular Media" shelf: media items grouped by their canonical record.
 *
 * This is the answer to the brief's example — ten people who reviewed
 * Breaking Bad contribute ONE Breaking Bad entry with ten reviews, not ten
 * near-identical cards.
 *
 * Ranking: by the number of public reviews, most first. The window is the
 * whole catalogue rather than a "recent" slice, because a review published
 * eight months ago is still a real review of a real work; tie-breaking is by
 * the most recent review, then by title, so the order is stable.
 *
 * The counts come from the `media_review_stats` view, so they reflect only
 * what the viewer is allowed to see.
 */
export async function listPopularMedia(options: {
  kind?: string;
  limit?: number;
} = {}): Promise<PopularMediaEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);

  let statsQuery = supabase
    .from("media_review_stats")
    .select(
      "media_id, review_count, rating_count, community_rating, last_reviewed_at",
    )
    .gt("review_count", 0);

  const { data: stats, error: statsError } = await statsQuery;
  if (statsError || !stats || stats.length === 0) return [];

  const statRows = stats as Array<{
    media_id: string;
    review_count: number;
    rating_count: number;
    community_rating: number | string | null;
    last_reviewed_at: string | null;
  }>;

  const mediaIds = statRows.map((s) => s.media_id);
  const { data: mediaRows, error: mediaError } = await supabase
    .from("media_items")
    .select(
      "id, provider, provider_id, kind, title, alternate_title, creator, creator_role, release_year, artwork_url, artwork_source, external_url, description",
    )
    .in("id", mediaIds);

  if (mediaError || !mediaRows) return [];

  const byId = new Map<string, PopularMediaEntry>();
  for (const row of mediaRows as Array<Record<string, unknown>>) {
    const id = String(row.id);
    const stat = statRows.find((s) => s.media_id === id);
    if (!stat) continue;

    const media: MediaItem = {
      id,
      provider: row.provider as MediaItem["provider"],
      providerId: String(row.provider_id),
      kind: row.kind as MediaItem["kind"],
      title: String(row.title),
      alternateTitle: (row.alternate_title as string) ?? undefined,
      creator: (row.creator as string) ?? undefined,
      creatorRole: (row.creator_role as string) ?? undefined,
      year: (row.release_year as number) ?? undefined,
      artworkUrl: (row.artwork_url as string) ?? undefined,
      artworkSource: (row.artwork_source as string) ?? undefined,
      externalUrl: (row.external_url as string) ?? undefined,
      description: (row.description as string) ?? undefined,
    };

    byId.set(id, {
      media,
      reviewCount: Number(stat.review_count ?? 0),
      ratingCount: Number(stat.rating_count ?? 0),
      communityRating:
        stat.community_rating === null || stat.community_rating === undefined
          ? null
          : Number(stat.community_rating),
      lastReviewedAt: stat.last_reviewed_at ?? null,
    });
  }

  let entries = Array.from(byId.values());
  if (options.kind) {
    entries = entries.filter((e) => e.media.kind === options.kind);
  }

  entries.sort((a, b) => {
    if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
    const aDate = a.lastReviewedAt ?? "";
    const bDate = b.lastReviewedAt ?? "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return a.media.title.localeCompare(b.media.title);
  });

  return entries.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*                                  Writes                                    */
/* -------------------------------------------------------------------------- */

export type SaveReviewInput = {
  mediaId: string;
  rating?: number | null;
  title?: string | null;
  body?: string | null;
  isSpoiler?: boolean;
  status: "draft" | "published";
};

export type SaveReviewResult =
  | { ok: true; review: Review }
  | { ok: false; reason: string; message: string };

/**
 * Validate a review before it reaches the database.
 *
 * The same rules the database enforces, checked here so the author gets a
 * sentence instead of a Postgres error code.
 */
export function validateReviewInput(input: SaveReviewInput): {
  ok: boolean;
  message?: string;
} {
  if (input.rating !== undefined && input.rating !== null) {
    if (!Number.isFinite(input.rating)) {
      return { ok: false, message: "That rating isn't a number." };
    }
    if (input.rating < 0 || input.rating > 10) {
      return { ok: false, message: "Ratings run from 0 to 10." };
    }
  }

  const body = input.body ?? "";
  if (body.length > REVIEW_BODY_MAX) {
    return {
      ok: false,
      message: `Notes are capped at ${REVIEW_BODY_MAX.toLocaleString()} characters.`,
    };
  }

  const title = input.title ?? "";
  if (title.length > REVIEW_TITLE_MAX) {
    return {
      ok: false,
      message: `Headline is capped at ${REVIEW_TITLE_MAX} characters.`,
    };
  }

  if (
    input.status === "published" &&
    !body.trim() &&
    (input.rating === undefined || input.rating === null)
  ) {
    return {
      ok: false,
      message: "Add a rating or some notes before publishing.",
    };
  }

  return { ok: true };
}

/**
 * Create or update the current user's review for a media item.
 *
 * The UPSERT is on `(user_id, media_id)` — the same key the UNIQUE constraint
 * uses — so editing an existing review updates that row and never creates a
 * second one. A double-submit therefore cannot produce two reviews.
 *
 * `published_at` is left to the database trigger, which stamps it on the
 * transition to 'published' and clears it on the way back to 'draft'.
 */
export async function saveOwnReview(
  input: SaveReviewInput,
): Promise<SaveReviewResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Accounts aren't set up on this build.",
    };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      ok: false,
      reason: "not-authenticated",
      message: "You need to be signed in to write a review.",
    };
  }

  const validation = validateReviewInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "invalid",
      message: validation.message ?? "That review couldn't be saved.",
    };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Accounts aren't set up on this build.",
    };
  }

  const payload = {
    user_id: userId,
    media_id: input.mediaId,
    rating: input.rating ?? null,
    title: input.title?.trim() ? input.title.trim() : null,
    body: (input.body ?? "").trim(),
    is_spoiler: input.isSpoiler ?? false,
    status: input.status,
  };

  const { data, error } = await supabase
    .from("media_reviews")
    .upsert(payload, { onConflict: "user_id,media_id" })
    .select(REVIEW_SELECT)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      reason: "error",
      message:
        error?.message ??
        "Your review could not be saved. Nothing was published.",
    };
  }

  return { ok: true, review: toReview(data as ReviewWithRelations) };
}

/**
 * Delete the current user's review for a media item.
 *
 * The RLS policy means this can only ever remove the caller's own review.
 */
export async function deleteOwnReview(
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
  if (!supabase) return { ok: false, message: "Accounts aren't set up on this build." };

  const { error } = await supabase
    .from("media_reviews")
    .delete()
    .eq("media_id", mediaId)
    .eq("user_id", userId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * How many published reviews a media item has, for the viewer's perspective.
 *
 * A thin wrapper over the aggregate view so callers do not have to know the
 * view's name.
 */
export async function countPublishedReviews(mediaId: string): Promise<number> {
  const stats = await getMediaReviewStats(mediaId);
  return stats.reviewCount;
}

export type { SupabaseClient };
