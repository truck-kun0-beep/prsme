import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  reportComment,
  reportProfile,
  listOwnReports,
} from "@/lib/supabase/reports";

/**
 * Reports.
 *
 *   GET  /api/reports          the caller's own reports
 *   POST /api/reports          file a report
 *
 * A report is stored for a future moderation queue. Nothing is done with it
 * automatically, and the account that was reported never learns that it was
 * reported.
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity comes from the session.** The reporter is always the caller.
 *   - **The subject is named by a comment id or a username**, never by a
 *     user id from the body.
 *   - **The reason is a closed set**, enforced by the database's CHECK
 *     constraint and validated here.
 */

export const dynamic = "force-dynamic";

/** The status code a failure maps to. */
function statusFor(reason: string): number {
  switch (reason) {
    case "not-authenticated":
      return 401;
    case "not-found":
      return 404;
    case "self":
    case "not-allowed":
      return 403;
    case "invalid":
      return 400;
    case "not-configured":
      return 503;
    default:
      return 500;
  }
}

/**
 * GET /api/reports
 *
 * The reports the caller has filed.
 */
export async function GET() {
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

  const reports = await listOwnReports();
  return NextResponse.json(
    {
      ok: true,
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        commentId: report.commentId,
        profileId: report.profileId,
        createdAt: report.createdAt,
      })),
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * POST /api/reports
 *
 * File a report about a comment or a profile.
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
      { ok: false, error: "You need to be signed in to report." },
      { status: 401 },
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

  const reason = typeof body.reason === "string" ? body.reason : "";
  const details = typeof body.details === "string" ? body.details : undefined;
  const commentId =
    typeof body.commentId === "string" ? body.commentId.trim() : "";
  const username =
    typeof body.username === "string" ? body.username.trim() : "";

  if (!commentId && !username) {
    return NextResponse.json(
      {
        ok: false,
        error: "A report needs a comment or a profile.",
        reason: "invalid",
      },
      { status: 400 },
    );
  }

  const result = commentId
    ? await reportComment(commentId, reason, details)
    : await reportProfile(username, reason, details);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      report: {
        id: result.report.id,
        reason: result.report.reason,
        status: result.report.status,
        createdAt: result.report.createdAt,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
