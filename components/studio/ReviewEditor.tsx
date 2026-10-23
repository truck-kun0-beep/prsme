"use client";

/**
 * ReviewEditor — the personal review form.
 *
 * A review is owner data: a 0–10 rating, an optional headline, a body, and a
 * spoiler flag. It is stored inside the selected media item on the draft, so
 * it shares the item's lifecycle (add → rate → review → remove) without ever
 * being written back to a provider.
 *
 * Phase 6 — TWO BACKENDS, ONE FORM.
 *
 *   - **Guest** (no session): exactly the Phase 4 behaviour. The review is
 *     written into the local draft on the collection item, and the single
 *     "Save review" button is correct, because the local draft IS the
 *     review's home.
 *
 *   - **Authenticated**: the same form gains TWO explicit actions — "Save
 *     draft" and "Publish review". The review is written to the shared
 *     `media_reviews` table, attached to the canonical media record for the
 *     item, and the local copy is kept in sync so the collection card still
 *     renders the rating and the excerpt.
 *
 * Why two buttons rather than one: a single save button has to guess whether
 * the owner meant to publish, and every guess is wrong for somebody. Saving a
 * half-written review and having it appear in the public feed is the specific
 * failure the brief rules out.
 *
 * Validation is explicit and surfaced inline: an empty review is not
 * savable, and the body is capped so a localStorage draft can't bloat.
 */

import { useCallback, useMemo } from "react";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import { FieldGroup, TextArea, TextInput } from "./StudioFields";
import { PanelCard } from "./StudioFields";
import type { ProfileMediaItem } from "@/lib/noirProfile";
import { MEDIA_PROVIDER_LABELS, type MediaProviderId } from "@/lib/media/types";
import { useAccount } from "@/components/auth/AccountProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface ReviewDraft {
  rating: number | null;
  title: string;
  body: string;
  spoiler: boolean;
}

export const REVIEW_BODY_MAX = 4_000;
export const REVIEW_TITLE_MAX = 140;

export function emptyReview(): ReviewDraft {
  return { rating: null, title: "", body: "", spoiler: false };
}

/** Derive an editable draft from an existing item's saved review. */
export function reviewFromItem(item: ProfileMediaItem): ReviewDraft {
  return {
    rating: typeof item.myRating === "number" ? item.myRating : null,
    title: item.myReviewTitle ?? "",
    body: item.myReview ?? "",
    spoiler: item.myReviewSpoiler === true,
  };
}

export interface ReviewValidation {
  ok: boolean;
  message?: string;
}

/**
 * A review needs *something* — a rating, a title, or a body. Saving an
 * entirely empty form is rejected so the profile never shows a blank card.
 */
export function validateReview(review: ReviewDraft): ReviewValidation {
  if (review.rating === null && !review.title.trim() && !review.body.trim()) {
    return { ok: false, message: "Add a rating, a headline, or some notes before saving." };
  }
  if (review.body.length > REVIEW_BODY_MAX) {
    return { ok: false, message: `Notes are capped at ${REVIEW_BODY_MAX.toLocaleString()} characters.` };
  }
  if (review.title.length > REVIEW_TITLE_MAX) {
    return { ok: false, message: `Headline is capped at ${REVIEW_TITLE_MAX} characters.` };
  }
  return { ok: true };
}

/**
 * Where the review will end up.
 *
 * "draft"     — saved, visible only to the author.
 * "published" — saved and visible to the public, subject to the author's
 *               profile visibility.
 */
export type ReviewSaveTarget = "draft" | "published";

