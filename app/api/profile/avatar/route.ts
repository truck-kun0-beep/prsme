import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { uploadAvatar, deleteAvatar } from "@/lib/supabase/avatar";
import { createClient } from "@/lib/supabase/server";
import { getProfileForUser, setAvatarPath } from "@/lib/supabase/profiles";

/**
 * Avatar upload.
 *
 * The file is uploaded to the private bucket and the resulting path is written
 * to `profiles.avatar_path` in one request, so the profile never points at an
 * object that failed to store.
 *
 * Only the path is persisted — never a signed URL. A signed URL expires, and
 * storing one would both break the avatar after its first expiry and write a
 * bearer-style credential into the profile row.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "You need to be signed in to change your avatar." },
      { status: 401 },
    );
  }

  let supabase;
  try {
    supabase = await createClient({ canSetCookies: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected a multipart upload." },
      { status: 400 },
    );
  }

  const file = form.get("avatar");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No image was provided." },
      { status: 400 },
    );
  }

  const uploaded = await uploadAvatar(supabase, userId, file, {
    type: file.type,
    size: file.size,
  });

  if (!uploaded.ok || !uploaded.path) {
    return NextResponse.json(
      { ok: false, error: uploaded.message ?? "Could not upload the avatar." },
      { status: 400 },
    );
  }

  /*
   * Point the profile at the new object BEFORE deleting the old one.
   *
   * The reverse order has a failure mode that loses the avatar entirely: if
   * the delete succeeds and the profile update then fails, the profile is left
   * referencing an object that no longer exists.
   */
  const profile = await getProfileForUser();
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Create your profile before adding an avatar." },
      { status: 409 },
    );
  }

  const previousPath = profile.avatarPath;

  const saved = await setAvatarPath(uploaded.path);

  if (!saved.ok) {
    // Roll back the object we just uploaded so storage is not orphaned.
    await deleteAvatar(supabase, uploaded.path);
    return NextResponse.json({ ok: false, error: saved.message }, { status: 500 });
  }

  // Now it is safe to discard the previous object.
  if (previousPath && previousPath !== uploaded.path) {
    await deleteAvatar(supabase, previousPath);
  }

  return NextResponse.json({ ok: true, avatarPath: uploaded.path });
}