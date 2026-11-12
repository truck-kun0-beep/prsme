import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import { blockAccount, unblockAccount } from "@/lib/supabase/social";

/**
 * Blocks.
 *
 *   POST   /api/blocks?username=…  block the account
 *   DELETE /api/blocks?username=…  unblock the account
 *
 * A block is ONE-DIRECTIONAL and it never announces itself: the blocked
 * account cannot see that it has been blocked, and the application never
 * shows it a "you are blocked" notice.
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity comes from the session.** The blocker is always the caller.
 *   - **The target is a USERNAME**, resolved against the profiles table.
 *   - **The database does the real work.** The RLS policy refuses a block
 *     that names somebody else as the blocker, and `is_blocked_between` is
 *     what actually stops a blocked account from following or commenting.
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
 * POST /api/blocks?username=…
 *
 * Block the account. Any follow edge between the pair is removed.
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

  const result = await blockAccount(username);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * DELETE /api/blocks?username=…
 *
 * Unblock the account.
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

  const result = await unblockAccount(username);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
