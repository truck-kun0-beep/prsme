import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  followAccount,
  unfollowAccount,
  getProfileSocialState,
} from "@/lib/supabase/social";

/**
 * The social actions on one account.
 *
 * One route, several actions, because they all address the same relationship
 * and they all take the same subject — the account named by `username`.
 *
 *   GET    /api/social?username=…  the counts and the caller's relationship
 *   POST   /api/social?username=…  follow (or request to follow)
 *   DELETE /api/social?username=…  unfollow (or withdraw a request)
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity is never accepted from the body.** There is no `followerId`
 *     or `userId` field to spoof. The follower is the verified session; the
 *     followed account is a USERNAME, resolved against the profiles table.
 *   - **The body is not trusted for the subject either.** The subject comes
 *     from the query string, and the action comes from the HTTP method, so a
 *     crafted body cannot turn a follow into an unfollow.
 *   - **`no-store` on every response.** A cached 200 would show a stale
 *     button state and a stale count.
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
 * GET /api/social?username=…
 *
 * The follower count, the following count, and the caller's relationship with
 * the account. An anonymous caller gets the counts and no relationship — the
 * same thing they would see rendered on the page.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured.", setup: supabaseSetupMessage() },
      { status: 503 },
    );
  }

  const username = request.nextUrl.searchParams.get("username")?.trim() ?? "";
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "A username is required." },
      { status: 400 },
    );
  }

  const state = await getProfileSocialState(username);
  if (!state) {
    return NextResponse.json(
      { ok: false, error: "That profile could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      social: {
        followerCount: state.followerCount,
        followingCount: state.followingCount,
        state: state.state,
        blocked: state.blocked,
        isSelf: state.isSelf,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * POST /api/social?username=…
 *
 * Follow the account. A public account accepts immediately; a private account
 * records a request for the owner to answer.
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
      { ok: false, error: "You need to be signed in to follow." },
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

  const result = await followAccount(username);
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
 * DELETE /api/social?username=…
 *
 * Unfollow the account, or withdraw a pending request. One operation, because
 * it is one relationship.
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

  const result = await unfollowAccount(username);
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
