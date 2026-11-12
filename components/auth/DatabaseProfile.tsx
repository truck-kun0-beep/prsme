"use client";

import { PublicProfileContent } from "@/components/PublicProfileContent";
import { ThemeScope } from "@/components/ThemeScope";
import { buildEffectiveOwner } from "@/lib/effectiveProfile";
import { noirProfile } from "@/lib/noirProfile";
import type { ProfileDraft } from "@/lib/profileDraft";
import type { Review } from "@/lib/supabase/reviews";

/**
 * Renders a profile whose customization lives in the database.
 *
 * This is the same `PublicProfileContent` the demo and the Studio preview use,
 * fed the same typed `ProfileDraft`. That is the point: the saved public
 * profile and the Studio preview cannot drift, because they are literally the
 * same component with the same data shape.
 *
 * It renders server-fetched data only — there is no localStorage read and no
 * client override, so what the server decided is what the visitor sees. A
 * private profile never reaches this component at all; the route 404s first.
 */
export function DatabaseProfile({
  draft,
  reviews = [],
  avatarUrl = null,
  username,
}: {
  draft: ProfileDraft;
  /**
   * Phase 6 — the owner's published reviews, read from the shared database.
   *
   * Passed straight through to `PublicProfileContent`, which renders nothing
   * for this section when the array is empty.
   */
  reviews?: Review[];
  /**
   * Phase 7 — a short-lived signed URL for the owner's uploaded avatar.
   *
   * The bucket is private, so the bytes cannot be addressed directly. The
   * server mints the URL per request (see `lib/supabase/avatar.ts`) and hands
   * the result to the renderer, which prefers it over the generative palette
   * avatar. It is never persisted and never written into `profile_state`.
   */
  avatarUrl?: string | null;
  /**
   * Phase 7 — the owner's real username.
   *
   * The username is a COLUMN on `profiles`, not part of the customization
   * JSON, so it has to travel alongside the draft. Without it the renderer
   * falls back to the demo's `noir`, and the public page would show the wrong
   * handle and build the wrong share URL.
   */
  username?: string;
}) {
  const owner = buildEffectiveOwner(noirProfile, draft);

  // The username and the avatar are column- and bucket-owned, not draft-owned.
  if (username) owner.username = username;
  if (avatarUrl) owner.avatarDataUrl = avatarUrl;

  return (
    <ThemeScope draft={draft}>
      <PublicProfileContent
        owner={owner}
        draft={draft}
        respectSectionVisibility
        reviews={reviews}
      />
    </ThemeScope>
  );
}