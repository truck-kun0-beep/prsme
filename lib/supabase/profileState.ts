/**
 * Profile state — the mapping between the Studio's `ProfileDraft` and the
 * database's versioned JSONB document.
 *
 * This is the ONLY place that knows both shapes. Two rules govern it:
 *
 *   1. **Server-controlled fields never enter the JSON.** `user_id`,
 *      `username`, and `visibility` are real columns in `profiles`, so a
 *      client that PUTs a crafted `profile_state` containing its own
 *      `user_id` cannot change ownership or flip a private profile public.
 *
 *   2. **Everything is validated on the way in AND on the way out.** A row
 *      written by a future version of the app, or hand-edited through
 *      PostgREST, must not be able to crash the public profile. So the read
 *      direction runs the same repair as `readDraft` and falls back to the
 *      starter profile rather than trusting the blob.
 *
 * The version lives INSIDE the document (`profile_state.version`) and is
 * checked on both directions. Bumping it requires adding a migration pass
 * here; an unknown version degrades to the starter profile rather than
 * guessing.
 */

import {
  buildDefaultDraft,
  readDraft,
  PROFILE_DRAFT_VERSION,
  type ProfileDraft,
  type ProfileVisibility,
} from "@/lib/profileDraft";
import type { Palette } from "@/lib/noirProfile";

/** Bump when the persisted shape changes; add a migration pass below. */
export const PROFILE_STATE_VERSION = 1;

/**
 * The shape actually stored in `profiles.profile_state`.
 *
 * Deliberately NOT `ProfileDraft`: `identity.username`, `version`, and
 * `visibility` are excluded because they are server-owned columns. Keeping
 * them out of the type makes it a compile error to write them from here.
 */
export interface StoredProfileState {
  version: number;
  displayName: string;
  bio: string;
  location: string;
  pronouns: string;
  avatarPalette: Palette;
  tags: string[];
  socials: ProfileDraft["socials"];
  collections: ProfileDraft["collections"];
  soundtrack: ProfileDraft["soundtrack"];
  clicks: ProfileDraft["clicks"];
  customLinks: ProfileDraft["customLinks"];
  customLinksSection: ProfileDraft["customLinksSection"];
  appearance: ProfileDraft["appearance"];
  sectionOrder: ProfileDraft["sectionOrder"];
  sectionVisibility: ProfileDraft["sectionVisibility"];
}

/* -------------------------------------------------------------------------- */
/*                            Draft -> stored state                          */
/* -------------------------------------------------------------------------- */

/**
 * Project a Studio draft down to the storable document.
 *
 * `avatarDataUrl` is dropped: avatars live in Supabase Storage, and the column
 * reference (`avatar_path`) is set separately by `lib/supabase/avatar.ts`. A
 * base64 string in a JSONB column would bloat every row on every save and
 * defeat the point of the bucket.
 *
 * `visibility` is NOT carried here either. It is a top-level column so that
 * RLS can read it cheaply; the Studio's own copy stays in the JSON for
 * round-tripping, but the authoritative value on write is the column.
 */
export function toStoredProfileState(draft: ProfileDraft): StoredProfileState {
  return {
    version: PROFILE_STATE_VERSION,
    displayName: draft.identity.displayName,
    bio: draft.identity.bio,
    location: draft.identity.location,
    pronouns: draft.identity.pronouns,
    avatarPalette: draft.identity.avatarPalette,
    tags: [...draft.tags],
    socials: draft.socials.map((s) => ({ ...s })),
    collections: draft.collections.map((c) => ({ ...c, items: [...c.items] })),
    soundtrack: draft.soundtrack ? { ...draft.soundtrack } : null,
    clicks: draft.clicks.map((c) => ({ ...c })),
    customLinks: draft.customLinks.map((l) => ({ ...l })),
    customLinksSection: { ...draft.customLinksSection },
    appearance: { ...draft.appearance },
    sectionOrder: [...draft.sectionOrder],
    sectionVisibility: { ...draft.sectionVisibility },
  };
}

/* -------------------------------------------------------------------------- */
/*                          Stored state -> draft                             */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild a `ProfileDraft` from a stored document.
 *
 * Returns `null` — meaning "fall back to the starter profile" — when the
 * document is not an object, or carries a version this build does not
 * understand. That is the safe direction: a profile renders as a clean
 * starter rather than as a broken page.
 *
 * The reconstruction deliberately round-trips through `readDraft`, which is
 * the same validator `localStorage` drafts go through. One validator means a
 * value that would be rejected from local storage is also rejected from the
 * database, and the two storage paths cannot drift.
 *
 * `username` and `visibility` are supplied by the caller from the COLUMNS, not
 * from the JSON — so a row whose JSON disagrees with its own columns still
 * renders the authoritative value.
 */
export function fromStoredProfileState(
  input: unknown,
  identity: { username: string; visibility: ProfileVisibility },
): ProfileDraft | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const raw = input as Record<string, unknown>;

  // Version gate. An unknown version is not readable; the caller falls back.
  if (raw.version !== PROFILE_STATE_VERSION) {
    return null;
  }

  // Assemble a draft-shaped object so `readDraft` can validate it. Anything
  // missing simply falls back to the starter value inside `readDraft`.
  const assembled = {
    version: PROFILE_DRAFT_VERSION,
    identity: {
      username: identity.username,
      displayName: raw.displayName,
      bio: raw.bio,
      location: raw.location,
      pronouns: raw.pronouns,
      avatarPalette: raw.avatarPalette,
    },
    tags: raw.tags,
    socials: raw.socials,
    avatarDataUrl: null,
    collections: raw.collections,
    soundtrack: raw.soundtrack,
    clicks: raw.clicks,
    customLinks: raw.customLinks,
    customLinksSection: raw.customLinksSection,
    appearance: raw.appearance,
    visibility: identity.visibility,
    sectionOrder: raw.sectionOrder,
    sectionVisibility: raw.sectionVisibility,
  };

  // `readDraft` is the shared validator, so a value that would be rejected
  // from localStorage is also rejected from the database. Notably this keeps
  // an empty `clicks` array empty — the owner's decision — instead of
  // substituting the demo gallery.
  const repaired = readDraft(assembled);

  // Identity and visibility are column-owned; take them from the caller
  // regardless of what came back.
  repaired.identity.username = identity.username;
  repaired.visibility = identity.visibility;

  return repaired;
}

/* -------------------------------------------------------------------------- */
/*                              Starter profile                              */
/* -------------------------------------------------------------------------- */

/**
 * A brand-new account's starting customization.
 *
 * Intentionally EMPTY rather than a copy of Noir. The brief is direct about
 * this: silently copying the demo into every new account would put a
 * stranger's name and bio on a stranger's profile. The owner either starts
 * clean or explicitly imports their own guest draft — see the onboarding page.
 */
export function starterDraft(username: string): ProfileDraft {
  const base = buildDefaultDraft({ includeDemoClicks: false });
  return {
    ...base,
    identity: {
      ...base.identity,
      username,
      displayName: username,
      bio: "",
    },
    tags: [],
    socials: [],
    collections: [],
    soundtrack: null,
    clicks: [],
    customLinks: [],
  };
}