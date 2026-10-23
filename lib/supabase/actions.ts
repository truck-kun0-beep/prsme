"use server";

/**
 * Profile-creation action.
 *
 * A server action rather than a client fetch because the write must be
 * authorised against the *server's* session: `user_id` is derived from the
 * verified claims here and is never read from submitted form data. A client
 * that posted its own `userId` would be ignored, and the RLS `with check`
 * clause would reject the insert regardless.
 *
 * Note the draft arrives as a JSON string in FormData. That is intentional and
 * safe: the server cannot read the browser's localStorage, so the CLIENT
 * serialises its own guest draft and submits it. Because it is client-supplied
 * it is treated as untrusted and run through `readDraft()` — the same
 * validator used for localStorage — before a single field is trusted.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProfileForUser, getProfileForUser } from "./profiles";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";
import { starterDraft } from "./profileState";
import { validateUsername } from "./username";
import { readDraft, type ProfileDraft } from "@/lib/profileDraft";

export interface CreateProfileFormState {
  ok: boolean;
  message?: string;
  field?: "username" | "displayName" | "form";
  /** Sent back so the form keeps what the user typed. */
  values?: { username: string; displayName: string; bio: string };
}

export async function createProfileAction(
  _prev: CreateProfileFormState,
  formData: FormData,
): Promise<CreateProfileFormState> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: "Accounts aren't set up on this build.",
      field: "form",
    };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    // Not signed in. Send them to sign in and come back.
    redirect("/sign-in?next=/onboarding");
  }

  /*
   * The one-profile rule, checked here for UX only.
   *
   * The authoritative guarantee is the UNIQUE constraint on `user_id`: if two
   * requests race, Postgres accepts one and the loser gets `already-exists`
   * from `createProfileForUser`. This early check exists so the *common* case
   * never reaches the database — but it is a courtesy, not a lock.
   */
  const existing = await getProfileForUser();
  if (existing) {
    // Already owns a profile: the brief requires this route to forward to the
    // editor rather than offering a second creation flow.
    redirect("/studio");
  }

  const username = String(formData.get("username") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const bio = String(formData.get("bio") ?? "");
  const visibility = formData.get("visibility") === "public" ? "public" : "private";
  const rawDraft = String(formData.get("guestDraft") ?? "");

  const values = { username, displayName, bio };

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) {
    return { ok: false, message: usernameCheck.message, field: "username", values };
  }

  if (!displayName.trim()) {
    return { ok: false, message: "Enter a display name.", field: "displayName", values };
  }

  /*
   * Resolve the starting customization.
   *
   * Import is OPT-IN and explicit. When declined — or when there is nothing to
   * import, or when the submitted draft fails validation — we start from
   * `starterDraft`, which is empty apart from appearance defaults. Never Noir:
   * copying the demo into a real account would put a fictional person's name
   * and bio on a stranger's profile.
   */
  let draft: ProfileDraft | null = null;

  if (rawDraft) {
    try {
      // Untrusted input -> shared validator. A malformed or hostile payload
      // yields null here and we fall through to the starter profile.
      draft = readDraft(JSON.parse(rawDraft));
    } catch {
      draft = null;
    }
  }

  if (!draft) draft = starterDraft(usernameCheck.value);

  const result = await createProfileForUser({
    username: usernameCheck.value,
    displayName: displayName.trim(),
    bio: bio.trim(),
    visibility,
    draft,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      field:
        result.reason === "taken" || result.reason === "invalid"
          ? "username"
          : "form",
      values,
    };
  }

  /*
   * The guest draft is deliberately NOT cleared.
   *
   * It is the recovery copy of the work the owner just imported, and clearing
   * it server-side is impossible anyway (its storage lives in the browser).
   * The Studio ignores a local draft for a signed-in owner — see
   * `components/studio/ProfileStoreProvider.tsx` — so it cannot overwrite the
   * saved profile, and it stays available if the save ever fails.
   */

  revalidatePath("/studio");
  revalidatePath(`/u/${result.profile.username}`);

  redirect("/studio?created=1");
}