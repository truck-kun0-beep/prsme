/**
 * Phase 8 — the social layer: follows, blocks, and the relationship counts.
 *
 * Every read and write of `follows` and `user_blocks` goes through this
 * module, for the same reason `profiles.ts` exists: the rules about *who may
 * see and change what* must be written down in exactly one place, and they
 * must be enforced by the server's session rather than by anything the
 * browser supplies.
 *
 * THE MODEL IS ONE-WAY. THERE IS NO FRIENDSHIP.
 *
 * A follow is a single edge from one account to another. Following somebody
 * does not make them follow you back, and nothing in this module treats a
 * mutual pair as a relationship of its own. There is no friend count, no
 * mutual-friend state, and no "friends" concept anywhere in the code.
 *
 * THE RULES, IN ORDER OF IMPORTANCE
 *
 *  1. **Identity comes from the session.** The follower is always the caller.
 *     The followed account is named by its USERNAME — never by a user id from
 *     the request body — so there is no parameter a caller can spoof to make
 *     somebody else follow somebody.
 *
 *  2. **A private account's follow is a REQUEST.** Following a private
 *     profile creates a `pending` edge; only the owner can turn it into an
 *     `accepted` one. A pending request is NOT a follower and never counts
 *     as one.
 *
 *  3. **One edge per pair.** The database's UNIQUE constraint on
 *     `(follower_id, following_id)` is what makes a double-submit, two
 *     concurrent requests, and an approval that races a cancel all resolve to
 *     the same answer: one row. This module never pre-checks "do I already
 *     follow them?" as a guarantee — it is a hint, and the constraint is the
 *     guarantee.
 *
 *  4. **A block cuts both directions.** A blocked account cannot follow the
 *     blocker, cannot be followed by the blocker, cannot comment, and cannot
 *     see a private profile. The block row itself is invisible to the blocked
 *     account, so a block never announces itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import { createAvatarUrl } from "./avatar";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/** The state of a follow edge. */
export type FollowStatus = "pending" | "accepted" | "declined" | "cancelled";

/**
 * The relationship between the caller and an account.
 *
 * `none` is the absence of a row. `pending` is a request awaiting the owner's
 * decision. `accepted` is an active follow. `declined` and `cancelled` are
 * terminal — the application treats them as "no relationship", and the
 * database will not let them become an active follow.
 */
export type FollowState = FollowStatus | "none";

/** One account in a followers / following list. */
export interface SocialAccount {
  userId: string;
  username: string;
  displayName: string;
  /**
   * A short-lived signed URL for the account's avatar, or `null`.
   *
   * The stored path is never handed to the browser: the bucket is private,
   * and a path is not a credential.
   */
  avatarUrl: string | null;
}

/** The counts and the caller's relationship, for one profile. */
export interface ProfileSocialState {
  /** The number of ACCEPTED followers. Pending requests are not counted. */
  followerCount: number;
  /** The number of accounts this profile follows. */
  followingCount: number;
  /** The caller's relationship with this profile. */
  state: FollowState;
  /** Whether the caller has blocked this account. */
  blocked: boolean;
  /** Whether this account has blocked the caller. Never disclosed as such. */
  isSelf: boolean;
}

/**
 * The SHELL of a profile — the part a visitor may see even when they may not
 * read the profile's content.
 *
 * See `getProfileSummary` for why this exists and what it deliberately does
 * not contain.
 */
export interface ProfileSummary {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  visibility: "public" | "private";
  followerCount: number;
  followingCount: number;
  isFollower: boolean;
  followState: FollowState;
  isSelf: boolean;
}

/** One incoming follow request. */
export interface FollowRequest {
  id: string;
  follower: SocialAccount;
  requestedAt: string;
}

/** One outgoing follow request. */
export interface OutgoingRequest {
  id: string;
  following: SocialAccount;
  requestedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                              Shared helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * The display name for a profile.
 *
 * The display name lives inside `profile_state` (the JSON document), not in a
 * column, so it is read through the same shape the rest of the app uses. A
 * profile whose JSON is unreadable yields the username alone rather than a
 * fabricated name.
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

/**
 * A PostgREST many-to-one embed, normalised to a single object.
 *
 * The generated client types a to-one embed as an ARRAY, so both shapes are
 * accepted here.
 */
function relationToObject<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return (first ?? null) as T | null;
  }
  return value as T;
}

