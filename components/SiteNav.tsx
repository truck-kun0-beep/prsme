"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { Button } from "./Button";
import { useAccount } from "./auth/AccountProvider";
import { AccountMenu } from "./auth/AccountMenu";
import { NotificationBell } from "./notifications/NotificationBell";

/**
 * The primary navigation.
 *
 * PRE-PHASE 11 — three entries, and each one goes somewhere real:
 *
 *   - **Discover** → `/discover`. The real review-discovery page. It used to
 *     be called "Discover Reviews"; the product is the discovery surface
 *     itself, so the label is now just "Discover".
 *   - **List** → `/list`. The signed-in user's personal media queue. A guest
 *     who follows it is sent to sign-in with a return path, rather than being
 *     shown a broken page.
 *   - **About** → `/about`.
 *
 * THEMES IS NOT A NAVIGATION ENTRY ANY MORE.
 *
 * Themes used to have their own primary entry. They are now a section of the
 * About page (`/about#themes`), because a theme is a description of the
 * product rather than a destination of its own — and a four-item primary
 * navigation on a three-item product is a navigation that misrepresents the
 * shape of the product.
 *
 * Old `/themes` links still work: that route redirects to `/about#themes`.
 *
 * "Taste" and "Share" were removed earlier. Sharing remains an action on an
 * individual profile (the Share button in the profile header).
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { status, username } = useAccount();

  const navLinks = [
    { href: "/discover", label: "Discover" },
    { href: "/list", label: "List" },
    { href: "/about", label: "About" },
  ];

  /*
   * Phase 5 — a signed-in visitor gets an avatar, not two buttons.
   *
   * `status` starts as "loading" (or "unconfigured" with no Supabase project),
   * and the signed-out CTAs render during that window so the nav never flashes
   * an empty gap. Once the session resolves to authenticated they are replaced
   * by the single account menu — one avatar at the far right, no duplicate
   * controls at either width.
   */
  const isAuthenticated = status === "authenticated";

  /*
   * The signed-in account's own public profile.
   *
   * The handle is the real one from the `profiles` table — resolved by the
   * account provider — and never a hardcoded demo slug. Before it resolves,
   * `profileHref` is null and the "View profile" button is simply absent
   * rather than pointing somewhere wrong.
   */
  const profileHref = username ? `/u/${username}` : null;

  // Lock body scroll when the mobile panel is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="site-nav sticky top-0 z-50">
      {/* The scrim sits behind the nav so blur/contrast is consistent. */}
      <div
        aria-hidden
        className="site-nav-scrim absolute inset-0 -z-10 backdrop-blur-md border-b"
      />
      <nav
        aria-label="Primary"
        className="profile-canvas flex h-16 items-center justify-between gap-4"
      >
        <Wordmark size="sm" />

        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="site-nav-link rounded-md px-3 py-2 text-[13px] transition-colors duration-200 ease-soft"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/*
         * Phase 9 — the notification bell.
         *
         * It lives in the HEADER, and not in the mobile panel, so that there
         * is exactly ONE bell at every width.
         *
         * The panel would be a second place to look for the same control. A
         * visitor who opened it on a phone would see the bell twice — or,
         * if the header's copy were hidden at small widths, would have to
         * guess that the panel was where the notifications lived.
         *
         * The header is on screen at every width, so one bell here is one
         * bell everywhere.
         */}
        {isAuthenticated ? <NotificationBell /> : null}

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <>
              <Button href="/sign-in" variant="ghost" size="sm">
                Sign in
              </Button>
              <Button href="/sign-up" size="sm">
                Create profile
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav-panel"
          onClick={() => setOpen((v) => !v)}
          className="site-nav-toggle relative inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            aria-hidden
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="8" x2="20" y2="8" />
                <line x1="4" y1="16" x2="20" y2="16" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div
          id="mobile-nav-panel"
          ref={panelRef}
          className="site-nav-panel md:hidden border-t"
        >
          <div className="profile-canvas py-4">
            <ul className="flex flex-col">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="site-nav-mobile-link flex items-center justify-between rounded-md px-3 py-3 text-base"
                  >
                    <span>{l.label}</span>
                    <span aria-hidden className="site-nav-mobile-arrow">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="site-nav-divider my-4" />
            <div className="flex flex-col gap-2">
              {isAuthenticated ? (
                <>
                  {/*
                   * PRE-PHASE 11 — the prominent action is "View profile",
                   * pointing at the owner's own public page. The handle is the
                   * real one from the `profiles` table, never a hardcoded
                   * demo. The editor is one tap below it.
                   */}
                  {profileHref ? (
                    <Button href={profileHref} variant="secondary" size="md" className="w-full">
                      View profile
                    </Button>
                  ) : null}
                  <Button href="/studio" variant="secondary" size="md" className="w-full">
                    Customize profile
                  </Button>
                  <Button href="/account" size="md" className="w-full">
                    Account settings
                  </Button>
                  {/*
                   * The avatar is NOT repeated here. It lives in the header at
                   * every width — duplicating it inside the mobile panel would
                   * give a signed-in visitor two account controls on one screen.
                   */}
                </>
              ) : (
                <>
                  <Button href="/sign-in" variant="secondary" size="md" className="w-full">
                    Sign in
                  </Button>
                  <Button href="/sign-up" size="md" className="w-full">
                    Create profile
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
