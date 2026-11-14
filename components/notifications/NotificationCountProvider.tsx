"use client";

/**
 * The unread notification count, shared by the navigation badge and the
 * notification centre.
 *
 * Phase 9 — the badge in the navigation and the list in the centre have to
 * agree. Without a shared source, marking a notification read in the centre
 * would leave the badge showing a stale number until the next full page
 * load, which is exactly the kind of small wrongness that makes an interface
 * feel untrustworthy.
 *
 * THE PROVIDER OWNS THE COUNT
 *
 * It is the ONE place the number lives, and it is always the SERVER's
 * number. Nothing here counts rows to guess at it:
 *
 *   - on mount, the provider asks the server how many are unread;
 *   - after a read or a dismissal, the server reports the new count and the
 *     provider adopts it.
 *
 * That matters because the centre's list is PAGED. A list that shows the
 * first twenty of ninety notifications cannot work out how many of the ninety
 * are unread — it can only see the twenty in front of it. So the count is
 * never derived from the list; the list is derived from the count's world.
 *
 * THE PROVIDER IS OPTIONAL
 *
 * `useNotificationCount` returns a neutral value when no provider is
 * mounted, so a component rendered outside it — a test harness, a standalone
 * island — degrades to "no badge" rather than throwing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "@/components/auth/AccountProvider";

interface NotificationCountValue {
  /** How many notifications are unread. */
  unreadCount: number;
  /** Report a new count. */
  setUnreadCount: (count: number) => void;
}

const NotificationCountContext = createContext<NotificationCountValue | null>(
  null,
);

export function NotificationCountProvider({
  children,
  initialCount = 0,
}: {
  children: ReactNode;
  /** The count, when the server already knows it. */
  initialCount?: number;
}) {
  const { status } = useAccount();
  const [unreadCount, setUnreadCountState] = useState(initialCount);

  // A count that never goes negative: a dismissal and a read can race, and
  // the badge should not show "-1".
  const setUnreadCount = useCallback((count: number) => {
    setUnreadCountState((current) => Math.max(0, count));
  }, []);

  /*
   * Read the count once the session is known.
   *
   * Not before: an anonymous visitor has no notifications, and asking would
   * be a request that could only ever be refused.
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/notifications?count=1", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as { unreadCount?: number };
        if (cancelled) return;

        if (typeof payload.unreadCount === "number") {
          setUnreadCount(payload.unreadCount);
        }
      } catch {
        // A badge that does not load is a missing badge, not a broken page.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, setUnreadCount]);

  const value = useMemo<NotificationCountValue>(
    () => ({ unreadCount, setUnreadCount }),
    [unreadCount, setUnreadCount],
  );

  return (
    <NotificationCountContext.Provider value={value}>
      {children}
    </NotificationCountContext.Provider>
  );
}

/**
 * The unread count, and a way to change it.
 *
 * Returns a neutral value when no provider is mounted.
 */
export function useNotificationCount(): NotificationCountValue {
  const ctx = useContext(NotificationCountContext);
  if (ctx) return ctx;
  return { unreadCount: 0, setUnreadCount: () => {} };
}
