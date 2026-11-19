import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import {
  isSupabaseConfigured,
  supabaseSetupMessage,
} from "@/lib/supabase/config";
import {
  addToOwnList,
  removeFromOwnList,
  isOnOwnList,
} from "@/lib/supabase/list";
import { getMediaItemById, isUuid } from "@/lib/supabase/media";

/**
 * GET /api/list?mediaId=… — is this media item on the caller's list?
 *
 * Scoped by the session, so it can only ever answer about the caller's own
 * list. There is no user id parameter to point at somebody else's.
 *
 * `no-store` is load-bearing: a cached answer would leave the bookmark
 * control showing the wrong state after the owner saved or removed the item
 * on another tab.
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
  if (!mediaId || !isUuid(mediaId)) {
    return NextResponse.json(
      { ok: false, error: "A media item is required." },
      { status: 400 },
    );
  }

  const saved = await isOnOwnList(mediaId);
  return NextResponse.json(
    { ok: true, saved },
    { headers: { "cache-control": "no-store, max-age=0", vary: "Cookie" } },
  );
}

/**
 * POST /api/list — add a media item to the caller's list.
 *
 * Security properties of this route:
 *
 *   - **Identity is never accepted from the body.** There is no `userId`
 *     field to spoof; the write is scoped by the verified session, and the
 *     RLS `with check` clause enforces the same thing at the database.
 *   - **The media item must exist.** A list entry points at a canonical
 *     catalogue record, so the id is resolved and checked before the write.
 *     A list entry can never point at a media record that does not exist.
 *   - **The save is idempotent.** The write is an UPSERT on
 *     `(user_id, media_id)`, so a double-click adds one entry, not two.
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
      { ok: false, error: "You need to be signed in to save an item." },
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

  if (!mediaId || !isUuid(mediaId)) {
    return NextResponse.json(
      { ok: false, error: "A media item is required." },
      { status: 400 },
    );
  }

  // The media record must exist — the list entry attaches to a canonical item.
  const media = await getMediaItemById(mediaId);
  if (!media) {
    return NextResponse.json(
      { ok: false, error: "That media item could not be found." },
      { status: 404 },
    );
  }

  const result = await addToOwnList(mediaId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message ?? "Could not save that item." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, saved: true },
    { headers: { "cache-control": "no-store, max-age=0", vary: "Cookie" } },
  );
}

/**
 * DELETE /api/list?mediaId=… — remove the item from the caller's list.
 *
 * The RLS policy means this can only ever remove the caller's own entry;
 * asking for somebody else's removes nothing and still reports success,
 * because there is nothing there to remove.
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
  if (!mediaId || !isUuid(mediaId)) {
    return NextResponse.json(
      { ok: false, error: "A media item is required." },
      { status: 400 },
    );
  }

  const result = await removeFromOwnList(mediaId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message ?? "Could not remove that item." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, saved: false },
    { headers: { "cache-control": "no-store, max-age=0", vary: "Cookie" } },
  );
}
