"use client";

/**
 * The notification bell in the navigation.
 *
 * Phase 9 — one icon, at the far right of the authenticated navigation, with
 * a small badge when there is something unread.
 *
 * THE BADGE IS SMALL ON PURPOSE
 *
 * The brief asks for "a small badge rather than an oversized indicator", and
 * there is a reason beyond taste: a large badge displaces the navigation
 * around it, and a number that large reads as a number of PROBLEMS rather
 * than a number of notifications. The badge is a dot-sized marker with a
 * count inside it, and past nine it becomes "9+".
 *
 * THERE IS ONE ICON
 *
 * The bell appears in the desktop navigation and in the mobile panel, and it
 * is the SAME control in both — rendered by this component in both places —
 * so a signed-in visitor never sees two notification icons on one screen.
 */

import Link from "next/link";
import { useNotificationCount } from "./NotificationCountProvider";

/**
 * The badge's number.
 *
 * Past nine it says "9+", because a badge wide enough for a four-digit count
 * would be the oversized indicator the brief rules out.
 */
function formatBadge(count: number): string {
  if (count <= 0) return "";
  if (count > 9) return "9+";
  return String(count);
}

export function NotificationBell() {
  const { unreadCount } = useNotificationCount();
  const badge = formatBadge(unreadCount);

  return (
    <Link
      href="/account/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      data-testid="nav-notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-100 transition-colors duration-200 ease-soft hover:bg-ink-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
        <path d="M13.7 19a2 2 0 0 1-3.4 0" />
      </svg>

      {badge ? (
        <span
          data-testid="nav-notifications-badge"
          className="absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-iris-400 px-1 text-[10px] font-semibold leading-[16px] text-ink-950"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
