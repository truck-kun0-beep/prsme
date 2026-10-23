/**
 * Username rules — the single source of truth.
 *
 * The same rules are enforced in three places, and they MUST agree:
 *
 *   1. Here, in TypeScript, so the onboarding form can reject a bad username
 *      before a round-trip.
 *   2. In the `profiles_username_format` CHECK constraint (migration
 *      `20250101000001_profiles.sql`).
 *   3. In `lib/supabase/profiles.ts` before an insert is attempted.
 *
 * Divergence would mean a username the UI accepted and the database refused,
 * or — worse — one the database accepted that the URL router cannot address.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/**
 * Lowercase letters, digits, underscore, hyphen.
 *
 * Uppercase is excluded rather than normalised away, because a username is
 * also a URL segment: accepting `Noir` and storing `noir` would make
 * `/u/Noir` and `/u/noir` the same profile, and the second spelling would be a
 * 404. Requiring lowercase means the canonical form is the only form.
 */
export const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Reserved slugs.
 *
 * `noir` is the fictional demo profile and MUST stay reachable at `/u/noir`
 * with no Supabase project configured — a real account claiming it would make
 * the demo unreachable on every deployment that has a database.
 *
 * The rest are application routes. A profile called `studio` or `sign-in`
 * would either shadow the app or produce an ambiguous URL.
 */
export const RESERVED_USERNAMES = [
  // Demo / existing profile
  "noir",
  // Application routes
  "studio",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "forgot-password",
  "reset-password",
  "auth",
  "account",
  "onboarding",
  "create-profile",
  "api",
  "admin",
  "settings",
  "discover",
  "themes",
  "taste",
  "share",
  "about",
  "help",
  "support",
  "privacy",
  "terms",
  "prsme",
] as const;

export type UsernameValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * Validate and normalise a requested username.
 *
 * Returns the value to store on success. The returned `value` is trimmed and
 * lowercased, so callers should persist `result.value` rather than the raw
 * input — otherwise a user typing ` Noir ` would get a 409 from the database's
 * case-insensitive unique index and be told the name was taken.
 */
export function validateUsername(input: string): UsernameValidation {
  const raw = (input ?? "").trim().toLowerCase();

  if (!raw) return { ok: false, message: "Choose a username." };
  if (raw.length < USERNAME_MIN) {
    return { ok: false, message: `At least ${USERNAME_MIN} characters.` };
  }
  if (raw.length > USERNAME_MAX) {
    return { ok: false, message: `At most ${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_PATTERN.test(raw)) {
    return {
      ok: false,
      message: "Lowercase letters, numbers, underscore, and hyphen only.",
    };
  }
  if ((RESERVED_USERNAMES as readonly string[]).includes(raw)) {
    return { ok: false, message: "That username is reserved." };
  }

  return { ok: true, value: raw };
}

/** True when the name is well-formed *and* unreserved. */
export function isUsernameAvailable(input: string): boolean {
  return validateUsername(input).ok;
}