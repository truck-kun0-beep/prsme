/**
 * Server-side profile data access.
 *
 * Every read and write of the `profiles` table goes through this module. The
 * rules it enforces, in order of importance:
 *
 *   1. **Ownership is never taken from the client.** `user_id` is derived from
 *      the verified session, never from a request body. The brief requires
 *      this explicitly, and the `with check` clause in the RLS policy enforces
 *      it a second time at the database.
 *
 *   2. **Visibility is never taken from the client either** on create — a new
 *      profile starts private unless the owner asked for public, and an update
 *      may only move between the two documented values.
 *
 *   3. **Not-found beats forbidden for private profiles.** A visitor who asks
 *      for someone else's private profile gets the same response as for a
 *      profile that does not exist, so the URL cannot be used to discover who
 *      has an account.
 *
 * Note that RLS is the real gate — these functions are a typed, convenient
 * layer above it. If a policy were ever dropped, these queries would still
 * refuse to return another user's private row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import { validateUsername } from "./username";
import {
  toStoredProfileState,
  fromStoredProfileState,
  type StoredProfileState,
} from "./profileState";
import type { ProfileDraft, ProfileVisibility } from "@/lib/profileDraft";
import { buildDefaultDraft } from "@/lib/profileDraft";

/** One row of `public.profiles`, exactly as the database holds it. */
export interface ProfileRow {
  id: string;
  user_id: string;
  username: string;
  visibility: "public" | "private";
  profile_state: unknown;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
}

/** The subset of the row this app may treat as truth. */
export interface ProfileRecord {
  id: string;
  userId: string;
  username: string;
  visibility: "public" | "private";
  /** Rebuilt draft, or `null` when the stored document was unreadable. */
  draft: ProfileDraft | null;
  avatarPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Reads                                    */
/* -------------------------------------------------------------------------- */

/**
 * The profile owned by the current user, or `null`.
 *
 * Scoped by `user_id` rather than by username, so it cannot return someone
 * else's row even if a username were somehow passed in.
 */
export async function getProfileForUser(): Promise<ProfileRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toRecord(data as ProfileRow);
}

/**
 * A profile by username, for the public `/u/[username]` route.
 *
 * Returns `null` for: no such profile, or a private profile the caller does
 * not own. Both are deliberately indistinguishable to the caller — see note 3
 * above.
 */
export async function getProfileByUsername(
  username: string,
): Promise<ProfileRecord | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  // The column is stored lowercase (the app lowercases before insert), but a
  // visitor may type any casing in the URL, so match on lower(username).
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ProfileRow;

  // Defence in depth: RLS already hides a private profile from a non-owner,
  // so reaching here with a private row means the caller IS the owner. But the
  // check is kept explicit because a missing policy would otherwise leak the
  // row silently.
  if (row.visibility === "private") {
    const userId = await getCurrentUserId();
    if (!userId || userId !== row.user_id) return null;
  }

  return toRecord(row);
}

/** True when the username exists — including a private one we cannot read. */
export async function checkUsernameTaken(username: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return false;

  /*
   * Uses the SECURITY DEFINER helper rather than a plain SELECT.
   *
   * A direct `select username from profiles where lower(username) = ...`
   * would be filtered by RLS, so a *private* profile would look "available"
   * and the owner would later hit a raw constraint violation at signup. The
   * function runs with the definer's rights and returns only a boolean, which
   * reveals that a name is taken without revealing who holds it.
   */
  const { data, error } = await supabase.rpc("is_username_taken", {
    candidate: username.trim().toLowerCase(),
  });

  if (error) return false;
  return data === true;
}

/* -------------------------------------------------------------------------- */
/*                                  Writes                                    */
/* -------------------------------------------------------------------------- */

export type CreateProfileResult =
  | { ok: true; profile: ProfileRecord }
  | { ok: false; reason: "not-authenticated" | "taken" | "invalid" | "already-exists" | "error"; message: string };

/**
 * Create the current user's one profile.
 *
 * The race is handled by the database, not here: `profiles.user_id` is
 * UNIQUE, so if two onboarding requests arrive together, Postgres lets exactly
 * one insert and the other gets a 23505, which this maps to
 * `already-exists`. A pre-flight "do I have a profile yet?" check would be a
 * hint, never a guarantee.
 */
