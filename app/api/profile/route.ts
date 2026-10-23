import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import {
  saveProfileDraft,
  getProfileForUser,
} from "@/lib/supabase/profiles";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import { readDraft, type ProfileDraft } from "@/lib/profileDraft";

/**
 * Load the signed-in owner's saved profile.
 *
 * Scoped by the session's user id, so it can only ever return the caller's own
 * row — there is no username parameter to point at someone else.
 *
 * `no-store` is load-bearing. A cached 200 would hydrate the Studio with a
 * previous visitor's revision, which is both a privacy leak and a lost edit.
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

  const profile = await getProfileForUser();
  if (!profile) {
    // Authenticated, no profile yet. 404 tells the Studio to route to
    // onboarding rather than showing an empty editor.
    return NextResponse.json(
      { ok: false, error: "No profile yet." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      username: profile.username,
      visibility: profile.visibility,
      // `avatarPath` is a storage path, not a URL — the client asks
      // /api/profile/avatar-url for a short-lived signed URL when it needs one.
      avatarPath: profile.avatarPath,
      updatedAt: profile.updatedAt,
      draft: profile.draft,
    },
    { headers: { "cache-control": "no-store, max-age=0", vary: "Cookie" } },
  );
}

/**
 * Save the signed-in owner's Studio draft.
 *
 * Security properties of this route:
 *
 *   - **Identity is never accepted from the body.** There is no `userId` or
 *     `username` parameter to spoof; the write is scoped by `.eq("user_id",
 *     sessionUserId)` where the id comes from verified claims.
 *   - **The draft is validated, not trusted.** It arrives as JSON and goes
 *     through `readDraft()` — the same validator localStorage uses — so a
 *     crafted payload cannot inject an oversized string, a `javascript:` link,
 *     or an unknown appearance id into `profile_state`.
 *   - **Stale writes are rejected.** The client sends the `updated_at` it
 *     loaded. If the row has moved on, the save is refused with 409 rather
 *     than clobbering a newer edit.
 *
 * Anonymous callers get 401 with a clear message — never a silent success.
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
      { ok: false, error: "You need to be signed in to save." },
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

  // Optional visibility change, folded into the same save.
  const requestedVisibility =
    body.visibility === "public" || body.visibility === "private"
      ? body.visibility
      : undefined;

  // Avatar reference. Only a path under the caller's own uid is accepted; the
  // storage policy enforces this too, but validating here turns a foreign path
  // into a clear 400 rather than an opaque RLS error.
  //
  // `undefined` means "leave the column alone" (the field was absent from the
  // request); an explicit `null` means "clear the avatar". Collapsing those two
  // would make every save wipe the owner's avatar.
  let avatarPath: string | null | undefined;
  if (typeof body.avatarPath === "string") {
    if (body.avatarPath === "") {
      avatarPath = null;
    } else if (body.avatarPath.startsWith(`${userId}/`)) {
      avatarPath = body.avatarPath;
    } else {
      return NextResponse.json(
        { ok: false, error: "That avatar path isn't yours to set." },
        { status: 403 },
      );
    }
  }

  /*
   * Optimistic-concurrency guard.
   *
   * Without this, two tabs open on the Studio would silently overwrite each
   * other — the second save wins regardless of which edit was newer. Comparing
   * against the `updated_at` the client loaded turns that into a visible 409.
   */
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;

  if (expectedUpdatedAt) {
    const current = await getProfileForUser();
    if (current && current.updatedAt !== expectedUpdatedAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "This profile was changed somewhere else. Reload to see the latest.",
          conflict: true,
          serverUpdatedAt: current.updatedAt,
        },
        { status: 409 },
      );
    }
  }

  let draft: ProfileDraft | null = null;
  try {
    if (body.draft && typeof body.draft === "object") {
      draft = readDraft(body.draft);
    }
  } catch {
    draft = null;
  }

  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "That profile data couldn't be read." },
      { status: 400 },
    );
  }

  const result = await saveProfileDraft({ draft, visibility: requestedVisibility, avatarPath });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    username: result.profile.username,
    visibility: result.profile.visibility,
    updatedAt: result.profile.updatedAt,
  });
}