import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  countUnreadNotifications,
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/supabase/notifications";

/**
 * Notification actions.
 *
 *   GET    /api/notifications?offset=…            a page of notifications
 *   PATCH  /api/notifications?action=read&id=…      mark one read
 *   PATCH  /api/notifications?action=read-all        mark every one read
 *   PATCH  /api/notifications?action=dismiss&id=…    dismiss one
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity comes from the session.** The actor is the caller, always.
 *   - **The write is scoped to the caller's own rows.** The database's RLS
 *     policy refuses any update to a notification the caller does not own, so
 *     a crafted `id` belonging to another account updates nothing.
 *   - **There is no way to CREATE a notification here.** Notifications are
 *     written by database triggers; the table's INSERT privilege is revoked
 *     from every client role, and there is no insert policy.
 */

export const dynamic = "force-dynamic";

/** The status code a failure maps to. */
function statusFor(reason: string | undefined): number {
  switch (reason) {
    case "not-authenticated":
      return 401;
    case "not-found":
      return 404;
    case "not-configured":
      return 503;
    default:
      return 500;
  }
}

/**
 * GET /api/notifications?count=1
 *
 * The unread count, and nothing else. The navigation badge asks for this and
 * nothing more — a number, not a list.
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

  if (request.nextUrl.searchParams.get("count") === "1") {
    const unreadCount = await countUnreadNotifications();
    return NextResponse.json(
      { ok: true, unreadCount },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  }

  const rawOffset = request.nextUrl.searchParams.get("offset");
  const parsed = Number.parseInt(rawOffset ?? "0", 10);
  const offset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const page = await listNotifications({ offset });

  return NextResponse.json(
    {
      ok: true,
      notifications: page.notifications,
      nextOffset: page.nextOffset,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

export async function PATCH(request: NextRequest) {
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

  const action = request.nextUrl.searchParams.get("action")?.trim() ?? "";
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";

  let result;
  switch (action) {
    case "read":
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "A notification id is required." },
          { status: 400 },
        );
      }
      result = await markNotificationRead(id);
      break;

    case "read-all":
      result = await markAllNotificationsRead();
      break;

    case "dismiss":
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "A notification id is required." },
          { status: 400 },
        );
      }
      result = await dismissNotification(id);
      break;

    default:
      return NextResponse.json(
        { ok: false, error: "That is not a notification action." },
        { status: 400 },
      );
  }

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  /*
   * The new unread count comes back with the acknowledgement.
   *
   * The list in the centre is paged, so it cannot work out the count itself
   * — a list showing twenty of ninety notifications cannot know how many of
   * the ninety are unread. The database can, in one query, and the badge
   * takes the number it is given rather than guessing.
   */
  const unreadCount = await countUnreadNotifications();

  return NextResponse.json(
    { ok: true, unreadCount },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
