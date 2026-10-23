"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { Button } from "./Button";
import { useAccount } from "./auth/AccountProvider";
import { AccountMenu } from "./auth/AccountMenu";

/**
 * The primary navigation.
 *
 * Phase 6 — three entries, and each one goes somewhere real:
 *
 *   - **Discover Reviews** → `/discover`. The real review-discovery page.
 *   - **Themes** → the landing page's themes section. The link is
 *     route-aware: on the landing page it is the in-page anchor `#themes`,
 *     and from any other route it is `/#themes`, so clicking Themes from
 *     `/discover` still lands on the themes section rather than doing nothing.
 *   - **About** → `/about`.
 *
 * "Taste" and "Share" were removed from the primary navigation. Sharing
 * remains an action on an individual profile (the Share button in the profile
 * header), and "Taste" was not a clear destination name for what is now the
 * Discover Reviews page.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { status } = useAccount();
  const pathname = usePathname();

  /*
   * The themes link is `#themes` on the landing page and `/#themes` from
   * anywhere else. A bare `#themes` on another route would look for a
   * fragment on that route's own page — where no such fragment exists — and
   * the click would appear to do nothing.
   */
  const onLandingPage = pathname === "/";
  const themesHref = onLandingPage ? "#themes" : "/#themes";

  const navLinks = [
    { href: "/discover", label: "Discover Reviews" },
    { href: themesHref, label: "Themes" },
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
                  <Button href="/studio" variant="secondary" size="md" className="w-full">
                    Edit profile
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
