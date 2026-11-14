"use client";

/**
 * The notification centre.
 *
 * Phase 9 — the list of things that happened to the signed-in account.
 *
 * IT IS A CLIENT ISLAND BECAUSE THREE THINGS CHANGE IN PLACE
 *
 *   - a notification is marked read, and the unread count falls;
 *   - a notification is dismissed, and it leaves the list;
 *   - older notifications are loaded, and the list grows.
 *
 * None of those is a navigation, so none of them should cost a page load.
 *
 * THE SERVER OWNS THE LIST
 *
 * The first page comes from the server, in the page component, so the list is
 * on the screen before any JavaScript runs. This component only handles what
 * happens AFTER that: the next page, and the two state changes.
 *
 * THE UNREAD COUNT IS SHARED
 *
 * The navigation's badge and this list have to agree about how many
 * notifications are unread. They read the same number from the same place —
 * `NotificationCountProvider` — so marking something read here lowers the
 * badge there without a reload.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { NotificationItem, NotificationType } from "@/lib/supabase/notifications";
import { useNotificationCount } from "@/components/notifications/NotificationCountProvider";

/** What the centre needs to know. */
export interface NotificationCenterProps {
  /** The first page, from the server. */
  initialNotifications: NotificationItem[];
  /** The offset for the next page, or `null` when the list is exhausted. */
  initialNextOffset: number | null;
}

/**
 * The icon for each kind of event.
 *
 * A small line drawing rather than an emoji: the notification centre is part
 * of PRSME's visual identity, and a row of emoji would read as a generic
 * dashboard rather than as PRSME.
 */
function IconFor({ type }: { type: NotificationType }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-4 w-4",
    "aria-hidden": true as const,
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (type) {
    case "comment":
      // A speech bubble.
      return (
        <svg {...common}>
          <path d="M20 13.5a3 3 0 0 1-3 3H8l-4 3.5v-13a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
        </svg>
      );

    case "follow_request":
      // A person with a question mark — a request, not yet granted.
      return (
        <svg {...common}>
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4 20c0-3.1 2.7-5.4 6-5.4.7 0 1.4.1 2 .3" />
          <path d="M18 13v4M18 19.5v.5" />
        </svg>
      );

    case "follow_accepted":
      // A person with a tick.
      return (
        <svg {...common}>
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4 20c0-3.1 2.7-5.4 6-5.4 1.6 0 3 .5 4.1 1.3" />
          <path d="M16 15.5l2 2 3.5-4" />
        </svg>
      );

    case "follow_declined":
      // A person with a cross.
      return (
        <svg {...common}>
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4 20c0-3.1 2.7-5.4 6-5.4 1.6 0 3 .5 4.1 1.3" />
          <path d="M16 16l4 4M20 16l-4 4" />
        </svg>
      );

    default:
      // A person — somebody followed.
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c0-3.4 2.9-5.9 6.5-5.9s6.5 2.5 6.5 5.9" />
        </svg>
      );
  }
}

/**
 * A relative time, in the compact form a notification list wants.
 *
 * "just now", "4m", "3h", "2d", then a date. The list is read at a glance,
 * so the exact minute matters less than how long ago it was.
 */
export function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * The event on its own, without the actor.
 *
 * The database writes the description as the actor's handle followed by what
 * happened — "p9grace followed you." — because a notification has to read
 * the same without a JOIN.
 *
 * The row shows the actor on its own line, with the event under it, so the
 * handle is taken off the front of the description. Printing both would say
 * the same thing twice.
 *
 * The prefix is matched EXACTLY rather than guessed at. If the wording ever
 * changes, the whole description is shown instead of a truncated fragment, so
 * the row is never left saying less than it should.
 */
function eventText(body: string, actorUsername: string): string {
  if (actorUsername && body.startsWith(actorUsername)) {
    const rest = body.slice(actorUsername.length).trim();
    if (rest) return rest;
  }
  return body;
}

