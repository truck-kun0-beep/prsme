/**
 * Phase 8 — reports.
 *
 * Reports are stored for a future moderation queue. This phase records them
 * and nothing more: no automated action is taken on the strength of a
 * report, and there is no moderation UI.
 *
 * THE RULES, IN ORDER OF IMPORTANCE
 *
 *  1. **Identity comes from the session.** The reporter is always the caller.
 *
 *  2. **A report never announces itself.** Only the reporter can read their
 *     own report, so the account that was reported cannot discover that it
 *     was reported. A report that notifies its subject is a notice, not a
 *     report.
 *
 *  3. **A report names a real subject.** A report is either about a comment
 *     or about a profile, and the foreign keys plus the CHECK constraint
 *     mean it cannot name neither, and cannot name both.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import {
  REPORT_REASONS,
  REPORT_DETAILS_MAX,
  isReportReason,
  type ReportReason,
} from "./socialConstants";

/*
 * The constants live in `socialConstants.ts` because the client needs them
 * too, and this module reaches the server. They are re-exported here so the
 * server code keeps importing them from one obvious place.
 */
export {
  REPORT_REASONS,
  REPORT_DETAILS_MAX,
  isReportReason,
  type ReportReason,
};

/** One report, as the reporter sees it. */
export interface ContentReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  commentId: string | null;
  profileId: string | null;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                   */
/* -------------------------------------------------------------------------- */

export type ReportResult =
  | { ok: true; report: ContentReport }
  | { ok: false; reason: string; message: string };

/**
 * File a report about a comment.
 *
 * The comment is named by its id, and the reporter is the caller.
 */
export async function reportComment(
  commentId: string,
  reason: string,
  details?: string,
): Promise<ReportResult> {
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
      message: "You need to be signed in to report.",
    };
  }

  if (!isReportReason(reason)) {
    return {
      ok: false,
      reason: "invalid",
      message: "That isn't a reason we can file a report for.",
    };
  }

  const trimmedDetails =
    typeof details === "string" ? details.trim().slice(0, REPORT_DETAILS_MAX) : null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Accounts aren't set up on this build.",
    };
  }

  /*
   * The comment must be READABLE by the reporter, which the RLS policy
   * enforces: a comment on a private profile is invisible to a non-follower,
   * so it cannot be reported by one. A comment that does not exist, or that
   * the reporter may not read, resolves to `null` here.
   */
  const { data: comment } = await supabase
    .from("profile_comments")
    .select("id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) {
    return {
      ok: false,
      reason: "not-found",
      message: "That comment could not be found.",
    };
  }

  const { data, error } = await supabase
    .from("content_reports")
    .insert({
      reporter_id: userId,
      comment_id: commentId,
      reason,
      details: trimmedDetails && trimmedDetails.length > 0 ? trimmedDetails : null,
    })
    .select("id, reason, details, status, comment_id, profile_id, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        reason: "not-found",
        message: "That comment could not be found.",
      };
    }
    if (error.code === "23514") {
      return {
        ok: false,
        reason: "invalid",
        message: "That report is not valid.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "The report could not be filed.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "error",
      message: "The report could not be filed.",
    };
  }

  const row = data as {
    id: string;
    reason: string;
    details: string | null;
    status: string;
    comment_id: string | null;
    profile_id: string | null;
    created_at: string;
  };

  return {
    ok: true,
    report: {
      id: row.id,
      reason: row.reason as ReportReason,
      details: row.details,
      status: row.status as ContentReport["status"],
      commentId: row.comment_id,
      profileId: row.profile_id,
      createdAt: row.created_at,
    },
  };
}

/**
 * File a report about a profile.
 *
 * The profile is named by its USERNAME, and the reporter is the caller.
 * Nobody may report their own profile.
 */
export async function reportProfile(
  username: string,
  reason: string,
  details?: string,
): Promise<ReportResult> {
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
      message: "You need to be signed in to report.",
    };
  }

  if (!isReportReason(reason)) {
    return {
      ok: false,
      reason: "invalid",
      message: "That isn't a reason we can file a report for.",
    };
  }

  const trimmedDetails =
    typeof details === "string" ? details.trim().slice(0, REPORT_DETAILS_MAX) : null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return {
      ok: false,
      reason: "not-configured",
      message: "Accounts aren't set up on this build.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      reason: "not-found",
      message: "That profile could not be found.",
    };
  }

  if (profile.user_id === userId) {
    return {
      ok: false,
      reason: "self",
      message: "You cannot report your own profile.",
    };
  }

  const { data, error } = await supabase
    .from("content_reports")
    .insert({
      reporter_id: userId,
      profile_id: profile.user_id,
      reason,
      details: trimmedDetails && trimmedDetails.length > 0 ? trimmedDetails : null,
    })
    .select("id, reason, details, status, comment_id, profile_id, created_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        reason: "not-found",
        message: "That profile could not be found.",
      };
    }
    if (error.code === "23514") {
      return {
        ok: false,
        reason: "invalid",
        message: "That report is not valid.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "The report could not be filed.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "error",
      message: "The report could not be filed.",
    };
  }

  const row = data as {
    id: string;
    reason: string;
    details: string | null;
    status: string;
    comment_id: string | null;
    profile_id: string | null;
    created_at: string;
  };

  return {
    ok: true,
    report: {
      id: row.id,
      reason: row.reason as ReportReason,
      details: row.details,
      status: row.status as ContentReport["status"],
      commentId: row.comment_id,
      profileId: row.profile_id,
      createdAt: row.created_at,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

/**
 * The reports the CALLER has filed.
 *
 * Only the reporter's own reports come back. There is no moderation reader
 * in this phase.
 */
export async function listOwnReports(): Promise<ContentReport[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("content_reports")
    .select("id, reason, details, status, comment_id, profile_id, created_at")
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return (data as Array<{
    id: string;
    reason: string;
    details: string | null;
    status: string;
    comment_id: string | null;
    profile_id: string | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    reason: row.reason as ReportReason,
    details: row.details,
    status: row.status as ContentReport["status"],
    commentId: row.comment_id,
    profileId: row.profile_id,
    createdAt: row.created_at,
  }));
}

export type { SupabaseClient };
