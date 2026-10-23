"use client";

/**
 * Phase 6 — the review writer.
 *
 * A review form with TWO explicit actions: **Save draft** and **Publish**.
 *
 * Why two buttons rather than one "Save":
 *
 * A single save button has to guess whether the owner meant to publish, and
 * every such guess is wrong for somebody. Saving a half-written review and
 * having it appear in the public feed is the specific failure the brief
 * rules out — "do not accidentally publish a partially written review just
 * because its form was saved". With two explicit actions, publishing is
 * something the owner does on purpose.
 *
 * The state machine, in full:
 *
 *   - **Draft** — saved to the database with `status: 'draft'`. Visible to
 *     the author alone. The public feed and the media page never show it.
 *   - **Published** — saved with `status: 'published'`. Visible to the public
 *     if the author's profile is public.
 *
 * A failed write NEVER shows a published state. The confirmation only
 * appears once the server has confirmed the write, and a failure says
 * plainly what happened and leaves the text in the form so nothing is lost.
 */

import { useMemo, useState } from "react";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import type { MediaItem } from "@/lib/supabase/reviews";

export interface ReviewFormState {
  rating: number | null;
  title: string;
  body: string;
  spoiler: boolean;
}

export const REVIEW_BODY_MAX = 4_000;
export const REVIEW_TITLE_MAX = 140;

/** An empty form. */
export function emptyReviewForm(): ReviewFormState {
  return { rating: null, title: "", body: "", spoiler: false };
}

export type ReviewWriteStatus = "draft" | "published";

export interface ReviewWriteOutcome {
  ok: boolean;
  status?: ReviewWriteStatus;
  error?: string;
}

export interface ReviewValidation {
  ok: boolean;
  message?: string;
}

/**
 * What is savable at all.
 *
 * A completely empty form is rejected — a blank review card helps nobody.
 * A rating on its own IS savable, because rating without writing is a
 * legitimate thing to do.
 */
export function validateReviewForm(form: ReviewFormState): ReviewValidation {
  if (form.rating === null && !form.title.trim() && !form.body.trim()) {
    return {
      ok: false,
      message: "Add a rating, a headline, or some notes before saving.",
    };
  }
  if (form.body.length > REVIEW_BODY_MAX) {
    return {
      ok: false,
      message: `Notes are capped at ${REVIEW_BODY_MAX.toLocaleString()} characters.`,
    };
  }
  if (form.title.length > REVIEW_TITLE_MAX) {
    return {
      ok: false,
      message: `Headline is capped at ${REVIEW_TITLE_MAX} characters.`,
    };
  }
  return { ok: true };
}

/**
 * The review form.
 *
 * `onSave` is called with the intended publication state, so the parent
 * decides whether the write is a draft or a publish — and the parent is the
 * only thing that talks to the server.
 */
export function ReviewWriter({
  media,
  form,
  onChange,
  onSave,
  busy,
  status,
  error,
  compact = false,
}: {
  media: MediaItem;
  form: ReviewFormState;
  onChange: (next: ReviewFormState) => void;
  onSave: (status: ReviewWriteStatus) => void;
  /** True while a write is in flight. */
  busy: boolean;
  /** The status the last successful write produced. */
  status: ReviewWriteStatus | null;
  /** The message from the last failed write. */
  error: string | null;
  /** A denser layout, used in the media page's side panel. */
  compact?: boolean;
}) {
  const validation = useMemo(() => validateReviewForm(form), [form]);
  const remaining = REVIEW_BODY_MAX - form.body.length;
  const canPublish = validation.ok;

  return (
    <div className="surface-card p-4 sm:p-5" data-testid="review-writer">
      <div className="flex gap-3">
        <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md">
          <Artwork
            palette="iris"
            src={media.artworkUrl}
            alt={`${media.title} cover`}
            ratio="2/3"
            className="!rounded-none"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-strong)]">
            {media.title}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
            {[
              media.creator,
              media.year,
              media.kind === "movie"
                ? "Film"
                : media.kind === "tv"
                  ? "TV series"
                  : media.kind === "song"
                    ? "Song"
                    : media.kind === "album"
                      ? "Album"
                      : media.kind === "manga"
                        ? "Manga"
                        : "Book",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12px] font-medium text-[var(--text-default)]">
          Your rating
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((value) => {
            const selected = form.rating === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({ ...form, rating: selected ? null : value })
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
          {form.rating !== null ? (
            <span className="ml-2 inline-flex items-center gap-2">
              <RatingBadge value={form.rating} size="sm" />
            </span>
          ) : null}
        </div>
      </fieldset>

      <div className="mt-4">
        <label
          htmlFor="review-headline"
          className="block text-[12px] font-medium text-[var(--text-default)]"
        >
          Headline <span className="text-[var(--text-faint)]">(optional)</span>
        </label>
        <input
          id="review-headline"
          type="text"
          value={form.title}
          maxLength={REVIEW_TITLE_MAX}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="One line that captures your take"
          className="mt-1.5 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none"
        />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="review-notes"
            className="block text-[12px] font-medium text-[var(--text-default)]"
          >
            Notes
          </label>
          <span className="text-[11px] text-[var(--text-faint)]">
            {remaining.toLocaleString()} characters remaining
          </span>
        </div>
        <textarea
          id="review-notes"
          rows={compact ? 5 : 7}
          value={form.body}
          maxLength={REVIEW_BODY_MAX}
          onChange={(e) => onChange({ ...form, body: e.target.value })}
          placeholder="What stayed with you?"
          className="mt-1.5 w-full resize-y rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none"
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--text-default)]">
        <input
          type="checkbox"
          checked={form.spoiler}
          onChange={(e) => onChange({ ...form, spoiler: e.target.checked })}
          className="h-3.5 w-3.5 accent-[var(--accent-400)]"
        />
        Mark as spoiler
      </label>

      {!validation.ok &&
      form.title.trim().length + form.body.trim().length > 0 ? (
        <p className="mt-3 text-[12px] text-[color:#D6757B]" role="alert">
          {validation.message}
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-3 rounded-md border border-[color:#D6757B]/40 bg-[color:#D6757B]/10 px-3 py-2 text-[12px] text-[color:#E8A0A4]"
          role="alert"
          data-testid="review-writer-error"
        >
          {error}
        </p>
      ) : null}

      {status ? (
        <p
          className="mt-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-default)]"
          role="status"
          data-testid="review-writer-status"
        >
          {status === "published"
            ? "Published. Your review is live on your profile and the media page."
            : "Draft saved. Only you can see it — publish it when you're ready."}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSave("draft")}
          disabled={busy || !validation.ok}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
          data-testid="review-save-draft"
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={() => onSave("published")}
          disabled={busy || !canPublish}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3.5 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)] disabled:opacity-50"
          data-testid="review-publish"
        >
          {busy ? "Publishing…" : "Publish review"}
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
        A draft is visible only to you. Publishing shares your review with
        anyone who can see your profile.
      </p>
    </div>
  );
}
