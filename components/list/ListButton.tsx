"use client";

/**
 * The "Add to List" bookmark control.
 *
 * PRE-PHASE 11 — My List needs a control that can appear on a Discover
 * card, a media detail page, and a search result, and that has to be
 * CORRECT about what state the item is in.
 *
 * THE STATE IS NOT GUESSED
 *
 * The caller passes `saved` explicitly rather than the component deciding.
 * The server already knows which items are on the signed-in user's list, and
 * it passes that down. A component that guessed would either show the wrong
 * state on first paint or flash from "saved" to "not saved" while a request
 * was in flight.
 *
 * GUEST BEHAVIOUR
 *
 * A guest pressing the bookmark is asked to sign in, and the item they were
 * trying to save is preserved as the post-login return path — so they come
 * back to the media page they were on. There is no fake save and no local
 * state that pretends to have saved something.
 *
 * NO DUPLICATE REQUESTS
 *
 * The button is disabled while a request is in flight, so a double-click
 * cannot produce two writes. The database would absorb the second one
 * anyway (the save is an upsert on a unique key), but a disabled button is
 * the honest UI: it shows that the first click landed.
 *
 * OPTIMISTIC UI, CORRECTLY ROLLED BACK
 *
 * The label updates immediately — the interaction must feel instant — and if
 * the write fails, the previous state is restored and the failure is said
 * out loud. A control that says "In List" when the item is not saved is
 * worse than a slow one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/auth/AccountProvider";

export interface ListButtonProps {
  /** The canonical media item's id. */
  mediaId: string;
  /** The media item's title — used in the accessible label. */
  title: string;
  /** Whether the item is currently on the signed-in user's list. */
  saved: boolean;
  /** Render the icon only, with the label as an accessible name. */
  compact?: boolean;
  /** Extra classes for the caller to position the control. */
  className?: string;
}

export function ListButton({
  mediaId,
  title,
  saved: savedProp,
  compact = false,
  className = "",
}: ListButtonProps) {
  const { status } = useAccount();
  const router = useRouter();

  const [saved, setSaved] = useState(savedProp);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt a new server-provided state (a re-render after a page refresh).
  useEffect(() => {
    setSaved(savedProp);
  }, [savedProp]);

  // A request that outlives the component must not set state on an unmounted
  // component, and must not be mistaken for a fresh one.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isSignedIn = status === "authenticated";

  const toggle = useCallback(async () => {
    if (pending) return;
    setError(null);

    if (!isSignedIn) {
      /*
       * A guest is asked to sign in, and the destination they were trying to
       * reach is preserved so they come back to it. The path is built from
       * `window.location` because the bookmark control is used on pages that
       * exist at more than one route (a media page, a Discover card), and the
       * media page is the one they were looking at.
       */
      const here =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : `/media/${mediaId}`;
      router.push(`/sign-in?next=${encodeURIComponent(here)}`);
      return;
    }

    const previous = saved;
    setPending(true);

    // Optimistic: the label changes now, and is restored if the write fails.
    setSaved(!previous);

    try {
      const response = await fetch(
        previous ? `/api/list?mediaId=${encodeURIComponent(mediaId)}` : "/api/list",
        {
          method: previous ? "DELETE" : "POST",
          headers: previous
            ? undefined
            : { "content-type": "application/json" },
          body: previous ? undefined : JSON.stringify({ mediaId }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        // Roll back to the state we came from — the write did not happen.
        if (mounted.current) setSaved(previous);
        if (mounted.current) {
          setError(payload?.error ?? "Could not update your list.");
        }
        return;
      }

      if (mounted.current) setError(null);
    } catch {
      if (mounted.current) setSaved(previous);
      if (mounted.current) setError("Could not update your list.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [isSignedIn, mediaId, pending, router, saved]);

  const label = saved ? "In List" : "Add to List";
  const accessibleLabel = saved
    ? `Remove ${title} from your list`
    : `Add ${title} to your list`;

  return (
    <span className={`inline-flex flex-col ${className}`.trim()}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={accessibleLabel}
        aria-pressed={saved}
        title={accessibleLabel}
        data-testid={`list-button-${mediaId}`}
        data-saved={saved ? "true" : "false"}
        data-pending={pending ? "true" : "false"}
        className={[
          "inline-flex items-center gap-1.5 rounded-md border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-400)]/60",
          "disabled:cursor-wait disabled:opacity-60",
          compact ? "px-2 py-1" : "px-2.5 py-1.5",
          saved
            ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/15 text-[var(--accent-300)]"
            : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent-400)]/40 hover:text-[var(--text-strong)]",
        ].join(" ")}
      >
        <BookmarkIcon filled={saved} />
        {compact ? null : (
          <span className="text-[12px] font-medium">{label}</span>
        )}
      </button>

      {/*
       * The error is announced, not just drawn: `role="status"` means a
       * screen reader says it without stealing focus.
       */}
      {error ? (
        <span
          role="status"
          className="mt-1 text-[11px] text-[#E8A0A4]"
          data-testid={`list-error-${mediaId}`}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** A bookmark glyph — filled when the item is saved. */
function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.6L6 21V4.5Z" />
    </svg>
  );
}
