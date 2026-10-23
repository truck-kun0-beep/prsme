"use client";

import { useEffect, useState } from "react";
import type { Palette } from "@/lib/noirProfile";

/**
 * Account avatar for the navigation.
 *
 * The image comes from `/api/profile/avatar-url`, which mints a short-lived
 * signed URL *after* checking the caller may see the profile. The alternative
 * — persisting a signed URL — would break on expiry and store a bearer
 * credential in the profile row, so the path is what we keep and the URL is
 * what we re-fetch.
 *
 * When there is no image, or the fetch fails, the palette art renders instead.
 * A signed-URL failure is a transient condition (token expired, network), and a
 * broken image in the nav would be far worse than the initial.
 */
export function AccountAvatar({
  username,
  palette,
  size = 32,
}: {
  username: string;
  palette: Palette;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAttempted(false);
    setUrl(null);

    void (async () => {
      try {
        const response = await fetch("/api/profile/avatar-url", {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setAttempted(true);
          return;
        }
        const payload = (await response.json()) as { url?: string };
        if (cancelled) return;
        setUrl(typeof payload.url === "string" ? payload.url : null);
        setAttempted(true);
      } catch {
        if (!cancelled) setAttempted(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username]);

  const style = { width: size, height: size };

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full border border-[var(--line-strong)] object-cover"
        style={style}
        data-testid="account-avatar-image"
      />
    );
  }

  if (!attempted) {
    // Neutral placeholder while the URL is minted — avoids a flash of the
    // wrong palette art when a custom avatar does exist.
    return (
      <span
        aria-hidden
        className="inline-block animate-pulse rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)]"
        style={style}
      />
    );
  }

  return (
    <span
      aria-hidden
      data-testid="account-avatar-fallback"
      data-palette={palette}
      className={`pf-avatar-fallback inline-flex items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] font-mono text-[var(--text-muted)]`}
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.42)) }}
    >
      {(username || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}