/** The `profiles` fields the social layer joins in. */
const PROFILE_FIELDS = "user_id, username, profile_state, avatar_path";

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

/**
 * The profile row for a username, as the CALLER may see it.
 *
 * Returns `null` for a username that does not exist and for a private profile
 * the caller may not see. The two are deliberately indistinguishable.
 *
 * The visibility rule itself lives in the RLS policy (`can_view_profile`),
 * so this query simply reports what the database was willing to return.
 */
export async function getProfileByUsername(
  username: string,
): Promise<{ userId: string; username: string; displayName: string; avatarPath: string | null } | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    user_id: string;
    username: string;
    profile_state: unknown;
    avatar_path: string | null;
  };

  return {
    userId: row.user_id,
    username: row.username,
    displayName: displayNameFromProfileState(row.profile_state, row.username),
    avatarPath: row.avatar_path ?? null,
  };
}

/**
 * The SHELL of a profile — the part a visitor may see even when they may not
 * read the profile's content.
 *
 * A private account has to be DISCOVERABLE to be followable: if the only way
 * to find a private profile were to already follow it, a follow request
 * could never be sent. So a non-follower sees the handle, the display name,
 * the avatar, the counts, and their own relationship — and nothing else.
 *
 * The content — the collections, the reviews, the links, the soundtrack —
 * lives in the `profiles` row's JSONB column, and this function NEVER
 * returns it. The row itself stays hidden from a non-follower, so there is
 * no path by which a stranger reads a private profile's content.
 *
 * Returns `null` for a username that does not exist, and for a private
 * profile the caller may not even see the shell of.
 */
export async function getProfileSummary(
  username: string,
): Promise<ProfileSummary | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (targetError || !target) return null;

  const { data, error } = await supabase.rpc("profile_summary", {
    profile_uuid: (target as { user_id: string }).user_id,
  });

  if (error || !data) return null;

  const summary = data as Record<string, unknown>;

  return {
    userId: typeof summary.userId === "string" ? summary.userId : "",
    username: typeof summary.username === "string" ? summary.username : "",
    displayName:
      typeof summary.displayName === "string" ? summary.displayName : "",
    avatarPath:
      typeof summary.avatarPath === "string" ? summary.avatarPath : null,
    visibility: summary.visibility === "private" ? "private" : "public",
    followerCount: Number(summary.followerCount ?? 0),
    followingCount: Number(summary.followingCount ?? 0),
    isFollower: summary.isFollower === true,
    followState:
      typeof summary.followState === "string"
        ? (summary.followState as FollowState)
        : "none",
    isSelf: summary.isSelf === true,
  };
}

/**
 * The counts and the caller's relationship with one account.
 *
 * The counts come from the database rather than from a `count()` the
 * application assembles, because a count of the wrong thing is worse than no
 * count: the `accepted` filter is what keeps a pending request out of the
 * follower total.
 *
 * An anonymous caller gets the public counts and no relationship.
 */
export async function getProfileSocialState(
  username: string,
): Promise<ProfileSocialState | null> {
  if (!isSupabaseConfigured()) return null;

  /*
   * The summary carries the counts AND the caller's relationship, and it is
   * readable for a private profile the caller may only see the shell of. That
   * matters: the Follow button on a private profile has to be able to say
   * "Requested", and the counts have to be right even for a visitor who
   * cannot open the profile.
   */
  const summary = await getProfileSummary(username);
  if (!summary) return null;

  const viewerId = await getCurrentUserId();

  let blocked = false;
  if (viewerId && viewerId !== summary.userId) {
    const supabase = await getServerClient({ canSetCookies: false });
    if (supabase) {
      const { data: block } = await supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", viewerId)
        .eq("blocked_id", summary.userId)
        .maybeSingle();

      blocked = Boolean(block);
    }
  }

  return {
    followerCount: summary.followerCount,
    followingCount: summary.followingCount,
    state: summary.followState,
    blocked,
    isSelf: summary.isSelf,
  };
}

