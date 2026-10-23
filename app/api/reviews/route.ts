import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import {
  saveOwnReview,
  deleteOwnReview,
  validateReviewInput,
  getOwnReviewForMedia,
  type SaveReviewInput,
} from "@/lib/supabase/reviews";
import { getMediaItemById } from "@/lib/supabase/media";

/**
 * GET /api/reviews?mediaId=… — the caller's own review for a media item.
 *
 * Scoped by the session, so it can only ever return the caller's own review
 * (draft or published). A visitor's browser asking for somebody else's
 * review id simply gets nothing back.
 *
 * `no-store` is load-bearing: a cached 200 would hydrate the editor with a
 * previous revision of the review, which is both a stale-write hazard and a
 * small privacy leak.
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

  const mediaId = request.nextUrl.searchParams.get("mediaId")?.trim() ?? "";
  if (!mediaId) {
    return NextResponse.json(
      { ok: false, error: "A media item is required." },
      { status: 400 },
    );
  }

  const review = await getOwnReviewForMedia(mediaId);
  if (!review) {
    return NextResponse.json(
      { ok: true, review: null },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      review: {
        id: review.id,
        mediaId: review.mediaId,
        rating: review.rating,
        title: review.title,
        body: review.body,
        isSpoiler: review.isSpoiler,
        status: review.status,
        publishedAt: review.publishedAt,
        updatedAt: review.updatedAt,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}


/**
 * POST /api/reviews — create, update, publish, or unpublish a review.
 *
 * Security properties of this route:
 *
 *   - **Identity is never accepted from the body.** There is no `userId` or
 *     `username` field to spoof; the write is scoped by the verified session,
 *     and the RLS `with check` clause enforces the same thing at the database.
 *   - **The media item must exist.** A review is attached to a canonical
 *     catalogue record, so the id is resolved and checked before the write.
 *     A review can never point at a media record that does not exist.
 *   - **Publication is explicit.** `status` is `draft` or `published`, and
 *     saving a draft never publishes it. A failed write returns a non-2xx
 *     with an honest message; it never reports a published state it did not
 *     reach.
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
      { ok: false, error: "You need to be signed in to write a review." },
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

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { ok: false, error: "Malformed request body." },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;

  const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim() : "";
  if (!mediaId) {
    return NextResponse.json(
      { ok: false, error: "A review needs a media item." },
      { status: 400 },
    );
  }

  // The status is explicit. Anything unrecognised is a draft — never a
  // publish. A stray or malformed value must not publish somebody's work.
  const status: "draft" | "published" =
    body.status === "published" ? "published" : "draft";

  const input: SaveReviewInput = {
    mediaId,
    status,
    rating:
      typeof body.rating === "number" && Number.isFinite(body.rating)
        ? body.rating
        : null,
    title: typeof body.title === "string" ? body.title : null,
    body: typeof body.body === "string" ? body.body : "",
    isSpoiler: body.isSpoiler === true,
  };

  const validation = validateReviewInput(input);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.message },
      { status: 400 },
    );
  }

  // The media record must exist — the review attaches to a canonical item.
  const media = await getMediaItemById(mediaId);
  if (!media) {
    return NextResponse.json(
      { ok: false, error: "That media item could not be found." },
      { status: 404 },
    );
  }

  const result = await saveOwnReview(input);
  if (!result.ok) {
    const status_code = result.reason === "not-authenticated" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: status_code },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      review: {
        id: result.review.id,
        mediaId: result.review.mediaId,
        rating: result.review.rating,
        title: result.review.title,
        body: result.review.body,
        isSpoiler: result.review.isSpoiler,
        status: result.review.status,
        publishedAt: result.review.publishedAt,
        updatedAt: result.review.updatedAt,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

/**
 * DELETE /api/reviews?mediaId=… — remove the caller's own review.
 *
 * The RLS policy means this can only ever remove the caller's own review;
 * asking for somebody else's returns no rows and reports that nothing was
 * removed.
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

  const mediaId = request.nextUrl.searchParams.get("mediaId")?.trim() ?? "";
  if (!mediaId) {
    return NextResponse.json(
      { ok: false, error: "A media item is required." },
      { status: 400 },
    );
  }

  const result = await deleteOwnReview(mediaId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message ?? "Could not remove the review." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