export function NotificationCenter({
  initialNotifications,
  initialNextOffset,
}: NotificationCenterProps) {
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { setUnreadCount } = useNotificationCount();

  // Adopt a new first page when the server re-renders the page.
  useEffect(() => {
    setItems(initialNotifications);
    setNextOffset(initialNextOffset);
  }, [initialNotifications, initialNextOffset]);

  /*
   * THE COUNT IS THE SERVER'S, NOT THE LIST'S
   *
   * The list is paged — it shows the first twenty of however many there are
   * — so counting the unread rows on screen would give the wrong answer as
   * soon as there were more notifications than fit on one page.
   *
   * So the server reports the count after every change, and the badge takes
   * that number.
   */
  const act = useCallback(
    async (action: "read" | "dismiss", id: string) => {
      setError(null);

      const response = await fetch(
        `/api/notifications?action=${action}&id=${encodeURIComponent(id)}`,
        { method: "PATCH" },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        unreadCount?: number;
        error?: string;
      };

      if (!payload.ok) {
        setError(payload.error ?? "That did not work. Try again.");
        return;
      }

      if (typeof payload.unreadCount === "number") {
        setUnreadCount(payload.unreadCount);
      }

      if (action === "read") {
        // Marked read in place. The row stays where it is.
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        );
        return;
      }

      // Dismissed. The row leaves the list.
      setItems((current) => current.filter((item) => item.id !== id));
    },
    [setUnreadCount],
  );

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/notifications?offset=${nextOffset}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        notifications?: NotificationItem[];
        nextOffset?: number | null;
        error?: string;
      };

      if (!payload.ok || !payload.notifications) {
        setError(payload.error ?? "Could not load more notifications.");
        return;
      }

      setItems((current) => [...current, ...payload.notifications!]);
      setNextOffset(payload.nextOffset ?? null);
    } catch {
      setError("Could not load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextOffset, loadingMore]);

  const markAllRead = useCallback(async () => {
    setError(null);

    const response = await fetch("/api/notifications?action=read-all", {
      method: "PATCH",
    });
    const payload = (await response.json()) as {
      ok: boolean;
      unreadCount?: number;
      error?: string;
    };

    if (!payload.ok) {
      setError(payload.error ?? "That did not work. Try again.");
      return;
    }

    if (typeof payload.unreadCount === "number") {
      setUnreadCount(payload.unreadCount);
    }

    setItems((current) => current.map((item) => ({ ...item, read: true })));
  }, [setUnreadCount]);

  const hasUnread = items.some((item) => !item.read);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
            Account
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50">
            Notifications
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
            What has happened to your account — who followed you, who asked to,
            and what became of it.
          </p>
        </div>

        {hasUnread ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={pending}
            data-testid="notifications-mark-all-read"
            className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] font-medium text-muted-100 transition-colors hover:border-iris-400/40 disabled:opacity-50"
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 text-[13px] text-[#E8A0A4]"
          data-testid="notifications-error"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div
          className="mt-8 rounded-lg border border-line-soft bg-ink-800/40 p-8 text-center"
          data-testid="notifications-empty"
        >
          <p className="font-display text-xl text-muted-50">
            Nothing has happened yet.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-400">
            When somebody follows you, asks to follow a private profile, or
            comments on your profile, it will show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-2" data-testid="notifications-list">
          {items.map((item) => (
            <li key={item.id}>
              <div
                className={
                  item.read
                    ? "flex items-start gap-3 rounded-lg border border-line-soft bg-ink-800/20 p-3"
                    : "flex items-start gap-3 rounded-lg border border-iris-400/25 bg-ink-800/60 p-3"
                }
                data-testid="notification-item"
                data-read={item.read ? "true" : "false"}
                data-type={item.type}
              >
                {!item.read ? (
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-iris-400"
                    data-testid="notification-unread-dot"
                  />
                ) : null}

                <span
                  className="mt-0.5 shrink-0 text-muted-400"
                  aria-hidden
                >
                  <IconFor type={item.type} />
                </span>

                <Link
                  href={item.href}
                  onClick={() => {
                    // Reading is a side effect of opening the notification,
                    // and it is not worth a failed write blocking the
                    // navigation.
                    if (!item.read) {
                      startTransition(() => {
                        void act("read", item.id);
                      });
                    }
                  }}
                  className="min-w-0 flex-1"
                  data-testid="notification-link"
                >
                  <span className="block text-[14px] leading-snug text-muted-50">
                    {eventText(item.body, item.actorUsername)}
                  </span>
                  <span className="mt-1 block text-[12px] text-muted-400">
                    @{item.actorUsername} ·{" "}
                    <time dateTime={item.createdAt}>
                      {formatNotificationTime(item.createdAt)}
                    </time>
                  </span>
                </Link>

                <span className="flex shrink-0 items-center gap-1">
                  {!item.read ? (
                    <button
                      type="button"
                      onClick={() => void act("read", item.id)}
                      disabled={pending}
                      data-testid="notification-mark-read"
                      aria-label="Mark this notification as read"
                      className="rounded-md px-2 py-1 text-[12px] text-muted-400 transition-colors hover:text-muted-50 disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void act("dismiss", item.id)}
                    disabled={pending}
                    data-testid="notification-dismiss"
                    aria-label="Dismiss this notification"
                    className="rounded-md px-2 py-1 text-[12px] text-muted-400 transition-colors hover:text-muted-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextOffset !== null ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          data-testid="notifications-load-more"
          className="mt-6 text-[13px] text-iris-300 underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load older notifications"}
        </button>
      ) : null}

      <p className="mt-10">
        <Link
          href="/account"
          className="text-[13px] text-iris-300 underline underline-offset-4"
        >
          Back to account settings
        </Link>
      </p>
    </div>
  );
}
