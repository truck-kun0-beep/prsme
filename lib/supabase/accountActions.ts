"use server";

import { setVisibility } from "./profiles";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";

/**
 * Change the current owner's profile visibility.
 *
 * The account page calls this rather than writing directly from the client, so
 * the decision is authorised against the server's session. `auth.uid()` is
 * never read from the request body — there is no user id to spoof.
 *
 * The RLS `with check` clause on UPDATE is the real enforcement: even a
 * crafted direct call to PostgREST cannot move another account's profile.
 */
export async function updateVisibilityAction(
  visibility: "public" | "private",
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: "You need to be signed in." };
  }

  // Only the two documented values. The column's CHECK constraint enforces
  // this too; rejecting here gives the UI a clean message instead of a 500.
  if (visibility !== "public" && visibility !== "private") {
    return { ok: false, message: "That's not a valid visibility." };
  }

  return setVisibility(visibility);
}