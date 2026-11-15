/**
 * Phase 10 — moderation.
 *
 * The server-side half of the moderation system: who is a moderator, what the
 * queue looks like, and how a moderator acts on a report.
 *
 * THE RULES, IN ORDER OF IMPORTANCE
 *
 *  1. **Authorization comes from the database.** `is_moderator()` is a
 *     SECURITY DEFINER function that reads the `moderators` table. Nothing in
 *     this file trusts a role value from the request body, from the JWT, or
 *     from a hidden UI element.
 *
 *  2. **Identity comes from the session.** The moderator is always the caller,
 *     and every moderation function is called with the caller's own session —
 *     so `auth.uid()` inside the database resolves to the moderator, and a
 *     caller cannot substitute somebody else's identity.
 *
 *  3. **There is no service-role key in the application.** The moderation
 *     tables grant the client SELECT and nothing else; the writes go through
 *     SECURITY DEFINER functions that check the roster. A bypass of RLS is
 *     exactly what a moderation system should not have in its ordinary path.
 *
 *  4. **A report never announces itself.** The reported account still cannot
 *     read the report against it, and the reporter's identity is not disclosed
 *     to anybody but the moderator queue.
 *
 *  5. **Every consequential action needs a reason.** The database enforces
 *     this with a CHECK constraint, so a dismissal without a reason cannot be
 *     written at all.
 *
 *  6. **Nothing is deleted.** A removed comment is replaced with a marker; a
 *     restricted account keeps its profile and its followers.
 */

import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import {
  REPORT_REASONS,
  isReportReason,
  type ReportReason,
} from "./socialConstants";

/* -------------------------------------------------------------------------- */
/*                                   Types                                     */
/* -------------------------------------------------------------------------- */

/**
 * A report's state, as the database stores it.
 *
 * The four values are Phase 8's, and the dashboard's four tabs map onto them:
 *
 *   open      -> pending
 *   reviewed  -> under review
 *   actioned  -> resolved
 *   dismissed -> dismissed
 */
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

/** The statuses the dashboard treats as still-live. */
export const LIVE_REPORT_STATUSES: ReportStatus[] = ["open", "reviewed"];

/** One moderation action, as the dashboard renders it. */
export interface ModerationAction {
  id: string;
  reportId: string;
  moderatorId: string;
  moderatorUsername: string | null;
  action: string;
  targetUserId: string | null;
  targetCommentId: string | null;
  reason: string | null;
  statusAfter: string | null;
  createdAt: string;
}

/** One audit record, as the dashboard renders it. */
export interface AuditRecord {
  id: string;
  moderatorId: string;
  moderatorUsername: string | null;
  action: string;
  reportId: string | null;
  targetUserId: string | null;
  targetCommentId: string | null;
  note: string | null;
  createdAt: string;
}

/** A report, as the moderation queue renders it. */
export interface ModerationReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  commentId: string | null;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedTo: string | null;
  assignedToUsername: string | null;
  moderatorNote: string | null;
  /** The reported profile's handle, when the report is about a profile. */
  subjectUsername: string | null;
  /** The reported profile's display name, when it could be read. */
  subjectDisplayName: string | null;
  /** The reported comment's body, when the report is about a comment. */
  subjectCommentBody: string | null;
  /** The reported comment's author handle. */
  subjectCommentAuthorUsername: string | null;
  /** The reported comment's profile handle. */
  subjectCommentProfileUsername: string | null;
}

/** A live restriction, as the dashboard renders it. */
export interface AccountRestriction {
  id: string;
  userId: string;
  username: string | null;
  reportId: string | null;
  scope: string;
  reason: string;
  appliedBy: string | null;
  appliedAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
}

/** The dashboard's filters. */
export interface ModerationFilters {
  /** The statuses to include. Empty means every status. */
  status?: ReportStatus[];
  /** The report reasons to include. Empty means every reason. */
  reason?: ReportReason[];
  /** A report id, or a username, to search for. */
  search?: string;
  /** The page size. */
  limit?: number;
  /** How many rows to skip. */
  offset?: number;
}

/** A page of the queue, plus the counts the dashboard's header shows. */
export interface ModerationQueuePage {
  reports: ModerationReport[];
  /** How many reports match the filters in total. */
  total: number;
  /** The counts per status, across the whole queue. */
  counts: Record<ReportStatus, number>;
  /** The offset for the next page, or `null` when the list is exhausted. */
  nextOffset: number | null;
}

/** The result of a moderation action. */
export interface ModerationActionResult {
  ok: boolean;
  reason?: string;
  message?: string;
}

