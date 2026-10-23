/**
 * Server Supabase client.
 *
 * Uses `getAll`/`setAll` cookie adapters, which is the API `@supabase/ssr`
 * documents for Next.js 15. It is deliberately NOT the deprecated
 * `get`/`set`/`remove` trio — those form the `cookies: { get, set, remove }`
 * shape and are the version most blog posts still show, so following the
 * current docs matters here.
 *
 * IMPORTANT — never call this from a Client Component. Server Components
 * cannot write cookies, so a refresh attempted here silently fails and the
 * session expires. Client code uses `lib/supabase/client.ts`.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  readSupabaseEnv,
  SupabaseNotConfiguredError,
} from "./config";

export interface ServerClientOptions {
  /**
   * Allow writes. Set false in Server Components and anything read-only;
   * `setAll` throws there, so failing loudly at the call site is clearer than
   * a swallowed cookie write.
   */
  canSetCookies?: boolean;
}

/**
 * A request-scoped server client.
 *
 * @throws {SupabaseNotConfiguredError} when the environment is not set up.
 */
export async function createClient(
  options: ServerClientOptions = {},
): Promise<SupabaseClient> {
  const { canSetCookies = true } = options;

  const env = readSupabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();

  /*
   * `cookies()` was synchronous through Next 15.4 and became async in 15.5.
   * This project is on 15.1.6, where `cookies()` returns the store directly,
   * so `await` is not merely optional -- the runtime type here is
   * `ReadonlyRequestCookies`, and awaiting a non-Promise would be a type
   * error rather than a free no-op.
   *
   * Awaiting the call satisfies both signatures: awaiting a non-thenable
   * resolves to the value itself.
   */
  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!canSetCookies) {
          // Read-only context (a Server Component). Refreshing is the
          // middleware's job; see `lib/supabase/proxy.ts`.
          return;
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. The middleware has already
          // refreshed the session by the time we get here, so this is safe to
          // ignore rather than a reason to fail the request.
        }
      },
    },
  });
}

/**
 * A server client, or `null` when Supabase is not configured.
 *
 * Use this on read paths that must degrade gracefully — the public profile,
 * for instance, renders the SSR demo when this returns `null`.
 */
export async function getServerClient(
  options: ServerClientOptions = {},
): Promise<SupabaseClient | null> {
  try {
    return await createClient(options);
  } catch {
    return null;
  }
}