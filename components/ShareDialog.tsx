"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { PrismSymbol } from "./Wordmark";

type ShareStatus = "idle" | "copied" | "shared" | "failed";

/**
 * Share Profile dialog. Implements:
 *  - Web Share API when available
 *  - Clipboard copy as the primary fallback
 *  - Manual-select fallback when the clipboard API also fails
 *  - Close on Escape, click-outside, or explicit close button
 *  - Focus return to the trigger when closed
 */
export function ShareDialog({
  displayName,
  username,
  url,
  open,
  onClose,
  triggerRef,
}: {
  displayName: string;
  username: string;
  url: string;
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const title = `${displayName} on PRSME`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const [status, setStatus] = useState<ShareStatus>("idle");
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    setNativeAvailable(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Lock body scroll while open & auto-focus the close button for keyboard users
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the close button so Esc and Tab land somewhere sensible
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Click-outside dismissal
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!dialogRef.current) return;
      if (!dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, onClose]);

  // Restore focus on close
  useEffect(() => {
    if (open) return;
    // Defer to next frame so the trigger is interactive again
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [open, triggerRef]);

  const tryCopy = useCallback(async (): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      /* fall through to legacy fallback */
    }
    // Legacy fallback: select + document.execCommand
    try {
      const input = urlInputRef.current;
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
        const ok = document.execCommand?.("copy");
        if (ok) return true;
      }
    } catch {
      /* swallow */
    }
    return false;
  }, [url]);

  const handleCopy = useCallback(async () => {
    setStatus("idle");
    const ok = await tryCopy();
    setStatus(ok ? "copied" : "failed");
  }, [tryCopy]);

  const handleShare = useCallback(async () => {
    setStatus("idle");
    if (!nativeAvailable) {
      // Fallback: copy + status
      const ok = await tryCopy();
      setStatus(ok ? "copied" : "failed");
      return;
    }
    try {
      await navigator.share({ title, text: `${displayName} (@${username}) on PRSME`, url });
      setStatus("shared");
    } catch (err) {
      // User cancellation is not a failure; surface it honestly only when really needed.
      const aborted =
        err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError");
      if (aborted) {
        setStatus("idle");
      } else {
        const ok = await tryCopy();
        setStatus(ok ? "copied" : "failed");
      }
    }
  }, [displayName, nativeAvailable, title, tryCopy, url, username]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" aria-hidden />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--line-strong)] bg-ink-900 shadow-card"
      >
        <div className="flex items-start gap-3 border-b border-[var(--line-soft)] px-5 py-4">
          <PrismSymbol className="h-7 w-7 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg text-muted-50">
              Share {displayName}&apos;s profile
            </h2>
            <p id={descId} className="text-[12px] text-muted-400">
              @{username} · prsme.app/{username}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] text-muted-200 transition-colors hover:border-iris-400/40 hover:text-muted-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label htmlFor={`share-url-${username}`} className="block text-[11px] uppercase tracking-[0.18em] text-muted-400">
            Profile link
          </label>
          <input
            id={`share-url-${username}`}
            ref={urlInputRef}
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="block h-11 w-full rounded-md border border-[var(--line-soft)] bg-ink-800/80 px-3 font-mono text-[13px] text-muted-50 focus:border-iris-400/60 focus:outline-none"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-iris-400 px-4 text-sm font-medium text-ink-950 shadow-glow transition-transform duration-200 ease-soft hover:-translate-y-0.5 hover:bg-iris-300"
            >
              <span aria-hidden>📋</span>
              <span>Copy link</span>
            </button>
            {nativeAvailable && (
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-ink-700/80 px-4 text-sm font-medium text-muted-50 transition-colors hover:border-iris-400/40 hover:text-muted-50"
              >
                <span aria-hidden>↗</span>
                <span>Share via…</span>
              </button>
            )}
          </div>

          <p
            className={`min-h-[1.25rem] text-[12px] ${
              status === "failed"
                ? "text-rose-300"
                : status === "copied" || status === "shared"
                ? "text-iris-300"
                : "text-muted-400"
            }`}
            role="status"
            aria-live="polite"
          >
            {status === "idle" &&
              "Pick Copy link to put the URL on your clipboard. Share via… opens your device's share sheet when available."}
            {status === "copied" && "Link copied to clipboard."}
            {status === "shared" && "Shared."}
            {status === "failed" &&
              "We couldn't access the clipboard. The link is selected above — copy it manually with ⌘/Ctrl + C."}
          </p>
        </div>
      </div>
    </div>
  );
}