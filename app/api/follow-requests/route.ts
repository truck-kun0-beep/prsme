import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  acceptRequest,
  declineRequest,
  removeFollower,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/supabase/social";

/**
 * Follow requests.
 *
 *   GET    /api/follow-requests            the caller's incoming requests
 *   GET    /api/follow-requests?scope=out  the caller's outgoing requests
 *   POST   /api/follow-requests?username=… accept a request
 *   DELETE /api/follow-requests?username=… decline a request, or remove a follower
 *
 * THERE IS NO FRIENDS TAB HERE, and there is no friend count anywhere in the
 * application. This is a request queue for one-way follows, and nothing else.
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity comes from the session.** The approver is the caller, always.
 *   - **The request is named by USERNAME.** The requester is resolved against
 *     the profiles table; there is no user id to spoof.
 *   - **The approval is scoped to the caller's own incoming edge.** The write
 *     matches on both ends of the edge, so a caller can only ever resolve a
 *     request addressed to THEM.
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
    case "blocked":
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
 * GET /api/follow-requests
 *
 * The caller's incoming requests by default, or their outgoing ones with
 * `?scope=out`.
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

  const scope = request.nextUrl.searchParams.get("scope")?.trim();

  if (scope === "out") {
    const outgoing = await listOutgoingRequests();
    return NextResponse.json(
      {
        ok: true,
        requests: outgoing.map((entry) => ({
          id: entry.id,
          requestedAt: entry.requestedAt,
          account: entry.following,
        })),
      },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  }

  const incoming = await listIncomingRequests();
  return NextResponse.json(
    {
      ok: true,
      requests: incoming.map((entry) => ({
        id: entry.id,
        requestedAt: entry.requestedAt,
        account: entry.follower,
      })),
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * POST /api/follow-requests?username=…
 *
 * Approve a pending request. The username names the REQUESTER.
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

  const username = request.nextUrl.searchParams.get("username")?.trim() ?? "";
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "A username is required." },
      { status: 400 },
    );
  }

  const result = await acceptRequest(username);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    { ok: true, state: result.state },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * DELETE /api/follow-requests?username=…
 *
 * Decline a pending request, or remove an existing follower.
 *
 * The two are the same operation from the owner's side — they both remove
 * the relationship — but they are kept apart in the library because they
 * differ in what they leave behind: declining keeps a terminal row, and
 * removing a follower deletes it. The route picks the decline when the edge is
 * still pending, and the removal otherwise.
 */
export async function DELETE(request: NextRequest) {
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

  const username = request.nextUrl.searchParams.get("username")?.trim() ?? "";
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "A username is required." },
      { status: 400 },
    );
  }

  const pending = request.nextUrl.searchParams.get("action") === "decline";

  const result = pending
    ? await declineRequest(username)
    : await removeFollower(username);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    { ok: true, state: result.state },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
