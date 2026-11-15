import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  isCallerModerator,
  listReportHistory,
  listLiveRestrictions,
} from "@/lib/supabase/moderation";

/**
 * The moderation history of one report.
 *
 *   GET /api/moderation/report?id=…
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Refused unless the caller is a moderator.** The check is
 *     `is_moderator()`, which reads the database's roster.
 *
 *   - **The reporter's identity is NOT returned.** The brief asks for the
 *     reporter's identity to be protected from unauthorized users and to be
 *     avoided "even within the moderator UI". The history says what was done
 *     and by which moderator; it does not say who filed the report. There is
 *     no field for it, so it cannot be leaked by a mistake in the interface.
 *
 *   - **Internal notes are moderator-only.** The whole route is behind the
 *     moderator check, and the reported account can never reach it.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "A report id is required.", reason: "invalid" },
      { status: 400 },
    );
  }

  const [history, restrictions] = await Promise.all([
    listReportHistory(id),
    listLiveRestrictions(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      actions: history.actions.map((entry) => ({
        id: entry.id,
        moderatorId: entry.moderatorId,
        moderatorUsername: entry.moderatorUsername,
        action: entry.action,
        targetUserId: entry.targetUserId,
        targetCommentId: entry.targetCommentId,
        reason: entry.reason,
        statusAfter: entry.statusAfter,
        createdAt: entry.createdAt,
      })),
      audit: history.audit.map((entry) => ({
        id: entry.id,
        moderatorId: entry.moderatorId,
        moderatorUsername: entry.moderatorUsername,
        action: entry.action,
        targetUserId: entry.targetUserId,
        targetCommentId: entry.targetCommentId,
        note: entry.note,
        createdAt: entry.createdAt,
      })),
      restrictions: restrictions.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        username: entry.username,
        reportId: entry.reportId,
        scope: entry.scope,
        reason: entry.reason,
        appliedBy: entry.appliedBy,
        appliedAt: entry.appliedAt,
        expiresAt: entry.expiresAt,
      })),
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