/**
 * One account's ACCEPTED followers.
 *
 * Private profiles are readable only by their owner and their approved
 * followers, so a stranger asking for the list of a private account gets an
 * empty list rather than an error — the same answer they would get for the
 * profile itself.
 */
export async function listFollowers(
  username: string,
  options: { limit?: number; offset?: number } = {},
): Promise<SocialAccount[]> {
  return listEdges(username, "followers", options);
}

/**
 * One account's ACCEPTED following list.
 */
export async function listFollowing(
  username: string,
  options: { limit?: number; offset?: number } = {},
): Promise<SocialAccount[]> {
  return listEdges(username, "following", options);
}

/**
 * The shared implementation behind both lists.
 *
 * `direction` decides which end of the edge is being listed. The join is an
 * INNER join on `profiles`, so an account whose profile row is not readable
 * simply does not appear — which is the privacy rule expressed in the query
 * as well as in the policy.
 */
async function listEdges(
  username: string,
  direction: "followers" | "following",
  options: { limit?: number; offset?: number },
): Promise<SocialAccount[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getProfileByUsername(username);
  if (!profile) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  /*
   * `follows` rows carry a user id on one end and the OTHER end is the
   * subject of the list, so the two directions need different filters:
   *
   *   followers  -> the subject is `following_id`, the listed account is
   *                 `follower_id`
   *   following  -> the subject is `follower_id`, the listed account is
   *                 `following_id`
   *
   * The join is on the listed account, and it is an `!inner` embed so a
   * profile the caller may not read does not come back at all.
   */
  const column = direction === "followers" ? "follower_id" : "following_id";
  const subjectColumn = direction === "followers" ? "following_id" : "follower_id";

  const { data, error } = await supabase
    .from("follows")
    .select(
      `id, created_at, profiles!inner(${PROFILE_FIELDS})`,
    )
    .eq(subjectColumn, profile.userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    created_at: string;
    profiles?: unknown;
  }>;

  return await toSocialAccounts(supabase, rows);
}

/**
 * Map joined `follows` rows to accounts, with signed avatar URLs.
 *
 * The avatar is signed HERE, per request, and the stored path never leaves
 * the server: the bucket is private, and a path is not a credential.
 */
async function toSocialAccounts(
  supabase: SupabaseClient,
  rows: Array<{ id: string; created_at: string; profiles?: unknown }>,
): Promise<SocialAccount[]> {
  const accounts: SocialAccount[] = [];

  for (const row of rows) {
    const joined = relationToObject<{
      user_id: string;
      username: string;
      profile_state: unknown;
      avatar_path: string | null;
    }>(row.profiles);
    if (!joined) continue;

    accounts.push({
      userId: joined.user_id,
      username: joined.username,
      displayName: displayNameFromProfileState(
        joined.profile_state,
        joined.username,
      ),
      avatarUrl: await createAvatarUrl(supabase, joined.avatar_path ?? null),
    });
  }

  return accounts;
}

/**
 * The incoming follow requests for the caller's own profile.
 *
 * Only the owner of the followed account ever sees these, and only rows in
 * the `pending` state — an approved or declined request is history, not an
 * outstanding request.
 */
export async function listIncomingRequests(): Promise<FollowRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("follows")
    .select(`id, created_at, profiles!inner(${PROFILE_FIELDS})`)
    .eq("following_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    created_at: string;
    profiles?: unknown;
  }>;

  const accounts = await toSocialAccounts(supabase, rows);

  // The account list and the request list are read in the same order, so they
  // are zipped back together rather than matched by id.
  return accounts
    .map((account, index) => {
      const row = rows[index];
      if (!row) return null;
      return {
        id: row.id,
        requestedAt: row.created_at,
        follower: account,
      };
    })
    .filter((request): request is FollowRequest => request !== null);
}

