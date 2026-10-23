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
}: {
  draft: ProfileDraft;
  /**
   * Phase 6 — the owner's published reviews, read from the shared database.
   *
   * Passed straight through to `PublicProfileContent`, which renders nothing
   * for this section when the array is empty.
   */
  reviews?: Review[];
}) {
  const owner = buildEffectiveOwner(noirProfile, draft);

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