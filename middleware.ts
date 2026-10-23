/**
 * Session refresh middleware.
 *
 * This project is on Next.js 15.1.6, where the hook file is `middleware.ts`.
 * (Next.js 16 renamed it to `proxy.ts`; using that name here on 15 means the
 * function is never called and sessions silently stop refreshing.)
 *
 * The matcher excludes static assets so the middleware — which performs a
 * network round-trip to the Auth server on every matched request — only runs
 * for real pages.
 */

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static  — build output
     *   _next/image   — the image optimizer
     *   favicon.ico
     *   static asset files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};