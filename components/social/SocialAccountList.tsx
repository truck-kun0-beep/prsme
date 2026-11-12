"use client";

/**
 * The list of accounts on one side of a follow edge.
 *
 * A plain, accessible list: each entry is a link to the account's profile,
 * with the display name, the handle, and the avatar when there is one.
 *
 * THERE IS NO "PEOPLE YOU MIGHT KNOW" AND NO SUGGESTIONS. The list is
 * exactly the accounts on one side of the edge — nothing more.
 *
 * The avatar is a short-lived SIGNED URL, minted per request on the server.
 * A stored path is never handed to the browser: the bucket is private, and a
 * path is not a credential.
 */

import Link from "next/link";
import { ProfileAvatar } from "@/components/ProfileAvatar";

export interface SocialAccountEntry {
  userId: string;
  username: string;
  displayName: string;
  /** A short-lived signed URL, or `null` when there is no avatar. */
  avatarUrl: string | null;
}

export interface SocialAccountListProps {
  accounts: SocialAccountEntry[];
  /** What to say when the list is empty. */
  emptyLabel: string;
}

export function SocialAccountList({
  accounts,
  emptyLabel,
}: SocialAccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="profile-canvas py-10 md:py-14">
        <p className="pf-body text-[14px] text-muted-400" data-testid="social-list-empty">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="profile-canvas py-10 md:py-14">
      <ul
        className="flex flex-col divide-y divide-[var(--pf-border)]"
        data-testid="social-account-list"
      >
        {accounts.map((account) => (
          <li key={account.userId} data-testid="social-account-item">
            <Link
              href={`/u/${account.username}`}
              className="flex items-center gap-4 py-4 transition-opacity hover:opacity-80"
            >
              <ProfileAvatar
                palette="iris"
                dataUrl={account.avatarUrl}
                size="md"
                alt={`${account.displayName}'s avatar`}
              />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-muted-50">
                  {account.displayName}
                </span>
                <span className="pf-meta block truncate">@{account.username}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
