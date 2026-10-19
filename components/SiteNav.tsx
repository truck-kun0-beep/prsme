"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { Button } from "./Button";

const navLinks = [
  { href: "#discover", label: "Discover" },
  { href: "#themes", label: "Themes" },
  { href: "#taste", label: "Taste" },
  { href: "#share", label: "Share" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50">
      {/* Soft translucent background that adapts on scroll via CSS */}
      <div className="absolute inset-0 -z-10 bg-ink-950/70 backdrop-blur-md border-b border-[var(--line-soft)]" />
      <nav
        aria-label="Primary"
        className="container-page flex h-16 items-center justify-between gap-4"
      >
        <Wordmark size="sm" />

        {/* Desktop navigation */}
        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-md px-3 py-2 text-[13px] text-muted-200 transition-colors duration-200 ease-soft hover:text-muted-50 focus-visible:outline-none focus-visible:text-muted-50"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-2 md:flex">
          <Button href="#signup" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button href="#signup" size="sm">
            Create profile
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav-panel"
          onClick={() => setOpen((v) => !v)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line-soft)] bg-ink-800/60 text-muted-100 transition-colors hover:text-muted-50 md:hidden"
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

      {/* Mobile panel */}
      <div
        id="mobile-nav-panel"
        ref={panelRef}
        hidden={!open}
        className="md:hidden border-t border-[var(--line-soft)] bg-ink-950/95 backdrop-blur-lg"
      >
        <div className="container-page py-4">
          <ul className="flex flex-col">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-3 text-base text-muted-100 hover:bg-ink-700/50 hover:text-muted-50"
                >
                  <span>{l.label}</span>
                  <span aria-hidden className="text-muted-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="my-4 hairline" />
          <div className="flex flex-col gap-2">
            <Button href="#signup" variant="secondary" size="md" className="w-full">
              Sign in
            </Button>
            <Button href="#signup" size="md" className="w-full">
              Create profile
            </Button>
            <p className="pt-2 text-[12px] text-muted-400">
              Account flows arrive in a later phase — these buttons show the
              intended destination.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}