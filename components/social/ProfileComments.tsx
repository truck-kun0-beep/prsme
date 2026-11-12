"use client";

/**
 * Phase 8 — the comments on a profile.
 *
 * A simple, non-threaded comment section: a list, a composer, and per-comment
 * controls for the author (edit, delete) and the profile owner (delete,
 * report).
 *
 * THERE IS NO THREADING AND NO DIRECT MESSAGING. A comment is a comment.
 *
 * THE RULES THE UI ENFORCES
 *
 *   - a comment is PLAIN TEXT. The body is rendered as a text node, never as
 *     markup, and the server refuses anything that looks like a tag;
 *   - an empty comment is refused, and so is one over 1,000 characters;
 *   - only approved followers may comment on a PRIVATE profile — the server
 *     decides that, and this component reflects the answer rather than
 *     guessing at it;
 *   - the author may edit and delete their own comment; the profile owner may
 *     delete any comment on their profile.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/auth/AccountProvider";
import { COMMENT_MAX } from "@/lib/supabase/socialConstants";

/** One comment, as the server reported it. */
export interface CommentItem {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  isOnOwnProfile: boolean;
}

export interface ProfileCommentsProps {
  /** The profile's username. */
  username: string;
  /** The profile owner's display name, for the empty state. */
  displayName: string;
  /** Whether the profile is private. */
  isPrivate?: boolean;
  /** The initial page, rendered on the server so there is no flash. */
  initialComments?: CommentItem[];
  /** The offset for the next page, or `null` when there are no more. */
  nextOffset?: number | null;
  /** Whether the signed-in visitor may comment at all. */
  canComment?: boolean;
  /** Why the visitor may not comment, when they may not. */
  commentDisabledReason?: string;
}

