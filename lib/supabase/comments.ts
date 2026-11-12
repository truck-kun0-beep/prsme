/**
 * Phase 8 — profile comments.
 *
 * Every read and write of `profile_comments` goes through this module, for
 * the same reason `reviews.ts` exists: the rules about *who may see and write
 * what* belong in exactly one place, and they are enforced by the server's
 * session rather than by anything the browser supplies.
 *
 * THE RULES, IN ORDER OF IMPORTANCE
 *
 *  1. **Identity comes from the session.** The author is always the caller.
 *     The profile being commented on is named by its USERNAME, never by a
 *     user id from the request body.
 *
 *  2. **A private profile takes comments from its approved followers only.**
 *     A pending follow request is not enough. The database's
 *     `can_comment_on` helper is the single definition of that rule, and the
 *     RLS policy calls it.
 *
 *  3. **The text is plain text and it is validated.** No HTML, no scripts,
 *     1–1,000 characters. The body is escaped on the way out, so even a
 *     crafted payload is text rather than markup.
 *
 *  4. **Authors edit and delete their own comments; the profile owner can
 *     delete any comment on their profile.** Both are enforced by the RLS
 *     policy, independently of this module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import { COMMENT_MAX, COMMENT_PAGE_SIZE } from "./socialConstants";

/*
 * The constants live in `socialConstants.ts` because the client needs them
 * too, and this module reaches the server. They are re-exported here so the
 * server code keeps importing them from one obvious place.
 */
export { COMMENT_MAX, COMMENT_PAGE_SIZE };

/** One comment, as the application sees it. */
export interface ProfileComment {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Whether the CALLER may edit or delete this comment. */
  isOwn: boolean;
  /** Whether the CALLER owns the profile the comment sits on. */
  isOnOwnProfile: boolean;
}

/** A page of comments, plus the cursor for the next one. */
export interface CommentPage {
  comments: ProfileComment[];
  /** The offset to pass for the next page, or `null` when there are no more. */
  nextOffset: number | null;
  /** The total number of comments, when it could be read cheaply. */
  total: number | null;
}

/* -------------------------------------------------------------------------- */
/*                              Shared helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * The display name for a profile.
 *
 * The display name lives inside `profile_state` (the JSON document), not in a
 * column, so it is read through the same shape the rest of the app uses.
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
 */
function relationToObject<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return (first ?? null) as T | null;
  }
  return value as T;
}

/**
 * Strip anything that could become markup.
 *
 * The comment body is PLAIN TEXT, and it is stored and rendered as text. This
 * function is the belt to the braces of that rule: even if a comment somehow
 * contained angle brackets, they are removed here rather than being escaped
 * into something that renders as a tag.
 *
 * It is deliberately NOT an HTML escaper. The renderer escapes the text when
 * it puts it on the page; this function removes the characters that would
 * make a comment LOOK like markup in the first place, which is what the
 * requirement asks for.
 */
export function sanitizeCommentBody(raw: unknown): string {
  if (typeof raw !== "string") return "";

  return raw
    // Control characters, except newline and tab.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Angle brackets, so a comment cannot contain anything that looks like a
    // tag or an attribute.
    .replace(/[<>]/g, "")
    // The rest are harmless in a text node, but a `javascript:` URL pasted in
    // is worth removing as a string even though it is never linked.
    .replace(/javascript\s*:/gi, "")
    .trim();
}

/**
 * Validate a comment body.
 *
 * The same rules the database enforces, checked here so the author gets a
 * sentence instead of a Postgres constraint violation.
 */
export function validateCommentBody(raw: unknown): {
  ok: boolean;
  body?: string;
  message?: string;
} {
  if (typeof raw !== "string") {
    return { ok: false, message: "A comment has to be text." };
  }

  const body = sanitizeCommentBody(raw);

  if (!body) {
    return { ok: false, message: "Write something first." };
  }

  if (body.length > COMMENT_MAX) {
    return {
      ok: false,
      message: `Comments are capped at ${COMMENT_MAX.toLocaleString()} characters.`,
    };
  }

  return { ok: true, body };
}

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