/**
 * The follow requests the CALLER has sent and that are still pending.
 *
 * This is what lets a person see "Requested" rather than guessing whether
 * their request went through.
 */
export async function listOutgoingRequests(): Promise<OutgoingRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("follows")
    .select(`id, created_at, profiles!inner(${PROFILE_FIELDS})`)
    .eq("follower_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    created_at: string;
    profiles?: unknown;
  }>;

  const accounts = await toSocialAccounts(supabase, rows);

  return accounts
    .map((account, index) => {
      const row = rows[index];
      if (!row) return null;
      return {
        id: row.id,
        requestedAt: row.created_at,
        following: account,
      };
    })
    .filter((request): request is OutgoingRequest => request !== null);
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                   */
/* -------------------------------------------------------------------------- */

export type SocialActionResult =
  | { ok: true; state: FollowState; message?: string }
  | { ok: false; reason: string; message: string };

/**
 * Follow an account.
 *
 * What happens depends on the target's visibility:
 *
 *   - a PUBLIC account: the edge becomes `accepted` immediately;
 *   - a PRIVATE account: the edge becomes `pending`, and the owner decides.
 *
 * The account is named by its USERNAME, never by a user id. The follower is
 * always the caller — derived from the session, not from the request.
 *
 * A duplicate is not an error: following somebody you already follow leaves
 * the relationship exactly as it was and says so.
 */
export async function followAccount(username: string): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in to follow." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const target = await resolveTarget(username);
  if (!target) {
    return { ok: false, reason: "not-found", message: "That profile could not be found." };
  }

  if (target.userId === userId) {
    return { ok: false, reason: "self", message: "You cannot follow yourself." };
  }

  if (target.blocked) {
    return {
      ok: false,
      reason: "blocked",
      message: "You cannot follow this account.",
    };
  }

  // Already following, or already requested. The state is returned unchanged.
  const { data: existing } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", userId)
    .eq("following_id", target.userId)
    .maybeSingle();

  if (existing?.status === "accepted" || existing?.status === "pending") {
    return { ok: true, state: existing.status as FollowStatus };
  }

  /*
   * A DECLINED or CANCELLED edge is a terminal row, kept so the requester
   * cannot immediately re-request and spam the owner. Re-requesting means
   * moving that row back to `pending`, not inserting a second one — the
   * UNIQUE constraint on the pair is what makes that the only possibility.
   *
   * The status is DERIVED by the database from the target's visibility, so
   * this module does not choose it.
   */
  if (existing?.status === "declined" || existing?.status === "cancelled") {
    const { error } = await supabase
      .from("follows")
      .update({ status: "pending" })
      .eq("follower_id", userId)
      .eq("following_id", target.userId)
      .eq("status", existing.status);

    if (error) {
      return {
        ok: false,
        reason: "error",
        message: error.message ?? "Could not follow that account.",
      };
    }

    /*
     * The trigger rewrites the status to what is TRUE — 'accepted' for a
     * public target, 'pending' for a private one — so the state is read back
     * rather than assumed.
     */
    const { data: reRequested } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", userId)
      .eq("following_id", target.userId)
      .maybeSingle();

    return {
      ok: true,
      state: (reRequested?.status as FollowStatus) ?? "pending",
    };
  }

  /*
   * A public account accepts the follow immediately; a private account records
   * a request for the owner to answer.
   *
   * The status is DERIVED by the database from the target's visibility — a
   * BEFORE INSERT trigger rewrites whatever was sent — so this module sends
   * the state it EXPECTS and lets the database have the final word.
   */
  const status: FollowStatus = target.isPublic ? "accepted" : "pending";

  const { error } = await supabase.from("follows").insert({
    follower_id: userId,
    following_id: target.userId,
    status,
  });

  if (error) {
    /*
     * 23505 = unique_violation. Another request for the same pair landed
     * first, so the relationship exists either way. The state is re-read so
     * the caller is told the truth about what the database holds.
     */
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", userId)
        .eq("following_id", target.userId)
        .maybeSingle();

      if (raced?.status) {
        return { ok: true, state: raced.status as FollowStatus };
      }
    }

    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not follow that account.",
    };
  }

  /*
   * The row is read back rather than assuming the derived status, because the
   * database decides it and the application should report what is TRUE.
   */
  const { data: written } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", userId)
    .eq("following_id", target.userId)
    .maybeSingle();

  return { ok: true, state: (written?.status as FollowStatus) ?? status };
}

