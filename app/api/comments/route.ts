import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  listProfileComments,
  createComment,
  updateComment,
  deleteComment,
  validateCommentBody,
} from "@/lib/supabase/comments";

/**
 * Profile comments.
 *
 *   GET    /api/comments?username=…        a page of comments
 *   POST   /api/comments?username=…        post a comment
 *   PATCH  /api/comments?id=…              edit your own comment
 *   DELETE /api/comments?id=…              delete your own comment
 *
 * SECURITY PROPERTIES OF THIS ROUTE
 *
 *   - **Identity comes from the session.** The author is always the caller.
 *     There is no `authorId` field to spoof.
 *   - **Whether a comment is ALLOWED is decided by the database.** The RLS
 *     policy calls `can_comment_on`, which knows the profile's visibility,
 *     whether the caller is an approved follower, and whether the pair is
 *     blocked. A private profile takes comments from approved followers only.
 *   - **The body is validated before it is written.** Plain text, 1–1,000
 *     characters, no markup. The database enforces the same bounds.
 *   - **`no-store` on every response**, so a cached page cannot show a
 *     comment that has since been deleted.
 */

export const dynamic = "force-dynamic";

/** The status code a failure maps to. */
function statusFor(reason: string): number {
  switch (reason) {
    case "not-authenticated":
      return 401;
    case "not-found":
      return 404;
    case "not-allowed":
    case "self":
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
 * GET /api/comments?username=…&offset=…
 *
 * A page of comments on a profile, newest first.
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

  const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

  const page = await listProfileComments(username, { offset });

  return NextResponse.json(
    {
      ok: true,
      comments: page.comments.map((comment) => ({
        id: comment.id,
        authorId: comment.authorId,
        authorUsername: comment.authorUsername,
        authorDisplayName: comment.authorDisplayName,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        isOwn: comment.isOwn,
        isOnOwnProfile: comment.isOnOwnProfile,
      })),
      nextOffset: page.nextOffset,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * POST /api/comments?username=…
 *
 * Post a comment on a profile.
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
      { ok: false, error: "You need to be signed in to comment." },
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
  const raw = typeof body.body === "string" ? body.body : "";

  const validation = validateCommentBody(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.message, reason: "invalid" },
      { status: 400 },
    );
  }

  const result = await createComment(username, raw);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      comment: {
        id: result.comment.id,
        authorId: result.comment.authorId,
        authorUsername: result.comment.authorUsername,
        authorDisplayName: result.comment.authorDisplayName,
        body: result.comment.body,
        createdAt: result.comment.createdAt,
        updatedAt: result.comment.updatedAt,
        isOwn: result.comment.isOwn,
        isOnOwnProfile: result.comment.isOnOwnProfile,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * PATCH /api/comments?id=…
 *
 * Edit your own comment.
 */
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

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "A comment id is required." },
      { status: 400 },
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
  const raw = typeof body.body === "string" ? body.body : "";

  const validation = validateCommentBody(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.message, reason: "invalid" },
      { status: 400 },
    );
  }

  const result = await updateComment(id, raw);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message, reason: result.reason },
      { status: statusFor(result.reason) },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      comment: {
        id: result.comment.id,
        authorId: result.comment.authorId,
        authorUsername: result.comment.authorUsername,
        authorDisplayName: result.comment.authorDisplayName,
        body: result.comment.body,
        createdAt: result.comment.createdAt,
        updatedAt: result.comment.updatedAt,
        isOwn: result.comment.isOwn,
        isOnOwnProfile: result.comment.isOnOwnProfile,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * DELETE /api/comments?id=…
 *
 * Delete your own comment, or any comment on a profile you own.
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

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "A comment id is required." },
      { status: 400 },
    );
  }

  const result = await deleteComment(id);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.message ?? "That comment could not be deleted.",
        reason: result.reason,
      },
      { status: statusFor(result.reason ?? "error") },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
