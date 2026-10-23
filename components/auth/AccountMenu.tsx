"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "./AccountProvider";
import { AccountAvatar } from "./AccountAvatar";
import { clearStoredDraft } from "@/lib/profileDraft";

/**
 * The authenticated navigation control: an avatar at the far right that opens
 * a keyboard-accessible account menu.
 *
 * Accessibility is handled explicitly rather than by a `<details>` element,
 * because the menu has real focus management to do:
 *
 *   - the trigger toggles with Enter/Space natively (it is a `<button>`);
 *   - Escape closes and returns focus to the trigger;
 *   - Tab out closes;
 *   - a click outside closes;
 *   - `aria-expanded` / `aria-haspopup` / `aria-controls` describe the state.
 *
 * The menu is rendered inline rather than in a portal, positioned absolutely
 * against the nav's right edge, so it inherits the nav's tokens and cannot be
 * clipped by an ancestor's `overflow`.
 */
export function AccountMenu() {
  const { status, user, signOut } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes and restores focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  // Move focus into the menu when it opens, so a keyboard user is not left
  // behind on the trigger.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      "a, button:not([disabled])",
    );
    first?.focus();
  }, [open]);

  // Sign out.
  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      /*
       * Clear the guest draft on sign-out.
       *
       * Otherwise the next person to use this browser opens the Studio as a
       * guest and finds the previous owner's work — a real privacy problem on
       * a shared machine.
       */
      clearStoredDraft();
      close();
      // Full navigation so the server sees the cleared session cookie.
      window.location.assign("/");
    } finally {
      setSigningOut(false);
      void router;
    }
  }

  if (status !== "authenticated") return null;

  const username = user?.user_metadata?.username as string | undefined;
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const email = user?.email ?? "";
  const label = username ?? displayName ?? "Account";

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-menu"
        aria-label="Account menu"
        data-testid="account-menu-trigger"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 ease-soft hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
      >
        <AccountAvatar username={label} palette="iris" size={32} />
      </button>

      {open ? (
        <div
          id="account-menu"
          ref={menuRef}
          role="menu"
          aria-label="Account"
          data-testid="account-menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-glow"
        >
          <div className="border-b border-[var(--line-soft)] px-4 py-3">
            <p className="truncate text-[13px] font-medium text-[var(--text-strong)]">
              {displayName || label}
            </p>
            {email ? (
              <p className="truncate text-[12px] text-[var(--text-muted)]">
                {email}
              </p>
            ) : null}
          </div>

          <div className="py-1">
            <Link
              href="/studio"
              role="menuitem"
              onClick={close}
              data-testid="account-menu-studio"
              className="block px-4 py-2 text-[13px] text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
            >
              Edit profile
            </Link>
            <Link
              href="/account"
              role="menuitem"
              onClick={close}
              data-testid="account-menu-account"
              className="block px-4 py-2 text-[13px] text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
            >
              Account settings
            </Link>
          </div>

          <div className="border-t border-[var(--line-soft)] py-1">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={signingOut}
              data-testid="account-menu-signout"
              className="block w-full px-4 py-2 text-left text-[13px] text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}