import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  claimReport,
  dismissReport,
  isCallerModerator,
  liftRestriction,
  listModerationReports,
  removeComment,
  resolveReport,
  restrictAccount,
  restoreComment,
  startReview,
  type ReportStatus,
} from "@/lib/supabase/moderation";
import { isReportReason, type ReportReason } from "@/lib/supabase/socialConstants";

/**
 * Moderation.
 *
 *   GET  /api/moderation?status=…&reason=…&search=…&offset=…
 *          the moderation queue
 *   POST /api/moderation
 *          { action, reportId, reason, … } — perform one moderation action
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Every request is refused unless the caller is a moderator.** The check
 *     is `is_moderator()`, which reads the `moderators` table in the database.
 *     It is not a flag in the request, not a claim in the JWT, and not a
 *     hidden UI element.
 *
 *   - **Identity comes from the session.** The moderator is always the caller,
 *     and the moderation functions are called with the caller's own session,
 *     so `auth.uid()` inside the database resolves to the moderator.
 *
 *   - **The database checks the roster again.** Each moderation function is
 *     SECURITY DEFINER and re-checks `is_moderator()` itself. This route's
 *     check is the first gate; the database's is the second. A caller who
 *     reached the route some other way still gets a refusal from the
 *     database.
 *
 *   - **Every consequential action needs a reason**, and the database
 *     enforces that with a CHECK constraint rather than trusting the route.
 *
 *   - **Nothing is deleted.** No account is deleted, ever, by any action here.
 */

export const dynamic = "force-dynamic";

/** The status code a failure maps to. */
function statusFor(reason: string | undefined): number {
  switch (reason) {
    case "not-authenticated":
      return 401;
    case "not-allowed":
      return 403;
    case "not-found":
      return 404;
    case "invalid":
      return 400;
    case "not-configured":
      return 503;
    default:
      return 500;
  }
}

/** The actions this route will perform. */
const ACTIONS = [
  "claim",
  "under_review",
  "dismiss",
  "resolve",
  "remove_comment",
  "restore_comment",
  "restrict",
  "lift_restriction",
] as const;

type ModerationActionName = (typeof ACTIONS)[number];

/**
 * GET /api/moderation
 *
 * The moderation queue.
 *
 * The filters are applied by the database, so the pagination and the counts
 * describe the same set the list shows.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured.", setup: supabaseSetupMessage() },
      { status: 503 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "You need to be signed in." },
      { status: 401 },
    );
  }

  const moderator = await isCallerModerator();
  if (!moderator) {
    return NextResponse.json(
      { ok: false, error: "You are not a moderator." },
      { status: 403 },
    );
  }

  const params = request.nextUrl.searchParams;

  const statuses = params
    .getAll("status")
    .filter((value): value is ReportStatus =>
      value === "open" ||
      value === "reviewed" ||
      value === "actioned" ||
      value === "dismissed",
    );

  const reasons = params
    .getAll("reason")
    .filter((value): value is ReportReason => isReportReason(value));

  const search = params.get("search")?.trim() ?? "";

  const rawOffset = Number(params.get("offset") ?? "0");
  const offset = Number.isFinite(rawOffset)
    ? Math.max(Math.floor(rawOffset), 0)
    : 0;

  const rawLimit = Number(params.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 100)
    : 20;

  const page = await listModerationReports({ status: statuses, reason: reasons, search, offset, limit });

  return NextResponse.json(
    {
      ok: true,
      reports: page.reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        commentId: report.commentId,
        profileId: report.profileId,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        resolvedAt: report.resolvedAt,
        assignedTo: report.assignedTo,
        assignedToUsername: report.assignedToUsername,
        moderatorNote: report.moderatorNote,
        subjectUsername: report.subjectUsername,
        subjectDisplayName: report.subjectDisplayName,
        subjectCommentBody: report.subjectCommentBody,
        subjectCommentAuthorUsername: report.subjectCommentAuthorUsername,
        subjectCommentProfileUsername: report.subjectCommentProfileUsername,
      })),
      total: page.total,
      counts: page.counts,
      nextOffset: page.nextOffset,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * POST /api/moderation
 *
 * Perform ONE moderation action.
 *
 * The action is named in the body, and every action names its own subject:
 * a report id for the report actions, a comment id for the comment actions,
 * a username for a restriction, a restriction id for lifting one.
 *
 * The reason is REQUIRED for every consequential action, and the database
 * refuses the write without one.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured.", setup: supabaseSetupMessage() },
      { status: 503 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "You need to be signed in." },
      { status: 401 },
    );
  }

  const moderator = await isCallerModerator();
  if (!moderator) {
    return NextResponse.json(
      { ok: false, error: "You are not a moderator." },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request body." },
      { status: 400 },
    );
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  const action = typeof body.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json(
      { ok: false, error: "That is not a moderation action.", reason: "invalid" },
      { status: 400 },
    );
  }

  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const restrictionId =
    typeof body.restrictionId === "string" ? body.restrictionId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const rawDays = body.days;
  const days =
    typeof rawDays === "number" && Number.isFinite(rawDays)
      ? Math.floor(rawDays)
      : undefined;

  let result;

  switch (action as ModerationActionName) {
    case "claim":
      if (!reportId) {
        return NextResponse.json(
          { ok: false, error: "A report id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await claimReport(reportId);
      break;

    case "under_review":
      if (!reportId) {
        return NextResponse.json(
          { ok: false, error: "A report id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await startReview(reportId, reason);
      break;

    case "dismiss":
      if (!reportId) {
        return NextResponse.json(
          { ok: false, error: "A report id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await dismissReport(reportId, reason);
      break;

    case "resolve":
      if (!reportId) {
        return NextResponse.json(
          { ok: false, error: "A report id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await resolveReport(reportId, reason);
      break;

    case "remove_comment":
      if (!commentId) {
        return NextResponse.json(
          { ok: false, error: "A comment id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await removeComment(commentId, reason);
      break;

    case "restore_comment":
      if (!commentId) {
        return NextResponse.json(
          { ok: false, error: "A comment id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await restoreComment(commentId, reason);
      break;

    case "restrict":
      if (!username) {
        return NextResponse.json(
          { ok: false, error: "A username is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await restrictAccount(username, reason, days);
      break;

    case "lift_restriction":
      if (!restrictionId) {
        return NextResponse.json(
          { ok: false, error: "A restriction id is required.", reason: "invalid" },
          { status: 400 },
        );
      }
      result = await liftRestriction(restrictionId, reason);
      break;

    default:
      return NextResponse.json(
        { ok: false, error: "That is not a moderation action.", reason: "invalid" },
        { status: 400 },
      );
  }

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    { ok: true, action },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