export async function createProfileForUser(input: {
  username: string;
  displayName: string;
  bio?: string;
  visibility?: "public" | "private";
  draft?: ProfileDraft | null;
}): Promise<CreateProfileResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "error", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      ok: false,
      reason: "not-authenticated",
      message: "You need to be signed in to create a profile.",
    };
  }

  const username = validateUsername(input.username);
  if (!username.ok) {
    return { ok: false, reason: "invalid", message: username.message };
  }

  const displayName = (input.displayName ?? "").trim();
  if (!displayName) {
    return {
      ok: false,
      reason: "invalid",
      message: "Enter a display name.",
    };
  }

  // New profiles default to PRIVATE. Publishing is a deliberate second step,
  // not the default outcome of signing up.
  const visibility = input.visibility === "public" ? "public" : "private";

  const draft = input.draft
    ? { ...input.draft }
    : buildDefaultDraft({ includeDemoClicks: false });

  // Identity fields the owner supplied on the onboarding form win over the
  // draft's values — the form is the authority for what they just typed.
  draft.identity.username = username.value;
  draft.identity.displayName = displayName;
  if (typeof input.bio === "string") draft.identity.bio = input.bio.trim();
  draft.visibility = visibility === "public" ? "public" : "private";

  const state = toStoredProfileState(draft);

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "error", message: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      username: username.value,
      visibility,
      profile_state: state,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation. Either `user_id` (a second profile for this
    // account — the hard product rule) or the case-insensitive username index.
    if (error.code === "23505") {
      const message = (error.message ?? "").toLowerCase();
      if (message.includes("user_id") || message.includes("profiles_user_id")) {
        return {
          ok: false,
          reason: "already-exists",
          message: "This account already has a profile.",
        };
      }
      return {
        ok: false,
        reason: "taken",
        message: "That username is already taken.",
      };
    }
    // 23514 = check_violation, i.e. the format or reserved-name constraint.
    if (error.code === "23514") {
      return {
        ok: false,
        reason: "invalid",
        message: "That username isn't allowed.",
      };
    }
    return { ok: false, reason: "error", message: error.message ?? "Could not create the profile." };
  }

  if (!data) {
    return { ok: false, reason: "error", message: "Could not create the profile." };
  }

  return { ok: true, profile: toRecord(data as ProfileRow) };
}

export type SaveProfileResult =
  | { ok: true; profile: ProfileRecord }
  | { ok: false; message: string };

/**
 * Persist the current user's Studio draft.
 *
 * Only the JSON document and (optionally) the visibility column are written.
 * `user_id` and `username` are never in the update set: an owner must not be
 * able to rename their URL from the save path, and must not be able to move
 * the row to another account.
 *
 * The RLS `with check` clause on UPDATE is the real guarantee that `user_id`
 * is unchanged — this function simply never attempts it.
 */
export async function saveProfileDraft(input: {
  draft: ProfileDraft;
  visibility?: "public" | "private";
  avatarPath?: string | null;
}): Promise<SaveProfileResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: "You need to be signed in to save." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const state = toStoredProfileState(input.draft);

  const patch: Record<string, unknown> = { profile_state: state };
  if (input.visibility) patch.visibility = input.visibility;
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, message: error.message ?? "Could not save." };
  if (!data) return { ok: false, message: "Could not find your profile." };

  return { ok: true, profile: toRecord(data as ProfileRow) };
}

/**
 * Change the current user's visibility.
 *
 * Private is visible only to the owner in this phase; the follower tier will
 * arrive with the follower feature.
 */
export async function setVisibility(
  visibility: "public" | "private",
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase is not configured." };

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "You need to be signed in." };

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase
    .from("profiles")
    .update({ visibility })
    .eq("user_id", userId);

  if (error) return { ok: false, message: error.message ?? "Could not change visibility." };
  return { ok: true };
}

/**
 * Point the profile at an uploaded avatar.
 *
 * Separate from `saveProfileDraft` because an avatar swap must NOT rewrite
 * `profile_state`. Bundling them would mean an image upload silently
 * overwrote the owner's customization with whatever the server happened to
 * have cached — the kind of bug that eats someone's work.
 *
 * `avatarPath` must be a path the caller owns; the storage policy enforces
 * that, and the route additionally checks it starts with the caller's uid.
 */
export async function setAvatarPath(
  avatarPath: string | null,
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "You need to be signed in." };

  if (avatarPath !== null && !avatarPath.startsWith(`${userId}/`)) {
    return { ok: false, message: "That avatar path isn't yours to set." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("user_id", userId);

  if (error) return { ok: false, message: error.message ?? "Could not save the avatar." };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                              Shared helpers                               */
/* -------------------------------------------------------------------------- */

/**
 * Row -> typed record.
 *
 * An unreadable `profile_state` yields `draft: null` rather than a
 * fabricated one, so the caller can decide between the starter profile and an
 * error. The identity fields (username, visibility) still come through, since
 * they are columns and are always valid.
 */
function toRecord(row: ProfileRow): ProfileRecord {
  const visibility: ProfileVisibility =
    row.visibility === "private" ? "private" : "public";

  const draft = fromStoredProfileState(row.profile_state, {
    username: row.username,
    visibility,
  });

  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    visibility: visibility === "private" ? "private" : "public",
    draft,
    avatarPath: row.avatar_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type { StoredProfileState };
export { toRecord as profileRowToRecord };
export type { SupabaseClient };