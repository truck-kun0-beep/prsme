"use client";

/**
 * Phase 4.2 — the "Read full review" affordance is gone.
 *
 * Earlier phases rendered an underline + the literal words "Read full review"
 * beneath every card. That was the wrong shape: a *second* click on a button
 * after the owner already decided to read the review. Now the entire excerpt
 * (the actual words the owner wrote) is the click target, with a quiet chevron
 * and the visible cue "Read the whole review".
 *
 * This file retains `hasReview` because multiple layouts and the studio editor
 * still need to decide whether to show a review surface at all. The old
 * `<ReviewExcerptLink>` component is intentionally removed.
 */

import type { ProfileMediaItem } from "@/lib/noirProfile";

export function hasReview(item: ProfileMediaItem): boolean {
  return Boolean(
    (item.myReview && item.myReview.trim()) ||
      (item.myReviewTitle && item.myReviewTitle.trim()),
  );
}
