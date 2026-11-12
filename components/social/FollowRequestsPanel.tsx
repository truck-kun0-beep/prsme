"use client";

/**
 * The follow-request area.
 *
 * Two lists: the requests other people have sent to you, and the requests you
 * have sent that are still open.
 *
 * THERE IS NO FRIENDS TAB AND NO FRIEND COUNT. This is a queue for one-way
 * follows, and nothing else.
 *
 * The owner's decision is Approve or Decline. The requester's is Cancel.
 */

import { useState } from "react";
import Link from "next/link";
import { ProfileAvatar } from "@/components/ProfileAvatar";

interface RequestAccount {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface RequestEntry {
  id: string;
  requestedAt: string;
  account: RequestAccount;
}

export interface FollowRequestsPanelProps {
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
}

export function FollowRequestsPanel({
  incoming: initialIncoming,
  outgoing: initialOutgoing,
}: FollowRequestsPanelProps) {
  const [incoming, setIncoming] = useState<RequestEntry[]>(initialIncoming);
  const [outgoing, setOutgoing] = useState<RequestEntry[]>(initialOutgoing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(
    username: string,
    action: "accept" | "decline",
  ) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/follow-requests?username=${encodeURIComponent(username)}${
          action === "decline" ? "&action=decline" : ""
        }`,
        { method: action === "accept" ? "POST" : "DELETE" },
      );
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "That request could not be updated.");
        return;
      }
      setIncoming((current) =>
        current.filter((entry) => entry.account.username !== username),
      );
    } catch {
      setError("That request could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(username: string) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/social?username=${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "That request could not be withdrawn.");
        return;
      }
      setOutgoing((current) =>
        current.filter((entry) => entry.account.username !== username),
      );
    } catch {
      setError("That request could not be withdrawn.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <main id="main" className="container-page py-12 md:py-16">
        <div className="mx-auto w-full max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
            Account
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50">
            Follow requests
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
            Requests to follow a private profile wait for that account&apos;s
            owner to approve them. Following is one-way — nobody is added to
            your following list automatically.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-5 text-[13px] text-[#E8A0A4]"
              data-testid="requests-error"
            >
              {error}
            </p>
          ) : null}

          <section className="mt-8">
            <h2 className="text-[13px] font-medium text-muted-50">
              Requests to follow you
            </h2>
            {incoming.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-400" data-testid="incoming-empty">
                No pending requests.
              </p>
            ) : (
              <ul className="mt-3 space-y-3" data-testid="incoming-list">
                {incoming.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-ink-800/40 p-3"
                    data-testid="incoming-item"
                  >
                    <Link
                      href={`/u/${entry.account.username}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <ProfileAvatar
                        palette="iris"
                        dataUrl={entry.account.avatarUrl}
                        size="sm"
                        alt={`${entry.account.displayName}'s avatar`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] text-muted-50">
                          {entry.account.displayName}
                        </span>
                        <span className="block truncate text-[12px] text-muted-400">
                          @{entry.account.username}
                        </span>
                      </span>
                    </Link>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void respond(entry.account.username, "accept")}
                        disabled={busy}
                        data-testid="request-accept"
                        className="rounded-md bg-iris-400 px-3 py-1.5 text-[12px] font-medium text-ink-950 transition-colors hover:bg-iris-300 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void respond(entry.account.username, "decline")}
                        disabled={busy}
                        data-testid="request-decline"
                        className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-muted-100 transition-colors hover:border-iris-400/40 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-[13px] font-medium text-muted-50">
              Requests you have sent
            </h2>
            {outgoing.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-400" data-testid="outgoing-empty">
                No open requests.
              </p>
            ) : (
              <ul className="mt-3 space-y-3" data-testid="outgoing-list">
                {outgoing.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-ink-800/40 p-3"
                    data-testid="outgoing-item"
                  >
                    <Link
                      href={`/u/${entry.account.username}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <ProfileAvatar
                        palette="iris"
                        dataUrl={entry.account.avatarUrl}
                        size="sm"
                        alt={`${entry.account.displayName}'s avatar`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] text-muted-50">
                          {entry.account.displayName}
                        </span>
                        <span className="block truncate text-[12px] text-muted-400">
                          @{entry.account.username}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void cancel(entry.account.username)}
                      disabled={busy}
                      data-testid="request-cancel"
                      className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-muted-100 transition-colors hover:border-iris-400/40 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-10">
            <Link
              href="/account"
              className="text-[13px] text-iris-300 underline underline-offset-4"
            >
              Back to account settings
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