/* -------------------------------------------------------------------------- */
/*                                Authorization                                 */
/* -------------------------------------------------------------------------- */

/**
 * Is the CALLER a moderator?
 *
 * The answer comes from the database's `is_moderator()`, which reads the
 * `moderators` table with the definer's rights. A caller cannot influence
 * it: there is no parameter, and the roster has no client-writable path.
 *
 * The check runs with the caller's own session, so the JWT's `sub` is what the
 * roster is compared against — and that JWT is verified by the Supabase
 * client before the query is sent.
 */
export async function isCallerModerator(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("is_moderator");
  if (error || typeof data !== "boolean") return false;

  return data;
}

/**
 * The caller's moderator id, or `null`.
 *
 * The roster's primary key IS the account id, so the moderator's identity is
 * the account id — there is no separate moderator id to keep in step.
 */
export async function getModeratorId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("moderators")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return (data as { user_id: string }).user_id;
}

/* -------------------------------------------------------------------------- */
/*                              The moderator reads                            */
/* -------------------------------------------------------------------------- */

/**
 * A profile, as the moderator's read path returns it.
 */
interface ProfileSummary {
  userId: string;
  username: string;
  displayName: string | null;
}

/**
 * A comment, as the moderator's read path returns it.
 */
interface CommentSummary {
  id: string;
  body: string;
  authorUsername: string | null;
  profileUsername: string | null;
}

/**
 * Read a set of profiles, through the moderator's own read path.
 *
 * The ordinary `profiles` SELECT policy hides a private profile from
 * everybody who is not its owner or its accepted followers — so a moderator
 * could not inspect a report about a private profile at all. The
 * `moderation_profile_summaries` function sees the rows the policy hides,
 * and it checks the roster before returning anything.
 */
async function fetchProfileSummaries(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userIds: string[],
): Promise<Map<string, ProfileSummary>> {
  const map = new Map<string, ProfileSummary>();
  if (!supabase || userIds.length === 0) return map;

  const { data, error } = await supabase.rpc("moderation_profile_summaries", {
    account_ids: userIds,
  });

  if (error || !Array.isArray(data)) return map;

  for (const entry of data as ProfileSummary[]) {
    if (!entry || typeof entry.userId !== "string") continue;
    map.set(entry.userId, {
      userId: entry.userId,
      username: typeof entry.username === "string" ? entry.username : "",
      displayName:
        typeof entry.displayName === "string" && entry.displayName.length > 0
          ? entry.displayName
          : null,
    });
  }

  return map;
}

/**
 * Read a set of comments, through the moderator's own read path.
 */
async function fetchCommentSummaries(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  commentIds: string[],
): Promise<Map<string, CommentSummary>> {
  const map = new Map<string, CommentSummary>();
  if (!supabase || commentIds.length === 0) return map;

  const { data, error } = await supabase.rpc("moderation_comment_summaries", {
    comment_ids: commentIds,
  });

  if (error || !Array.isArray(data)) return map;

  for (const entry of data as CommentSummary[]) {
    if (!entry || typeof entry.id !== "string") continue;
    map.set(entry.id, {
      id: entry.id,
      body: typeof entry.body === "string" ? entry.body : "",
      authorUsername:
        typeof entry.authorUsername === "string" ? entry.authorUsername : null,
      profileUsername:
        typeof entry.profileUsername === "string" ? entry.profileUsername : null,
    });
  }

  return map;
}

/**
 * Resolve a username to an account id, through the moderator's read path.
 *
 * The search box takes a report id or a username. A username has to become an
 * account id before the report query can filter on it, and a private profile
 * is invisible to the ordinary read path — so the resolution is done by a
 * function that checks the roster.
 */
export async function resolveUsername(
  handle: string,
): Promise<string | null> {
  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("moderation_resolve_username", {
    handle: handle.trim(),
  });

  if (error || typeof data !== "string") return null;
  return data;
}

/* -------------------------------------------------------------------------- */
/*                                   Reads                                     */
/* -------------------------------------------------------------------------- */

/**
 * The counts, per status, across the whole queue.
 *
 * Counted separately from the page, because the counts must not depend on
 * which page the moderator is looking at, and because the dashboard's header
 * shows them above the list.
 */
export async function countReportsByStatus(): Promise<
  Record<ReportStatus, number>
> {
  const empty: Record<ReportStatus, number> = {
    open: 0,
    reviewed: 0,
    actioned: 0,
    dismissed: 0,
  };

  if (!isSupabaseConfigured()) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from("content_reports")
    .select("status");

  if (error || !data) return empty;

  for (const row of data as Array<{ status: string }>) {
    if (row.status in empty) {
      empty[row.status as ReportStatus] += 1;
    }
  }

  return empty;
}

