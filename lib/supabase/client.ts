/**
 * Browser Supabase client.
 *
 * `createBrowserClient` stores the session in cookies (not localStorage) so
 * the SSR client on the server can read the same session. Creating it lazily
 * — rather than at module scope — is what lets the app render with no
 * Supabase configuration: nothing here touches the environment until a
 * component actually asks for a client.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readSupabaseEnv,
  SupabaseNotConfiguredError,
} from "./config";

let cached: SupabaseClient | null = null;

/**
 * The browser client.
 *
 * @throws {SupabaseNotConfiguredError} when the environment is not set up.
 *   Callers that can fall back (e.g. to the local draft) should catch this and
 *   degrade; `isSupabaseConfigured()` is the cheaper pre-check.
 */
export function createClient(): SupabaseClient {
  if (cached) return cached;

  const env = readSupabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();

  cached = createBrowserClient(env.url, env.publishableKey);
  return cached;
}

/**
 * The browser client, or `null` when unconfigured.
 *
 * This is the form most components should use: a component that merely wants
 * to show account state when it can has no need to throw on a project with no
 * Supabase at all.
 */
export function getClient(): SupabaseClient | null {
  try {
    return createClient();
  } catch {
    return null;
  }
}