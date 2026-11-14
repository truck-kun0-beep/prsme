/**
 * The notification centre's data layer.
 *
 * Phase 9 — a signed-in account's notifications: who did what, when, and
 * where to go to see it.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not CREATE notifications. Notifications are written by database
 * triggers, in the same transaction as the action that caused them — see
 * `supabase/migrations/20250101000015_notifications.sql`. That is what makes
 * a notification exist only when the relationship or comment actually
 * succeeded, and what makes a retried statement produce one notification
 * rather than two.
 *
 * So this module is entirely about READING and about the two state changes a
 * recipient may make on their own notifications: marking one read, and
 * dismissing one.
 *
 * THE PRIVACY RULE
 *
 * A notification never carries the content of the thing it points at. A
 * comment notification says WHO commented, not WHAT they said, because the
 * comment itself is readable only by the people the profile's own rules allow
 * — and the notification is a summary, not a copy.
 *
 * The one thing a notification does carry is the actor's HANDLE, and the
 * database froze that handle into the row when the event happened. A handle is
 * public by construction: the database keeps it unique, and the availability
 * check tells every visitor that a name is taken without telling them who
 * holds it. Freezing it means the notification reads the same whether or not
 * the actor's profile is visible to the recipient — and it means the
 * notification does not have to JOIN the profiles table, which would leak (or
 * hide) the actor's display name through the profile's RLS.
 */

import { getServerClient } from "./server";
import { getCurrentUserId } from "./session";
import { isSupabaseConfigured } from "./config";

/* -------------------------------------------------------------------------- */
/*                                    Types                                    */
/* -------------------------------------------------------------------------- */

/**
 * The kinds of event a notification can carry.
 *
 * This list mirrors the database's CHECK constraint exactly. The database is
 * the authority — a value outside this set cannot exist in the table — but
 * keeping the two in step means the interface can be exhaustive about the
 * cases it renders.
 */
export type NotificationType =
  /** Somebody followed a public account. */
  | "follow"
  /** Somebody asked to follow a private account. */
  | "follow_request"
  /** A follow request was approved. */
  | "follow_accepted"
  /** A follow request was declined. */
  | "follow_declined"
  /** Somebody commented on a profile. */
  | "comment";

/** The event types, as a runtime-checkable list. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "follow",
  "follow_request",
  "follow_accepted",
  "follow_declined",
  "comment",
];

/** How many notifications one page holds. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** One notification, as the interface needs it. */
export interface NotificationItem {
  /** The notification's own id. */
  id: string;
  /** The kind of event. */
  type: NotificationType;
  /** The one-line description, written by the database. */
  body: string;
  /** When the event happened. */
  createdAt: string;
  /** Whether the recipient has read it. */
  read: boolean;
  /** The actor's handle, frozen when the event happened. */
  actorUsername: string;
  /** Where clicking the notification goes. */
  href: string;
}

/** One page of notifications. */
export interface NotificationPage {
  notifications: NotificationItem[];
  /** The offset for the next page, or `null` when the list is exhausted. */
  nextOffset: number | null;
}

