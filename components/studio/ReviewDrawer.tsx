"use client";

/**
 * Phase 6 — the Studio's review drawer.
 *
 * This is where the review form meets its backend:
 *
 *   - **Guest**: the review is written into the local draft on the collection
 *     item, exactly as it was in Phase 4. The draft is the review's home, and
 *     nothing changes for a visitor who never made an account.
 *
 *   - **Authenticated**: the item is first resolved to a canonical
 *     `media_items` record (creating it if this is the first time anybody
 *     has reviewed that work), and the review is then written to
 *     `media_reviews` against that record — as a draft or as published,
 *     depending on which button was pressed.
 *
 * The local copy is kept in sync in both cases, so the collection card shows
 * the rating and the excerpt immediately. For an authenticated owner the
 * DATABASE row is the authoritative copy: it is what appears on the public
 * profile, on the media page, and in Discover.
 *
 * Honest failure handling:
 *
 *   - A failed resolve (the item has no provider identity — a demo item) is
 *     reported, not silently swallowed, and the local copy is still written
 *     so the owner's work is not lost.
 *   - A failed write shows the error and does NOT show a published state.
 *   - A guest draft is never overwritten by a signed-in owner's server data,
 *     and a signed-in owner's local draft is never silently replaced by a
 *     guest draft.
 */

import { useState } from "react";
import {
  ReviewEditor,
  reviewFromItem,
  validateReview,
  type ReviewDraft,
  type ReviewSaveTarget,
} from "./ReviewEditor";
import type { ProfileMediaItem } from "@/lib/noirProfile";
import { useAccount } from "@/components/auth/AccountProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ReviewDrawer({
  item,
  onSave,
  onClose,
}: {
  item: ProfileMediaItem;
  /**
   * Called after a successful write with the review that was written and the
   * state it was written in.
   */
  onSave: (review: ReviewDraft, target: ReviewSaveTarget) => void | Promise<void>;
  onClose: () => void;
}) {
  const { status: accountStatus } = useAccount();
  const authenticated = isSupabaseConfigured() && accountStatus === "authenticated";

  const [review, setReview] = useState<ReviewDraft>(() => reviewFromItem(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTarget, setSavedTarget] = useState<ReviewSaveTarget | null>(null);

  const validation = validateReview(review);

  async function handleSave(target: ReviewSaveTarget) {
    if (!validation.ok) return;

    setBusy(true);
    setError(null);
    // The success line is cleared FIRST, so a failed write can never leave a
    // stale "published" message on screen.
    setSavedTarget(null);

    try {
      if (authenticated) {
        const written = await writeReviewToDatabase(item, review, target);
        if (!written.ok) {
          setError(written.message);
          return;
        }
      }

      await onSave(review, target);
      setSavedTarget(target);
    } catch {
      setError("Network error — your review was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3" data-testid="studio-review-drawer">
      <ReviewEditor
        item={item}
        review={review}
        onChange={(next) => {
          setReview(next);
          setSavedTarget(null);
        }}
        onSave={handleSave}
        onCancel={onClose}
        authorName="@you"
        busy={busy}
        savedTarget={savedTarget}
        error={error}
      />
    </div>
  );
}

/**
 * Write a review to the shared catalogue.
 *
 * Two steps, both server-side:
 *
 *   1. `/api/media/resolve` — turn the item's provider identity into the
 *      canonical `media_items` row, creating it if it does not exist. This is
 *      the step that makes two people's reviews of the same work land on the
 *      same media page.
 *   2. `/api/reviews` — write the review against that media id.
 *
 * An item with no provider identity (a hand-authored demo item) cannot be
 * resolved into a catalogue record, because there is no stable key to key it
 * on. That is reported honestly rather than fabricated.
 */
async function writeReviewToDatabase(
  item: ProfileMediaItem,
  review: ReviewDraft,
  target: ReviewSaveTarget,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!item.provider || !item.providerId) {
    return {
      ok: false,
      message:
        "This item has no catalogue identity, so it cannot be published. Add it from the media catalogue instead.",
    };
  }

  const kind = item.catalogKind ?? fallbackCatalogKind(item);

  const resolve = await fetch("/api/media/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: item.provider,
      providerId: item.providerId,
      kind,
      title: item.title,
      creator: item.byline,
      creatorRole: item.creatorRole,
      year: item.year,
      coverUrl: item.coverUrl ?? null,
      coverSource: item.coverSource,
      externalUrl: item.externalUrl,
    }),
  });

  const resolvePayload = (await resolve.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    media?: { id: string };
  };

  if (!resolve.ok || !resolvePayload.ok || !resolvePayload.media?.id) {
    return {
      ok: false,
      message:
        resolvePayload.error ??
        "That item could not be added to the shared catalogue.",
    };
  }

  const write = await fetch("/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mediaId: resolvePayload.media.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      isSpoiler: review.spoiler,
      status: target,
    }),
  });

  const writePayload = (await write.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };

  if (!write.ok || !writePayload.ok) {
    return {
      ok: false,
      message:
        writePayload.error ?? "Your review could not be saved. Nothing was published.",
    };
  }

  return { ok: true };
}

/**
 * Guess the catalogue kind for an item that predates `catalogKind`.
 *
 * The profile card collapses song and album into "music", so an older item
 * cannot be distinguished. "album" is the safer guess: it is the kind a
 * catalogue record most often represents, and the title and creator are
 * preserved either way. An item with no kind at all cannot be published.
 */
function fallbackCatalogKind(item: ProfileMediaItem): string {
  switch (item.kind) {
    case "movie":
      return "movie";
    case "tv":
      return "tv";
    case "manga":
      return "manga";
    case "book":
      return "book";
    case "music":
      return "album";
    default:
      return "movie";
  }
}