/** The raw row shape, as PostgREST returns it. */
interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  comment_id: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  moderator_note: string | null;
}

/**
 * A page of the moderation queue.
 *
 * The filters are applied by the DATABASE, not by fetching everything and
 * filtering in JavaScript — so the pagination is honest, and the counts
 * describe the same set the list shows.
 */
export async function listModerationReports(
  filters: ModerationFilters = {},
): Promise<ModerationQueuePage> {
  const empty: ModerationQueuePage = {
    reports: [],
    total: 0,
    counts: { open: 0, reviewed: 0, actioned: 0, dismissed: 0 },
    nextOffset: null,
  };

  if (!isSupabaseConfigured()) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const statuses = (filters.status ?? []).filter(
    (status): status is ReportStatus =>
      status === "open" ||
      status === "reviewed" ||
      status === "actioned" ||
      status === "dismissed",
  );

  const reasons = (filters.reason ?? []).filter((reason): reason is ReportReason =>
    isReportReason(reason),
  );

  let query = supabase
    .from("content_reports")
    .select(
      `id, reason, details, status, comment_id, profile_id, created_at,
       updated_at, resolved_at, assigned_to, moderator_note`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (statuses.length > 0) query = query.in("status", statuses);
  if (reasons.length > 0) query = query.in("reason", reasons);

  const search = (filters.search ?? "").trim();
  if (search) {
    /*
     * The search is a report id or a username.
     *
     * A uuid is matched on the id exactly. Anything else is a username, and
     * it is resolved to an account id FIRST — by the moderator's read path,
     * because a private profile is invisible to the ordinary one — and the
     * query then filters on that id.
     *
     * The username is matched EXACTLY rather than as a substring. A substring
     * match would need a table scan of the profiles table for every keystroke
     * of the search box, and the exact match is the more honest reading of
     * "search by username" anyway.
     */
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (uuidPattern.test(search)) {
      query = query.eq("id", search);
    } else {
      const accountId = await resolveUsername(search);

      if (!accountId) {
        return { ...empty, counts: await countReportsByStatus() };
      }

      query = query.or(
        `profile_id.eq.${accountId},assigned_to.eq.${accountId}`,
      );
    }
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error || !data) {
    return { ...empty, counts: await countReportsByStatus() };
  }

  const reports = await decorateReports(supabase, data as ReportRow[]);

  return {
    reports,
    total: count ?? reports.length,
    counts: await countReportsByStatus(),
    nextOffset: reports.length === limit ? offset + limit : null,
  };
}

/**
 * Fill in the SUBJECT of each report: the profile it is about, or the comment
 * it is about.
 *
 * The reporter's identity is deliberately NOT fetched here. The dashboard
 * shows that a report exists and what it is about; it does not need to name
 * the person who filed it, and the fewer copies of that identity exist, the
 * fewer places it can leak from.
 */
async function decorateReports(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  rows: ReportRow[],
): Promise<ModerationReport[]> {
  if (rows.length === 0) return [];

  const profileIds = new Set<string>();
  const commentIds = new Set<string>();
  const assignedIds = new Set<string>();

  for (const row of rows) {
    if (row.profile_id) profileIds.add(row.profile_id);
    if (row.comment_id) commentIds.add(row.comment_id);
    if (row.assigned_to) assignedIds.add(row.assigned_to);
  }

  const profileMap = await fetchProfileSummaries(supabase, [...profileIds]);
  const commentMap = await fetchCommentSummaries(supabase, [...commentIds]);
  const assignedMap = await fetchProfileSummaries(supabase, [...assignedIds]);

  return rows.map((row) => {
    const profile = row.profile_id ? profileMap.get(row.profile_id) : undefined;
    const comment = row.comment_id ? commentMap.get(row.comment_id) : undefined;
    const assignee = row.assigned_to
      ? assignedMap.get(row.assigned_to)
      : undefined;

    return {
      id: row.id,
      reason: row.reason as ReportReason,
      details: row.details,
      status: row.status as ReportStatus,
      commentId: row.comment_id,
      profileId: row.profile_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      assignedTo: row.assigned_to,
      assignedToUsername: assignee?.username ?? null,
      moderatorNote: row.moderator_note,
      subjectUsername: profile?.username ?? null,
      subjectDisplayName: profile?.displayName ?? null,
      subjectCommentBody: comment?.body ?? null,
      subjectCommentAuthorUsername: comment?.authorUsername ?? null,
      subjectCommentProfileUsername: comment?.profileUsername ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                             The report's history                            */
/* -------------------------------------------------------------------------- */

/**
 * The moderation history of one report.
 *
 * The actions and the audit records are two views of the same history: the
 * actions belong to the report, the audit records are the durable trail.
 */
export async function listReportHistory(
  reportId: string,
): Promise<{ actions: ModerationAction[]; audit: AuditRecord[] }> {
  const empty = { actions: [], audit: [] };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const [actionsResult, auditResult] = await Promise.all([
    supabase
      .from("moderation_actions")
      .select(
        "id, report_id, moderator_id, action, target_user_id, target_comment_id, reason, status_after, created_at",
      )
      .eq("report_id", reportId)
      .order("created_at", { ascending: false }),
    supabase
      .from("moderation_audit_log")
      .select(
        "id, moderator_id, action, report_id, target_user_id, target_comment_id, note, created_at",
      )
      .eq("report_id", reportId)
      .order("created_at", { ascending: false }),
  ]);

  const actionRows = (actionsResult.data ?? []) as Array<{
    id: string;
    report_id: string;
    moderator_id: string;
    action: string;
    target_user_id: string | null;
    target_comment_id: string | null;
    reason: string | null;
    status_after: string | null;
    created_at: string;
  }>;

  const auditRows = (auditResult.data ?? []) as Array<{
    id: string;
    moderator_id: string;
    action: string;
    report_id: string | null;
    target_user_id: string | null;
    target_comment_id: string | null;
    note: string | null;
    created_at: string;
  }>;

  const moderatorMap = await fetchProfileSummaries(
    supabase,
    [...new Set([...actionRows, ...auditRows].map((row) => row.moderator_id))],
  );

  return {
    actions: actionRows.map((row) => ({
      id: row.id,
      reportId: row.report_id,
      moderatorId: row.moderator_id,
      moderatorUsername: moderatorMap.get(row.moderator_id)?.username ?? null,
      action: row.action,
      targetUserId: row.target_user_id,
      targetCommentId: row.target_comment_id,
      reason: row.reason,
      statusAfter: row.status_after,
      createdAt: row.created_at,
    })),
    audit: auditRows.map((row) => ({
      id: row.id,
      moderatorId: row.moderator_id,
      moderatorUsername: moderatorMap.get(row.moderator_id)?.username ?? null,
      action: row.action,
      reportId: row.report_id,
      targetUserId: row.target_user_id,
      targetCommentId: row.target_comment_id,
      note: row.note,
      createdAt: row.created_at,
    })),
  };
}

/**
 * The audit trail, newest first.
 *
 * Paged, because the trail is the one table that grows forever.
 */
export async function listAuditTrail(
  options: { limit?: number; offset?: number } = {},
): Promise<{ records: AuditRecord[]; total: number }> {
  if (!isSupabaseConfigured()) return { records: [], total: 0 };

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return { records: [], total: 0 };

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const { data, error, count } = await supabase
    .from("moderation_audit_log")
    .select(
      "id, moderator_id, action, report_id, target_user_id, target_comment_id, note, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return { records: [], total: 0 };

  const rows = data as Array<{
    id: string;
    moderator_id: string;
    action: string;
    report_id: string | null;
    target_user_id: string | null;
    target_comment_id: string | null;
    note: string | null;
    created_at: string;
  }>;

  const moderatorMap = await fetchProfileSummaries(
    supabase,
    [...new Set(rows.map((row) => row.moderator_id))],
  );

  return {
    records: rows.map((row) => ({
      id: row.id,
      moderatorId: row.moderator_id,
      moderatorUsername: moderatorMap.get(row.moderator_id)?.username ?? null,
      action: row.action,
      reportId: row.report_id,
      targetUserId: row.target_user_id,
      targetCommentId: row.target_comment_id,
      note: row.note,
      createdAt: row.created_at,
    })),
    total: count ?? rows.length,
  };
}

/**
 * The restrictions currently in force.
 */
export async function listLiveRestrictions(): Promise<AccountRestriction[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("account_restrictions")
    .select(
      "id, user_id, report_id, scope, reason, applied_by, applied_at, expires_at, lifted_at",
    )
    .is("lifted_at", null)
    .order("applied_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    user_id: string;
    report_id: string | null;
    scope: string;
    reason: string;
    applied_by: string;
    applied_at: string;
    expires_at: string | null;
    lifted_at: string | null;
  }>;

  const profileMap = await fetchProfileSummaries(
    supabase,
    [...new Set(rows.map((row) => row.user_id))],
  );
  const moderatorMap = await fetchProfileSummaries(
    supabase,
    [...new Set(rows.map((row) => row.applied_by))],
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: profileMap.get(row.user_id)?.username ?? null,
    reportId: row.report_id,
    scope: row.scope,
    reason: row.reason,
    appliedBy: moderatorMap.get(row.applied_by)?.username ?? null,
    appliedAt: row.applied_at,
    expiresAt: row.expires_at,
    liftedAt: row.lifted_at,
  }));
}

/**
 * The moderator roster.
 */
export async function listModerators(): Promise<
  Array<{
    userId: string;
    username: string | null;
    grantedAt: string;
    note: string | null;
  }>
> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("moderators")
    .select("user_id, granted_at, note")
    .order("granted_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as Array<{
    user_id: string;
    granted_at: string;
    note: string | null;
  }>;

  const profileMap = await fetchProfileSummaries(
    supabase,
    rows.map((row) => row.user_id),
  );

  return rows.map((row) => ({
    userId: row.user_id,
    username: profileMap.get(row.user_id)?.username ?? null,
    grantedAt: row.granted_at,
    note: row.note,
  }));
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                    */
/* -------------------------------------------------------------------------- */

/**
 * Call one of the moderation functions.
 *
 * Every moderation function is SECURITY DEFINER and checks the roster itself,
 * so the authorization does not depend on this module having got it right.
 * This module's own check is the FIRST gate, and the database's is the second.
 *
 * The call is made with the MODERATOR'S OWN session — the same session every
 * other part of the application uses — so `auth.uid()` inside the function
 * resolves to the moderator. That is what makes the roster check meaningful,
 * and it is why no service-role key is involved anywhere in this file.
 */
async function callModerationFunction(
  name: string,
  args: Record<string, unknown>,
): Promise<ModerationActionResult> {
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

  const moderator = await isCallerModerator();
  if (!moderator) {
    return {
      ok: false,
      reason: "not-allowed",
      message: "You are not a moderator.",
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

  const { error } = await supabase.rpc(name, args);

  if (!error) return { ok: true };

  const message = error.message ?? "";

  /*
   * The database's own refusal is the authority. The functions raise a
   * message for each refusal, and the message is turned back into a sentence
   * the interface can show.
   */
  if (/not a moderator/i.test(message)) {
    return {
      ok: false,
      reason: "not-allowed",
      message: "You are not a moderator.",
    };
  }

  if (/could not be found/i.test(message)) {
    return {
      ok: false,
      reason: "not-found",
      message: "That could not be found.",
    };
  }

  if (/is not open/i.test(message) || /under review/i.test(message)) {
    return {
      ok: false,
      reason: "invalid",
      message: "That report has already moved on.",
    };
  }

  if (/needs a reason/i.test(message)) {
    return {
      ok: false,
      reason: "invalid",
      message: "A reason is required.",
    };
  }

  return {
    ok: false,
    reason: "error",
    message: error.message ?? "That moderation action could not be completed.",
  };
}

/** Take ownership of a report. */
export async function claimReport(
  reportId: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_claim_report", {
    report_uuid: reportId,
  });
}

/** Move a report under review. */
export async function startReview(
  reportId: string,
  note?: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_start_review", {
    report_uuid: reportId,
    note_text: note?.trim() || null,
  });
}

/** Dismiss a report. */
export async function dismissReport(
  reportId: string,
  reason: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_dismiss_report", {
    report_uuid: reportId,
    reason_text: reason.trim(),
  });
}

/** Resolve a report. */
export async function resolveReport(
  reportId: string,
  reason: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_resolve_report", {
    report_uuid: reportId,
    reason_text: reason.trim(),
  });
}

/** Remove a comment. */
export async function removeComment(
  commentId: string,
  reason: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_remove_comment", {
    comment_uuid: commentId,
    reason_text: reason.trim(),
  });
}

/** Restore a removed comment. */
export async function restoreComment(
  commentId: string,
  reason: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_restore_comment", {
    comment_uuid: commentId,
    reason_text: reason.trim(),
  });
}

/** Restrict an account. */
export async function restrictAccount(
  username: string,
  reason: string,
  days?: number,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_restrict_account", {
    handle: username.trim().toLowerCase(),
    reason_text: reason.trim(),
    scope_name: "posting",
    days: days ?? null,
  });
}

/** Lift a restriction. */
export async function liftRestriction(
  restrictionId: string,
  reason: string,
): Promise<ModerationActionResult> {
  return callModerationFunction("moderation_lift_restriction", {
    restriction_uuid: restrictionId,
    reason_text: reason.trim(),
  });
}

export { REPORT_REASONS, isReportReason, type ReportReason };
