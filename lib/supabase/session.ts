/**
 * Verified session access.
 *
 * Everything that needs to know "who is this request?" goes through here, so
 * there is exactly one place where the difference between a *verified* session
 * and a merely *present* cookie is encoded.
 */

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { getServerClient } from "./server";
import { isSupabaseConfigured } from "./config";

export interface AuthenticatedUser {
  user: User;
  email: string | null;
}

/**
 * The current user, or `null`.
 *
 * Uses `getClaims()` rather than `getUser()`:
 *   - `getClaims()` verifies the token signature locally against the project's
 *     JWKS and does not need a network round-trip per request.
 *   - `getUser()` is the correct call when the *freshest* account state is
 *     required (e.g. after a change on the Auth side).
 *
 * `cache()` dedupes this across a single render pass: the layout, the page, and
 * any nested server component all get one call, not three.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  // `getClaims` returns claims, not a full User row. Only the id and the
  // subject matter for authorization, so the object below is the minimum
  // honest shape; callers needing the email should call `getUserRecord`.
  const user = { id: data.claims.sub } as User;

  // `email` is present in the claims on projects using the default claims set.
  const rawEmail = (data.claims as Record<string, unknown>).email;
  const email = typeof rawEmail === "string" ? rawEmail : null;

  return { user, email };
});

/**
 * The current user's id, or `null`.
 *
 * The narrowest form of "am I signed in?", and what authorization checks
 * should branch on.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const auth = await getCurrentUser();
  return auth?.user.id ?? null;
}

/**
 * The full Auth-side user record, or `null`.
 *
 * A network call, so use it only where the up-to-date record matters — the
 * account settings page showing the current email, for example. Authorization
 * decisions must use `getCurrentUserId()`, which needs no round-trip.
 */
export async function getUserRecord(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}