/**
 * Stop following an account.
 *
 * This covers two cases with one operation, because they are the same
 * relationship:
 *
 *   - the follower unfollows an accepted follow;
 *   - the follower withdraws a pending request.
 *
 * The two cases are DIFFERENT operations, and the database models them
 * differently:
 *
 *   - a PENDING request is WITHDRAWN, which moves the row to `cancelled`.
 *     The row is kept so the state machine has a terminal request state, and
 *     so a withdrawn request is distinguishable from one that was never made.
 *   - an ACCEPTED follow is UNFOLLOWED, which DELETES the row. There is no
 *     "unfollowed" terminal state: the relationship simply ends, and leaving a
 *     row behind would keep the pair occupied and block a later re-follow.
 *
 * A DECLINED request is kept as well — see `declineRequest`.
 */
export async function unfollowAccount(username: string): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const target = await resolveTarget(username);
  if (!target) {
    return { ok: false, reason: "not-found", message: "That profile could not be found." };
  }

  /*
   * Which operation this is depends on the CURRENT state, so the row is read
   * first. The database's trigger would refuse the wrong transition anyway —
   * this only chooses the right one.
   */
  const { data: existing } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", userId)
    .eq("following_id", target.userId)
    .maybeSingle();

  if (existing?.status === "pending") {
    const { error } = await supabase
      .from("follows")
      .update({ status: "cancelled" })
      .eq("follower_id", userId)
      .eq("following_id", target.userId)
      .eq("status", "pending");

    if (error) {
      return {
        ok: false,
        reason: "error",
        message: error.message ?? "Could not withdraw that request.",
      };
    }

    return { ok: true, state: "cancelled" };
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", userId)
    .eq("following_id", target.userId);

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not unfollow that account.",
    };
  }

  return { ok: true, state: "none" };
}

/**
 * Approve a pending follow request.
 *
 * Only the owner of the followed account can do this, and the RLS policy
 * plus the state-machine trigger enforce that independently of this function.
 */
export async function acceptRequest(
  username: string,
): Promise<SocialActionResult> {
  return resolveRequest(username, "accepted");
}

/**
 * Decline a pending follow request.
 *
 * The row is KEPT in the `declined` state rather than deleted, so the
 * requester cannot immediately re-request and spam the owner. The database
 * will not let a declined edge become an accepted one.
 */
export async function declineRequest(
  username: string,
): Promise<SocialActionResult> {
  return resolveRequest(username, "declined");
}

/**
 * The shared implementation of approve and decline.
 *
 * The target is the REQUESTER, not the followed account: the owner of a
 * profile approves the person who wants to follow it.
 */
async function resolveRequest(
  username: string,
  status: "accepted" | "declined",
): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const ownerId = await getCurrentUserId();
  if (!ownerId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  // The requester, named by username.
  const { data: requester, error: requesterError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (requesterError || !requester) {
    return { ok: false, reason: "not-found", message: "That account could not be found." };
  }

  /*
   * The UPDATE is scoped to BOTH ends of the edge: the caller's id must be
   * the followed account, and the requester's id must be the follower.
   *
   * Scoping by both is what makes this safe without a separate read: the
   * RLS policy already refuses an update by anyone who is not one of the two
   * ends, and the trigger refuses a transition the caller is not entitled to
   * make. Together they mean a caller can only ever resolve THEIR OWN
   * incoming request.
   */
  const { data: updated, error } = await supabase
    .from("follows")
    .update({ status })
    .eq("follower_id", requester.user_id)
    .eq("following_id", ownerId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not update that request.",
    };
  }

  if (!updated) {
    return {
      ok: false,
      reason: "not-found",
      message: "That request is no longer pending.",
    };
  }

  return { ok: true, state: status };
}