/**
 * A page of comments on a profile.
 *
 * The list is newest first, and paged with an OFFSET rather than a cursor
 * because the ordering is stable (`created_at desc, id desc`) and the offset
 * is enough for a list that a person reads rather than a feed that is
 * crawled.
 *
 * A private profile's comments are visible to its owner and its approved
 * followers — the RLS policy decides that, so a stranger gets an empty page
 * rather than an error.
 */
export async function listProfileComments(
  username: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CommentPage> {
  const empty: CommentPage = { comments: [], nextOffset: null, total: null };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const limit = Math.min(Math.max(options.limit ?? COMMENT_PAGE_SIZE, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (profileError || !profile) return empty;

  const viewerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("profile_comments")
    .select(
      `id, author_id, body, created_at, updated_at,
       profiles!inner(username, profile_state)`,
    )
    .eq("profile_id", profile.user_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) {
    // An RLS-filtered query returns no rows rather than an error, so the
    // total is unknown rather than zero when the profile is not visible.
    return { ...empty, total: error ? null : 0 };
  }

  const rows = data as Array<{
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    profiles?: unknown;
  }>;

  const comments: ProfileComment[] = rows
    .map((row) => {
      const joined = relationToObject<{
        username: string;
        profile_state: unknown;
      }>(row.profiles);
      if (!joined) return null;
      return {
        id: row.id,
        authorId: row.author_id,
        authorUsername: joined.username,
        authorDisplayName: displayNameFromProfileState(
          joined.profile_state,
          joined.username,
        ),
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isOwn: viewerId !== null && viewerId === row.author_id,
        isOnOwnProfile: viewerId !== null && viewerId === profile.user_id,
      };
    })
    .filter((comment): comment is ProfileComment => comment !== null);

  return {
    comments,
    nextOffset: comments.length === limit ? offset + limit : null,
    total: null,
  };
}

/**
 * The number of comments on a profile.
 *
 * Counted through the same RLS policy as the list, so a private profile's
 * comment count is invisible to a non-follower — the same answer they get for
 * the profile itself.
 */
export async function countProfileComments(
  username: string,
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (!profile) return 0;

  const { count } = await supabase
    .from("profile_comments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.user_id);

  return count ?? 0;
}

/**
 * May the CALLER comment on this profile?
 *
 * The answer comes from the database's `can_comment_on` helper, which knows
 * the profile's visibility, whether the caller is an approved follower,
 * whether the pair is blocked, and whether the owner has turned comments off.
 *
 * The application does not re-derive any of that: a rule implemented twice
 * is a rule that will eventually disagree with itself. The database answers,
 * and the UI reflects the answer.
 */
export async function canViewerComment(username: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (!profile) return false;

  const { data, error } = await supabase.rpc("can_comment_on", {
    profile_uuid: (profile as { user_id: string }).user_id,
  });

  if (error) return false;
  return data === true;
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                   */
/* -------------------------------------------------------------------------- */

export type CommentActionResult =
  | { ok: true; comment: ProfileComment }
  | { ok: false; reason: string; message: string };

/**
 * Post a comment on a profile.
 *
 * The author is the caller. The profile is named by its USERNAME.
 *
 * Whether the comment is ALLOWED is decided by the database: the RLS policy
 * calls `can_comment_on`, which knows the profile's visibility, whether the
 * caller is an approved follower, and whether the pair is blocked. A refusal
 * therefore comes back as a policy error, and this function turns it into a
 * sentence.
 */
export async function createComment(
  username: string,
  rawBody: string,
): Promise<CommentActionResult> {
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
      message: "You need to be signed in to comment.",
    };
  }

  const validation = validateCommentBody(rawBody);
  if (!validation.ok || !validation.body) {
    return {
      ok: false,
      reason: "invalid",
      message: validation.message ?? "That comment couldn't be read.",
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      reason: "not-found",
      message: "That profile could not be found.",
    };
  }

  const { data, error } = await supabase
    .from("profile_comments")
    .insert({
      author_id: userId,
      profile_id: profile.user_id,
      body: validation.body,
    })
    .select(
      `id, author_id, body, created_at, updated_at,
       profiles!inner(username, profile_state)`,
    )
    .maybeSingle();

  if (error) {
    /*
     * A policy refusal comes back as a Postgres error with the message from
     * the RLS check. The four cases a caller can actually hit are turned into
     * sentences here.
     */
    const message = error.message ?? "";

    if (/row-level security/i.test(message)) {
      return {
        ok: false,
        reason: "not-allowed",
        message:
          "You can't comment on this profile. Followers of a private profile can comment; anyone can comment on a public one.",
      };
    }

    /*
     * The rate limit. The database refuses a burst, so the refusal arrives
     * here as the trigger's own message rather than as a policy error.
     */
    if (/commenting too quickly/i.test(message)) {
      return {
        ok: false,
        reason: "rate-limited",
        message: "You're commenting too quickly. Give it a moment and try again.",
      };
    }

    if (error.code === "23514") {
      return {
        ok: false,
        reason: "invalid",
        message: "That comment is empty or too long.",
      };
    }

    return {
      ok: false,
      reason: "error",
      message: error.message ?? "Your comment could not be posted.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "error",
      message: "Your comment could not be posted.",
    };
  }

  const row = data as {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    profiles?: unknown;
  };

  const joined = relationToObject<{ username: string; profile_state: unknown }>(
    row.profiles,
  );

  return {
    ok: true,
    comment: {
      id: row.id,
      authorId: row.author_id,
      authorUsername: joined?.username ?? "",
      authorDisplayName: displayNameFromProfileState(
        joined?.profile_state,
        joined?.username ?? "Someone",
      ),
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwn: true,
      isOnOwnProfile: userId === profile.user_id,
    },
  };
}

/**
 * Edit the caller's own comment.
 *
 * Only the author may edit, and only their own row — the RLS policy refuses
 * the update otherwise, so a crafted request naming somebody else's comment
 * changes nothing.
 */
export async function updateComment(
  commentId: string,
  rawBody: string,
): Promise<CommentActionResult> {
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
      message: "You need to be signed in.",
    };
  }

  const validation = validateCommentBody(rawBody);
  if (!validation.ok || !validation.body) {
    return {
      ok: false,
      reason: "invalid",
      message: validation.message ?? "That comment couldn't be read.",
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

  const { data, error } = await supabase
    .from("profile_comments")
    .update({ body: validation.body })
    .eq("id", commentId)
    .eq("author_id", userId)
    .select(
      `id, author_id, body, created_at, updated_at,
       profiles!inner(username, profile_state)`,
    )
    .maybeSingle();

  if (error) {
    if (/row-level security/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "not-allowed",
        message: "You can only edit your own comments.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "That comment could not be updated.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "not-found",
      message: "That comment could not be found.",
    };
  }

  const row = data as {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    profiles?: unknown;
  };

  const joined = relationToObject<{ username: string; profile_state: unknown }>(
    row.profiles,
  );

  return {
    ok: true,
    comment: {
      id: row.id,
      authorId: row.author_id,
      authorUsername: joined?.username ?? "",
      authorDisplayName: displayNameFromProfileState(
        joined?.profile_state,
        joined?.username ?? "Someone",
      ),
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwn: true,
      isOnOwnProfile: false,
    },
  };
}

/**
 * Delete a comment.
 *
 * The author may delete their own, and the profile's owner may delete any
 * comment on their profile. Both are enforced by the RLS policy; the
 * `.or(...)` clause here is only a convenience that lets the owner's delete
 * reach the row, and the policy is what actually decides.
 */
export async function deleteComment(
  commentId: string,
): Promise<{ ok: boolean; reason?: string; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Accounts aren't set up on this build." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Accounts aren't set up on this build." };
  }

  const { data, error } = await supabase
    .from("profile_comments")
    .delete()
    .eq("id", commentId)
    .or(`author_id.eq.${userId},profile_id.eq.${userId}`)
    .select("id")
    .maybeSingle();

  if (error) {
    if (/row-level security/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "not-allowed",
        message: "You can only delete your own comments.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "That comment could not be deleted.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "not-found",
      message: "That comment could not be found.",
    };
  }

  return { ok: true };
}

export type { SupabaseClient };
