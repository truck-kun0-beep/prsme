import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath, DEFAULT_REDIRECT } from "@/lib/supabase/redirects";

/**
 * Auth callback — PKCE and email-confirmation completion.
 *
 * Supabase sends the user here with a `code` query parameter, which this route
 * exchanges for a session via `exchangeCodeForSession()`. The resulting
 * session cookies are set on the redirect response.
 *
 * Two properties worth stating:
 *
 *   - **`next` is validated, not trusted.** It is run through
 *     `safeRedirectPath`, which only permits same-origin paths. A request
 *     carrying `next=https://evil.example` is redirected to the default
 *     instead, so the freshly-issued session is never handed to another origin.
 *
 *   - **Missing configuration redirects rather than throwing.** A project with
 *     no Supabase env must still return a response, not a 500.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"), "/onboarding");

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, url.origin));

  let supabase;
  try {
    supabase = await createClient({ canSetCookies: true });
  } catch {
    // No project configured: send the visitor somewhere that always works.
    return redirectTo(DEFAULT_REDIRECT);
  }

  if (!code) {
    // No code — a stale or hand-edited link. Do not guess a destination.
    return redirectTo("/sign-in?error=missing_code");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // An expired or already-used code. Landing on sign-in with a message beats
    // looping on this route.
    return redirectTo("/sign-in?error=expired_link");
  }

  return redirectTo(next);
}