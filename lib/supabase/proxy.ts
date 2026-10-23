/**
 * Session refresh (`middleware.ts` on Next.js 15).
 *
 * Supabase renamed `middleware.ts` to `proxy.ts` in Next.js 16. This project
 * is on Next 15.1.6, where a `proxy.ts` file is *never called* — copying a
 * current-docs snippet verbatim would mean sessions silently never refresh and
 * every user appears signed out. So this is the middleware form.
 *
 * Two responsibilities, both required:
 *   1. Refresh an expiring access token so it never lapses mid-session.
 *   2. Return a response carrying the refreshed cookies, because the response
 *      this function builds — not the one the route returns — is what the
 *      browser receives.
 *
 * When Supabase is not configured this returns the request untouched: the
 * demo, the Studio, and every public page must keep working with no project.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "./config";

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  const env = readSupabaseEnv();
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Replace rather than mutate: the token written into the *incoming*
        // request must reach the response, or every navigation re-runs the
        // refresh against an already-stale cookie.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  /*
   * `getClaims()` — not `getSession()`.
   *
   * `getSession()` reads the session straight out of the cookie without
   * revalidating it, so a forged cookie would be trusted as this user's own.
   * `getClaims()` verifies the token signature on every call. The returned
   * claims are what server code should use to identify the user.
   */
  const { data } = await supabase.auth.getClaims();
  void data;

  return response;
}