"use client";

/**
 * Phase 6 — the write-review panel on a media page.
 *
 * The media item is already known here: the owner arrived at this page
 * because of THIS work, so the review form is pre-filled with it and there
 * is no search step. That is the brief's requirement — "preselect the current
 * media item rather than forcing them to search for it again".
 *
 * Three states this component handles honestly:
 *
 *   - **Not signed in** — an invitation to sign in, not a broken form.
 *   - **Signed in, no review yet** — an empty form to write in.
 *   - **Signed in, review exists** — the saved content is loaded into the
 *     form, so reopening a published review shows what was actually saved,
 *     and the existing publication state is shown.
 *
 * The confirmation only appears after the server confirms the write.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/auth/AccountProvider";
import {
  ReviewWriter,
  emptyReviewForm,
  type ReviewFormState,
  type ReviewWriteStatus,
} from "@/components/reviews/ReviewWriter";
import type { MediaItem } from "@/lib/supabase/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function MediaReviewPanel({ media }: { media: MediaItem }) {
  const { status: accountStatus } = useAccount();
  const [form, setForm] = useState<ReviewFormState>(emptyReviewForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<ReviewWriteStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [existingStatus, setExistingStatus] = useState<"draft" | "published" | null>(
    null,
  );

  const authenticated = accountStatus === "authenticated";

  /*
   * Load the owner's existing review for this media item.
   *
   * The endpoint is scoped by the session, so it can only ever return the
   * caller's own review. A draft shows up here and nowhere else.
   */
  useEffect(() => {
    if (!isSupabaseConfigured() || !authenticated) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/reviews?mediaId=${encodeURIComponent(media.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          review?: {
            rating: number | null;
            title: string | null;
            body: string;
            isSpoiler: boolean;
            status: "draft" | "published";
          } | null;
        };
        if (cancelled || !payload.review) return;

        setForm({
          rating: payload.review.rating,
          title: payload.review.title ?? "",
          body: payload.review.body ?? "",
          spoiler: payload.review.isSpoiler,
        });
        setExistingStatus(payload.review.status);
      } catch {
        // A failed load is not a failed page — the owner can still write.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, media.id]);

  const onSave = useCallback(
    async (nextStatus: ReviewWriteStatus) => {
      setBusy(true);
      setError(null);
      // The success note is cleared FIRST, so a failed write can never leave
      // a stale "published" message on screen.
      setSavedStatus(null);

      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mediaId: media.id,
            rating: form.rating,
            title: form.title,
            body: form.body,
            isSpoiler: form.spoiler,
            status: nextStatus,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          setError(payload.error ?? "Your review could not be saved.");
          return;
        }

        setSavedStatus(nextStatus);
        setExistingStatus(nextStatus);
      } catch {
        setError("Network error — your review was not saved. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [form, media.id],
  );

  /* ---- Not signed in ---- */
  if (!isSupabaseConfigured()) {
    return (
      <div className="surface-card p-5" data-testid="media-review-panel-unconfigured">
        <h2 className="text-[15px] font-medium text-[var(--text-strong)]">
          Reviews need an account
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          PRSME&apos;s shared reviews live in the database. Connect a Supabase
          project to write and read them.
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="surface-card p-5" data-testid="media-review-panel-signed-out">
        <h2 className="text-[15px] font-medium text-[var(--text-strong)]">
          Write a review
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Sign in to rate {media.title} and share what you thought. Your
          review will appear on your profile too.
        </p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/media/${media.id}`)}`}
          className="mt-4 inline-flex items-center rounded-md bg-[var(--accent-400)] px-3.5 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
        >
          Sign in to review
        </Link>
      </div>
    );
  }

  /* ---- Signed in ---- */
  return (
    <div className="space-y-3">
      {existingStatus ? (
        <p
          className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-muted)]"
          data-testid="media-review-existing-state"
        >
          {existingStatus === "published"
            ? "You have published a review of this. Editing it below updates the same review."
            : "You have a draft for this. Publish it when you're ready."}
        </p>
      ) : null}

      <ReviewWriter
        media={media}
        form={form}
        onChange={(next) => {
          setForm(next);
          setSavedStatus(null);
        }}
        onSave={onSave}
        busy={busy}
        status={savedStatus}
        error={error}
        compact
      />

      {!loaded ? (
        <p className="text-[11px] text-[var(--text-faint)]">Loading your review…</p>
      ) : null}
    </div>
  );
}