export function ReviewEditor({
  item,
  review,
  onChange,
  onSave,
  onCancel,
  authorName,
  busy = false,
  savedTarget = null,
  error = null,
}: {
  item: ProfileMediaItem;
  review: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  onSave: (target: ReviewSaveTarget) => void | Promise<void>;
  onCancel: () => void;
  /** Display name of the review author inside the demo. */
  authorName: string;
  /** True while a write is in flight. */
  busy?: boolean;
  /** The last successful write's state, for the confirmation line. */
  savedTarget?: ReviewSaveTarget | null;
  /** The message from the last failed write. */
  error?: string | null;
}) {
  const { status: accountStatus } = useAccount();
  const authenticated = isSupabaseConfigured() && accountStatus === "authenticated";

  const validation = useMemo(() => validateReview(review), [review]);
  const remaining = REVIEW_BODY_MAX - review.body.length;
  const providerLabel = item.provider
    ? MEDIA_PROVIDER_LABELS[item.provider as MediaProviderId]
    : null;

  const onSaveClick = useCallback(
    (target: ReviewSaveTarget) => {
      void onSave(target);
    },
    [onSave],
  );

  return (
    <PanelCard
      title={`Review — ${item.title}`}
      description={
        authenticated
          ? "Your rating and notes go to the shared catalogue when you publish them."
          : "Your rating and notes are saved on this device and shown only on your profile."
      }
    >
      <div className="flex gap-3">
        <div className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md">
          <Artwork
            palette={item.palette}
            src={item.coverUrl}
            alt={`${item.title} cover`}
            ratio="2/3"
            className="!rounded-none"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-strong)]">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
            {[item.byline, item.year, providerLabel].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-2 text-[12px] text-[var(--text-faint)]">
            By {authorName} ·{" "}
            {authenticated
              ? "published to the shared catalogue"
              : "saved in this browser only"}
          </p>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12px] font-medium text-[var(--text-default)]">
          Your rating
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((value) => {
            const selected = review.rating === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({ ...review, rating: selected ? null : value })
                }
                className={`h-8 w-8 rounded-md border text-[12px] font-medium transition-colors ${
                  selected
                    ? "border-[var(--accent-400)] bg-[var(--accent-400)]/15 text-[var(--text-strong)]"
                    : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
                }`}
              >
                {value}
              </button>
            );
          })}
          {review.rating !== null && (
            <span className="ml-2 inline-flex items-center gap-2">
              <RatingBadge value={review.rating} size="sm" />
            </span>
          )}
        </div>
      </fieldset>

      <div className="mt-4">
        <FieldGroup id="review-title" label="Headline" hint="Optional">
          <TextInput
            id="review-title"
            value={review.title}
            maxLength={REVIEW_TITLE_MAX}
            onChange={(e) => onChange({ ...review, title: e.target.value })}
            placeholder="One line that captures your take"
          />
        </FieldGroup>
      </div>

      <div className="mt-3">
        <FieldGroup
          id="review-body"
          label="Notes"
          hint={`${remaining.toLocaleString()} characters remaining`}
        >
          <TextArea
            id="review-body"
            rows={6}
            value={review.body}
            maxLength={REVIEW_BODY_MAX}
            onChange={(e) => onChange({ ...review, body: e.target.value })}
            placeholder="What stayed with you?"
          />
        </FieldGroup>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--text-default)]">
        <input
          type="checkbox"
          checked={review.spoiler}
          onChange={(e) => onChange({ ...review, spoiler: e.target.checked })}
          className="h-3.5 w-3.5 accent-[var(--accent-400)]"
        />
        Mark as spoiler
      </label>

      {!validation.ok && review.title.trim().length + review.body.trim().length > 0 && (
        <p className="mt-3 text-[12px] text-[color:#D6757B]" role="alert">
          {validation.message}
        </p>
      )}

      {error ? (
        <p
          className="mt-3 rounded-md border border-[color:#D6757B]/40 bg-[color:#D6757B]/10 px-3 py-2 text-[12px] text-[color:#E8A0A4]"
          role="alert"
          data-testid="studio-review-error"
        >
          {error}
        </p>
      ) : null}

      {savedTarget ? (
        <p
          className="mt-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-default)]"
          role="status"
          data-testid="studio-review-status"
        >
          {savedTarget === "published"
            ? "Published. Your review is live on your profile and on the media page."
            : "Draft saved. Only you can see it — publish it when you're ready."}
        </p>
      ) : null}

      {/*
       * Two explicit actions for an authenticated owner; one for a guest.
       *
       * For a guest the local draft IS the review's home, so there is nothing
       * to publish and a single "Save review" is the honest control.
       */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {authenticated ? (
          <>
            <button
              type="button"
              onClick={() => onSaveClick("draft")}
              disabled={busy || !validation.ok}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
              data-testid="studio-review-save-draft"
            >
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() => onSaveClick("published")}
              disabled={busy || !validation.ok}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3.5 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)] disabled:opacity-50"
              data-testid="studio-review-publish"
            >
              {busy ? "Publishing…" : "Publish review"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onSaveClick("draft")}
            disabled={busy || !validation.ok}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3.5 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)] disabled:opacity-50"
            data-testid="studio-review-save"
          >
            {busy ? "Saving…" : "Save review"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
        >
          Cancel
        </button>
      </div>
    </PanelCard>
  );
}