/** The result of a write on a notification. */
export interface NotificationActionResult {
  ok: boolean;
  reason?: string;
  message?: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where a notification points.
 *
 * Each event has a different destination, and every one of them is a place
 * the recipient is already allowed to be:
 *
 *   - a comment      -> the profile the comment sits on;
 *   - a request      -> the follow-request queue, for the owner;
 *   - a resolution   -> the account the request was about;
 *   - a follow       -> the follower's profile.
 *
 * A notification never links to something the recipient cannot open. The link
 * is a navigation hint, not a grant of access — the destination applies its
 * own rules.
 *
 * A COMMENT points at the RECIPIENT's own profile, because the recipient is
 * the profile's owner: the comment sits on their profile, and that is where
 * they read it.
 */
function hrefFor(
  type: NotificationType,
  actorUsername: string,
  targetUsername: string,
): string {
  switch (type) {
    case "comment":
      /*
       * The comment sits on the RECIPIENT's profile — they are its owner — so
       * that is where they go to read it.
       *
       * It does not point at the commenter's profile: the comment is not
       * there, and the event was never about the commenter.
       */
      return `/u/${targetUsername}`;

    case "follow_request":
      // The owner resolves the request from their own queue.
      return "/account/requests";

    case "follow_accepted":
    case "follow_declined":
      // The requester looks at the account they asked to follow.
      return `/u/${actorUsername}`;

    default:
      // Somebody followed the recipient: go and see who.
      return `/u/${actorUsername}`;
  }
}

/**
 * Narrow a database value to a known event type.
 *
 * The database's CHECK constraint already guarantees the value is one of the
 * five, but a type assertion would be a claim rather than a check — and a
 * notification from a future migration that this build has not caught up with
 * should be skipped, not rendered as something it is not.
 */
function toNotificationType(value: unknown): NotificationType | null {
  return NOTIFICATION_TYPES.includes(value as NotificationType)
    ? (value as NotificationType)
    : null;
}

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

/**
 * A page of the caller's notifications, newest first.
 *
 * The query is scoped to the caller's own rows, and the database's RLS
 * policy scopes it again — so a caller cannot reach anybody else's
 * notifications even by crafting a request.
 *
 * Dismissed notifications are excluded. They stay in the database as a record
 * of what happened, but they are not on the list.
 */
export async function listNotifications(
  options: { limit?: number; offset?: number } = {},
): Promise<NotificationPage> {
  const empty: NotificationPage = { notifications: [], nextOffset: null };
  if (!isSupabaseConfigured()) return empty;

  const userId = await getCurrentUserId();
  if (!userId) return empty;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return empty;

  const limit = Math.min(Math.max(options.limit ?? NOTIFICATION_PAGE_SIZE, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, body, created_at, read_at, actor_username, target_username")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return empty;

  const rows = data as Array<{
    id: string;
    type: string;
    body: string;
    created_at: string;
    read_at: string | null;
    actor_username: string;
    target_username: string;
  }>;

  const notifications: NotificationItem[] = [];

  for (const row of rows) {
    const type = toNotificationType(row.type);
    if (!type) continue;

    notifications.push({
      id: row.id,
      type,
      body: row.body,
      createdAt: row.created_at,
      read: row.read_at !== null,
      actorUsername: row.actor_username,
      href: hrefFor(type, row.actor_username, row.target_username),
    });
  }

  /*
   * There are more notifications when the page came back full.
   *
   * The count is not asked for separately: an exact count is another query
   * and another round-trip, and the list only needs to know whether to offer
   * a "load more" button.
   */
  const nextOffset = rows.length === limit ? offset + limit : null;

  return { notifications, nextOffset };
}

/**
 * How many notifications the caller has not read.
 *
 * The count comes from the database with a `head: true` request, so no rows
 * cross the wire — the badge needs a number, not a list.
 */
export async function countUnreadNotifications(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("dismissed_at", null);

  if (error || typeof count !== "number") return 0;
  return count;
}

/* -------------------------------------------------------------------------- */
/*                                   Writes                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mark one notification as read.
 *
 * The write is scoped to the caller's own rows, so a caller cannot mark
 * somebody else's notification read — the RLS policy refuses the update and
 * the row count comes back zero.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  /*
   * No row came back.
   *
   * That is not necessarily a failure. The notification may have been
   * already read, in which case marking it read again is a no-op and the
   * caller is in exactly the state they asked for. The important case is the
   * one RLS refuses: another account's notification, which the policy hides
   * from the update entirely.
   */
  if (!data) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id, read_at")
      .eq("id", notificationId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, reason: "not-found", message: "That notification is not here." };
    }
  }

  return { ok: true };
}

/**
 * Mark every unread notification as read.
 *
 * Dismissed notifications are left alone: they are off the list, and a
 * dismissed notification is not one the recipient is being reminded of.
 */
export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .is("dismissed_at", null);

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true };
}

/**
 * Dismiss one notification.
 *
 * Dismissing is not deleting. The row stays, with `dismissed_at` set, so the
 * record of what happened is not lost by tidying the list — it is simply no
 * longer shown.
 */
export async function dismissNotification(
  notificationId: string,
): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, reason: "not-authenticated", message: "You need to be signed in." };
  }

  const supabase = await getServerClient({ canSetCookies: false });
  if (!supabase) {
    return { ok: false, reason: "not-configured", message: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", notificationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  if (!data) {
    return { ok: false, reason: "not-found", message: "That notification is not here." };
  }

  return { ok: true };
}