export function ProfileComments({
  username,
  displayName,
  isPrivate = false,
  initialComments = [],
  nextOffset: initialNextOffset = null,
  canComment = false,
  commentDisabledReason,
}: ProfileCommentsProps) {
  const { status } = useAccount();
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    setComments(initialComments);
    setNextOffset(initialNextOffset);
  }, [initialComments, initialNextOffset]);

  const signedIn = status === "authenticated";

  const post = useCallback(async () => {
    setError(null);
    setNotice(null);

    const body = draft.trim();
    if (!body) {
      setError("Write something first.");
      return;
    }
    if (body.length > COMMENT_MAX) {
      setError(`Comments are capped at ${COMMENT_MAX.toLocaleString()} characters.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/comments?username=${encodeURIComponent(username)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        comment?: CommentItem;
        error?: string;
      };

      if (!payload.ok || !payload.comment) {
        setError(payload.error ?? "Your comment could not be posted.");
        return;
      }

      setComments((current) => [payload.comment as CommentItem, ...current]);
      setDraft("");
      setNotice("Commented.");
    } catch {
      setError("Your comment could not be posted.");
    } finally {
      setBusy(false);
    }
  }, [draft, username]);

  const saveEdit = useCallback(
    async (id: string) => {
      setError(null);
      const body = editDraft.trim();
      if (!body) {
        setError("A comment cannot be empty.");
        return;
      }

      setBusy(true);
      try {
        const response = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          comment?: CommentItem;
          error?: string;
        };

        if (!payload.ok || !payload.comment) {
          setError(payload.error ?? "That comment could not be updated.");
          return;
        }

        const updated = payload.comment;
        setComments((current) =>
          current.map((comment) => (comment.id === id ? updated : comment)),
        );
        setEditingId(null);
        setEditDraft("");
      } catch {
        setError("That comment could not be updated.");
      } finally {
        setBusy(false);
      }
    },
    [editDraft],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      setBusy(true);
      try {
        const response = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!payload.ok) {
          setError(payload.error ?? "That comment could not be deleted.");
          return;
        }
        setComments((current) => current.filter((comment) => comment.id !== id));
      } catch {
        setError("That comment could not be deleted.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (nextOffset === null) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/comments?username=${encodeURIComponent(username)}&offset=${nextOffset}`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        comments?: CommentItem[];
        nextOffset?: number | null;
        error?: string;
      };
      if (!payload.ok || !payload.comments) {
        setError(payload.error ?? "Could not load more comments.");
        return;
      }
      setComments((current) => [...current, ...payload.comments as CommentItem[]]);
      setNextOffset(payload.nextOffset ?? null);
    } catch {
      setError("Could not load more comments.");
    } finally {
      setBusy(false);
    }
  }, [nextOffset, username]);

  const report = useCallback(async (commentId: string) => {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentId, reason: "spam" }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "The report could not be filed.");
        return;
      }
      setNotice("Reported. Thank you.");
    } catch {
      setError("The report could not be filed.");
    }
  }, []);

  return (
    <section
      aria-labelledby="comments-heading"
      className="profile-canvas pf-section"
      data-testid="comments-section"
    >
      <header className="mb-6 md:mb-7">
        <p className="pf-eyebrow">Comments</p>
        <h2 id="comments-heading" className="pf-display mt-2.5 text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]">
          What people say.
        </h2>
      </header>

      {signedIn && canComment ? (
        <div className="mb-6">
          <label htmlFor="comment-draft" className="pf-meta block">
            Leave a comment
          </label>
          <textarea
            id="comment-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={COMMENT_MAX}
            rows={3}
            placeholder="Say something kind."
            data-testid="comment-input"
            className="pf-body mt-2 w-full resize-y rounded-md border border-line-strong bg-ink-900/60 px-3 py-2 text-[14px] text-muted-50 placeholder:text-muted-500 focus:border-iris-400/50 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void post()}
              disabled={busy}
              data-testid="comment-submit"
              className="pf-btn-primary inline-flex h-9 items-center rounded-md bg-iris-400 px-4 text-[13px] font-medium text-ink-950 transition-colors hover:bg-iris-300 disabled:opacity-50"
            >
              Post comment
            </button>
            <span className="pf-meta">
              {draft.length}/{COMMENT_MAX.toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}

      {signedIn && !canComment ? (
        <p className="pf-body mb-6 text-[13px] text-muted-400" data-testid="comment-disabled">
          {commentDisabledReason ??
            (isPrivate
              ? "Only approved followers can comment on a private profile."
              : "You cannot comment on this profile.")}
        </p>
      ) : null}

      {!signedIn ? (
        <p className="pf-body mb-6 text-[13px] text-muted-400">
          Sign in to leave a comment.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="pf-meta mb-4 text-[#E8A0A4]" data-testid="comment-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="pf-meta mb-4 text-emerald-200" data-testid="comment-notice">
          {notice}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <p className="pf-body text-[14px] text-muted-400" data-testid="comments-empty">
          No comments yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-5" data-testid="comments-list">
          {comments.map((comment) => (
            <li key={comment.id} className="pf-body" data-testid="comment-item">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium text-muted-50">
                  {comment.authorDisplayName}
                </span>
                <span className="pf-meta">@{comment.authorUsername}</span>
                <span className="pf-meta">
                  {formatTimestamp(comment.createdAt)}
                  {comment.updatedAt !== comment.createdAt ? " · edited" : ""}
                </span>
              </div>

              {editingId === comment.id ? (
                <div className="mt-2">
                  <textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    maxLength={COMMENT_MAX}
                    rows={3}
                    aria-label={`Edit your comment on ${displayName}'s profile`}
                    data-testid="comment-edit-input"
                    className="pf-body w-full resize-y rounded-md border border-line-strong bg-ink-900/60 px-3 py-2 text-[14px] text-muted-50 focus:border-iris-400/50 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void saveEdit(comment.id)}
                      disabled={busy}
                      data-testid="comment-edit-save"
                      className="pf-btn-primary inline-flex h-8 items-center rounded-md bg-iris-400 px-3 text-[12px] font-medium text-ink-950 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                      data-testid="comment-edit-cancel"
                      className="pf-meta underline underline-offset-4"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-muted-100">
                  {comment.body}
                </p>
              )}

              {editingId !== comment.id ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-4">
                  {comment.isOwn ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditDraft(comment.body);
                        }}
                        data-testid="comment-edit"
                        className="pf-meta underline underline-offset-4 hover:text-muted-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(comment.id)}
                        disabled={busy}
                        data-testid="comment-delete"
                        className="pf-meta underline underline-offset-4 hover:text-muted-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}

                  {comment.isOnOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      disabled={busy}
                      data-testid="comment-owner-delete"
                      className="pf-meta underline underline-offset-4 hover:text-muted-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}

                  {!comment.isOwn ? (
                    <button
                      type="button"
                      onClick={() => void report(comment.id)}
                      disabled={busy}
                      data-testid="comment-report"
                      className="pf-meta underline underline-offset-4 hover:text-muted-50 disabled:opacity-50"
                    >
                      Report
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nextOffset !== null ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={busy}
          data-testid="comments-load-more"
          className="pf-meta mt-5 underline underline-offset-4 hover:text-muted-50 disabled:opacity-50"
        >
          Load more comments
        </button>
      ) : null}
    </section>
  );
}

/**
 * A short, readable timestamp.
 *
 * The `Intl` formatter is used with a fixed locale so the output does not
 * shift with the visitor's settings.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
