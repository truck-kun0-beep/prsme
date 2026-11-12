"use client";

/**
 * Phase 8 — the social panel on a profile.
 *
 * Shows the follower count, the following count, the follow button, and the
 * owner's own controls. It is a client island because the button has to
 * change state without a page reload.
 *
 * THERE IS NO FRIENDS BUTTON, AND THERE IS NO FRIEND COUNT.
 *
 * The model is one-way: following somebody does not make them follow you
 * back, and nothing here treats a mutual pair as a relationship of its own.
 *
 * THE BUTTON HAS FOUR STATES, AND THEY COME FROM THE DATABASE
 *
 *   Follow      no relationship
 *   Following   the caller is an accepted follower
 *   Requested   the caller has a pending request
 *   Cancel      the caller has a pending request and can withdraw it
 *
 * The state is NEVER guessed from local state. It is read from
 * `profile_summary`, which reports what the database holds, and it is only
 * updated after a write the server confirmed.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useAccount } from "@/components/auth/AccountProvider";
import type { FollowState } from "@/lib/supabase/social";

/** What the panel needs to know, all of it decided on the server. */
export interface SocialPanelProps {
  /** The profile's username. */
  username: string;
  /** The number of accepted followers. */
  followerCount: number;
  /** The number of accounts the profile follows. */
  followingCount: number;
  /** The caller's relationship with the profile. */
  state: FollowState;
  /** Whether this is the caller's own profile. */
  isSelf: boolean;
  /** Whether the caller has blocked this account. */
  blocked?: boolean;
  /** Whether the caller may remove this account from their follower list. */
  canRemoveFollower?: boolean;
  /** Called after a successful action, so the page can refresh its counts. */
  onChanged?: (next: FollowState) => void;
}

/** The label the button shows for each state. */
function labelFor(state: FollowState): string {
  switch (state) {
    case "accepted":
      return "Following";
    case "pending":
      return "Requested";
    default:
      return "Follow";
  }
}

export function SocialPanel({
  username,
  followerCount,
  followingCount,
  state,
  isSelf,
  blocked = false,
  canRemoveFollower = false,
  onChanged,
}: SocialPanelProps) {
  const { status } = useAccount();
  const [current, setCurrent] = useState<FollowState>(state);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt a new server-rendered state when the page re-renders.
  useEffect(() => {
    setCurrent(state);
  }, [state]);

  const act = useCallback(
    async (method: "POST" | "DELETE") => {
      setError(null);
      try {
        const response = await fetch(
          `/api/social?username=${encodeURIComponent(username)}`,
          { method, headers: { "content-type": "application/json" } },
        );
        const payload = (await response.json()) as {
          ok: boolean;
          state?: FollowState;
          error?: string;
        };

        if (!payload.ok || !payload.state) {
          setError(payload.error ?? "That did not work. Try again.");
          return;
        }

        // Only adopt the new state once the server confirmed it.
        setCurrent(payload.state);
        onChanged?.(payload.state);
      } catch {
        setError("That did not work. Try again.");
      }
    },
    [username, onChanged],
  );

  const signedIn = status === "authenticated";
  const isPending = current === "pending";

  return (
    <div className="mt-4" data-testid="social-panel">
      <dl
        className="pf-stats"
        data-testid="profile-social-stats"
        aria-label="Follower and following counts"
      >
        <div className="pf-stat">
          <dt className="pf-stat-label">
            <Link
              href={`/u/${username}/followers`}
              className="pf-link underline underline-offset-4"
              data-testid="profile-followers-link"
            >
              Followers
            </Link>
          </dt>
          <dd className="pf-stat-value" data-testid="profile-followers">
            {formatCount(followerCount)}
          </dd>
        </div>
        <div className="pf-stat">
          <dt className="pf-stat-label">
            <Link
              href={`/u/${username}/following`}
              className="pf-link underline underline-offset-4"
              data-testid="profile-following-link"
            >
              Following
            </Link>
          </dt>
          <dd className="pf-stat-value" data-testid="profile-following">
            {formatCount(followingCount)}
          </dd>
        </div>
      </dl>

      {!isSelf && signedIn ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {blocked ? (
            <p className="pf-meta" data-testid="social-blocked-note">
              You have blocked this account.
            </p>
          ) : (
            <>
              {isPending ? (
                <button
                  type="button"
                  onClick={() => act("DELETE")}
                  disabled={pending}
                  data-testid="follow-button"
                  aria-label={`Cancel your follow request to ${username}`}
                  className="pf-btn-secondary inline-flex h-9 items-center rounded-md border border-line-strong bg-ink-700/80 px-4 text-[13px] font-medium text-muted-50 transition-colors hover:bg-ink-600 disabled:opacity-50"
                >
                  Cancel request
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      void act(current === "accepted" ? "DELETE" : "POST");
                    })
                  }
                  disabled={pending}
                  data-testid="follow-button"
                  aria-label={
                    current === "accepted"
                      ? `Unfollow ${username}`
                      : `Follow ${username}`
                  }
                  className={
                    current === "accepted"
                      ? "pf-btn-secondary inline-flex h-9 items-center rounded-md border border-line-strong bg-ink-700/80 px-4 text-[13px] font-medium text-muted-50 transition-colors hover:bg-ink-600 disabled:opacity-50"
                      : "pf-btn-primary inline-flex h-9 items-center rounded-md bg-iris-400 px-4 text-[13px] font-medium text-ink-950 transition-colors hover:bg-iris-300 disabled:opacity-50"
                  }
                >
                  {labelFor(current)}
                </button>
              )}

              {canRemoveFollower && current === "accepted" ? (
                <RemoveFollowerControl
                  username={username}
                  onRemoved={() => {
                    setCurrent("none");
                    onChanged?.("none");
                  }}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="pf-meta mt-2 text-[#E8A0A4]"
          data-testid="social-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The owner's control for removing a follower.
 *
 * Deliberately a separate action from "unfollow", because it is a different
 * person's decision: the owner removing somebody else.
 */
function RemoveFollowerControl({
  username,
  onRemoved,
}: {
  username: string;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/follow-requests?username=${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "Could not remove that follower.");
        return;
      }
      onRemoved();
    } catch {
      setError("Could not remove that follower.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        data-testid="remove-follower"
        aria-label={`Remove ${username} from your followers`}
        className="pf-meta underline underline-offset-4 transition-colors hover:text-muted-50 disabled:opacity-50"
      >
        Remove follower
      </button>
      {error ? (
        <span role="alert" className="pf-meta text-[#E8A0A4]">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Compact count formatting: 1284 → "1,284", 12000 → "12K". */
function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) {
    return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  }
  if (Math.abs(n) >= 10_000) {
    return `${trimZero((n / 1_000).toFixed(0))}K`;
  }
  return n.toLocaleString("en-US");
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}