/**
 * Remove an existing follower.
 *
 * Only the owner of the followed account can do this — the other end's
 * unfollow is `unfollowAccount`, which deletes the row.
 *
 * This is the owner's moderation power over their own follower list, and it
 * is deliberately a DELETE rather than a flag: the follower is gone, and the
 * count reflects it.
 */
export async function removeFollower(username: string): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const ownerId = await getCurrentUserId();
  if (!ownerId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const { data: follower, error: followerError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (followerError || !follower) {
    return { ok: false, reason: "not-found", message: "That account could not be found." };
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", follower.user_id)
    .eq("following_id", ownerId);

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not remove that follower.",
    };
  }

  return { ok: true, state: "none" };
}

/* -------------------------------------------------------------------------- */
/*                                   Blocks                                   */
/* -------------------------------------------------------------------------- */

/**
 * Block an account.
 *
 * Blocking has three effects, and all three are enforced by the database:
 *
 *   1. the blocked account cannot follow, request to follow, or comment;
 *   2. any existing follow edge between the pair is removed, because a block
 *      that left a live follow in place would not actually cut the
 *      relationship;
 *   3. the blocked account cannot see a private profile.
 *
 * The block is one-directional and invisible to the blocked account: it
 * cannot see the row, and the UI never says "you are blocked".
 */
export async function blockAccount(username: string): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const target = await resolveTarget(username);
  if (!target) {
    return { ok: false, reason: "not-found", message: "That profile could not be found." };
  }

  if (target.userId === userId) {
    return { ok: false, reason: "self", message: "You cannot block yourself." };
  }

  const { error } = await supabase.from("user_blocks").insert({
    blocker_id: userId,
    blocked_id: target.userId,
  });

  if (error && error.code !== "23505") {
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not block that account.",
    };
  }

  /*
   * The follow edges between the pair are cut by the DATABASE.
   *
   * An AFTER INSERT trigger on `user_blocks` deletes both directions of the
   * edge, so the relationship cannot survive a block however the block was
   * created. Doing it here as well would be redundant — and worse, it would
   * fail, because the blocked end's edge is not readable by the blocker.
   */
  return { ok: true, state: "none" };
}

/**
 * Unblock an account.
 */
export async function unblockAccount(username: string): Promise<SocialActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (targetError || !target) {
    return { ok: false, reason: "not-found", message: "That profile could not be found." };
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", target.user_id);

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Could not unblock that account.",
    };
  }

  return { ok: true, state: "none" };
}

/* -------------------------------------------------------------------------- */
/*                              Target resolution                             */
/* -------------------------------------------------------------------------- */

/**
 * The account a social action is aimed at.
 *
 * The target is resolved by USERNAME and read through the caller's own
 * permissions, so a private profile the caller may not see resolves to
 * `null` — the same answer as a username that does not exist.
 */
async function resolveTarget(username: string): Promise<{
  userId: string;
  isPublic: boolean;
  blocked: boolean;
} | null> {
  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const viewerId = await getCurrentUserId();

  /*
   * The target's identity is resolved through `profile_summary`, which is
   * readable for a private profile the caller may only see the shell of.
   *
   * That is exactly the case this function has to handle: the caller wants
   * to follow a PRIVATE account, so they cannot read its `profiles` row, and
   * the request has to be recorded anyway. Resolving through the row would
   * make every private-account follow request fail as "not found".
   */
  const summary = await getProfileSummary(username);
  if (!summary) return null;

  let blocked = false;
  if (viewerId) {
    const { data: block } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", viewerId)
      .eq("blocked_id", summary.userId)
      .maybeSingle();
    blocked = Boolean(block);
  }

  return {
    userId: summary.userId,
    // A private profile is one the caller cannot open. Following it creates a
    // REQUEST for the owner to answer; following a public one takes effect
    // immediately.
    isPublic: summary.visibility === "public",
    blocked,
  };
}

export type { SupabaseClient };
