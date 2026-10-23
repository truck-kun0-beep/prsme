import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { getProfileByUsername } from "@/lib/supabase/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerClient } from "@/lib/supabase/server";
import { createAvatarUrl } from "@/lib/supabase/avatar";

/**
 * Mint a short-lived URL for a profile's avatar.
 *
 * This route is the ONLY path by which avatar bytes leave the private bucket,
 * and it is where the storage policy and the profile RLS policy are made to
 * agree:
 *
 *   1. `getProfileByUsername` returns `null` for a private profile the caller
 *      does not own — RLS already hid the row, and the explicit check is a
 *      second line of defence.
 *   2. Only then is a signed URL minted.
 *
 * So an unauthorised visitor gets a 404 without ever reaching the signing
 * step, and no signed URL is ever generated for content they may not see.
 *
 * The URL is returned to the caller and never persisted, so it cannot outlive
 * its TTL or leak into a stored profile row.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { username } = await params;

  const profile = await getProfileByUsername(username);
  if (!profile || !profile.avatarPath) {
    // Indistinguishable from "no such profile" on purpose.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const signedUrl = await createAvatarUrl(supabase, profile.avatarPath);
  if (!signedUrl) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  /*
   * Explicitly private.
   *
   * Without this, a CDN or a shared proxy could cache one visitor's signed URL
   * and hand it to another. `no-store` plus a Vary header keeps the response
   * per-request; the URL's own short TTL is the real bound on exposure.
   */
  return NextResponse.json(
    { url: signedUrl },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        vary: "Cookie",
      },
    },
  );
}

/**
 * The current user's own avatar.
 *
 * Needed by the Studio and the account menu, which show an avatar regardless
 * of the profile's public visibility. Authorised by the session, so it does
 * not go through the username lookup.
 */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.avatar_path) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const signedUrl = await createAvatarUrl(supabase, data.avatar_path as string);
  if (!signedUrl) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    { url: signedUrl },
    { headers: { "cache-control": "no-store, max-age=0", vary: "Cookie" } },
  );
}