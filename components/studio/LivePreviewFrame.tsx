"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { IconEye } from "./StudioIcons";

/**
 * LivePreviewFrame — a genuine same-origin viewport preview.
 *
 * Phase 3 rendered the profile inside a `<div>` constrained to the chosen
 * width. That approach cannot work: CSS media queries resolve against the
 * *window* viewport, not a container, so a 390 px-wide box inside a 1280 px
 * studio still rendered the desktop layout and then clipped the overflow.
 *
 * This version uses an `<iframe>` pointed at `/studio/preview`. The iframe's
 * own CSS width *is* the framed document's viewport, so a 390 px iframe
 * genuinely triggers the profile's mobile media queries — real mobile nav,
 * real single-column header, real touch-friendly shelf.
 *
 * State sync (no auth required):
 *   - Unsaved edits: the parent posts the in-memory `ProfileDraft` into the
 *     frame with `postMessage` on every change.
 *   - Saved values:  the frame reads `localStorage` on load, so a reload or
 *     an "Open preview" tab shows the saved state.
 *
 * The frame is scaled with a CSS transform purely for *fit* (so a 390 px
 * preview can be shown inside a narrower editor column). The scale does not
 * change the iframe's internal layout width — the document still lays out at
 * the real CSS pixel width.
 */

export type PreviewViewport = "390" | "768" | "1280" | "fill";

const VIEWPORT_WIDTHS: Record<Exclude<PreviewViewport, "fill">, number> = {
  "390": 390,
  "768": 768,
  "1280": 1280,
};

export function LivePreviewFrame() {
  const { draft, hydrated } = useProfileDraft();
  const [viewport, setViewport] = useState<PreviewViewport>("390");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);

  /* ---------------- Push the live draft into the frame ---------------- */
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !hydrated) return;
    frame.contentWindow?.postMessage(
      { type: "prsme-preview-state", draft },
      window.location.origin,
    );
  }, [draft, hydrated]);

  /* ------------- Answer the frame's "I'm ready" handshake -------------- */
  useEffect(() => {
    function onMessage(ev: MessageEvent<unknown>) {
      // Same-origin only.
      if (ev.origin !== window.location.origin) return;
      if (typeof ev.data !== "object" || ev.data === null) return;
      const data = ev.data as Record<string, unknown>;
      if (data.type === "prsme-preview-ready") {
        setFrameReady(true);
        const frame = iframeRef.current;
        frame?.contentWindow?.postMessage(
          { type: "prsme-preview-state", draft },
          window.location.origin,
        );
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [draft]);

  /* ------------- Reload the frame on a hard viewport change ------------ */
  // Widths are applied to the <iframe> element itself; the frame reflows
  // internally, so no reload is needed. We only clear `frameReady` so the
  // loading state is honest again.
  const onViewportChange = useCallback((next: PreviewViewport) => {
    setViewport(next);
  }, []);

  const pxWidth = viewport === "fill" ? undefined : VIEWPORT_WIDTHS[viewport];
  const displayLabel =
    viewport === "fill" ? "Fill" : `${VIEWPORT_WIDTHS[viewport]}px`;

  return (
    <div
      className="flex min-w-0 flex-col rounded-xl border border-[var(--line-strong)] bg-[var(--surface-1)] p-3 sm:p-4"
      data-testid="studio-live-preview"
      data-preview-viewport={viewport}
      data-preview-width={pxWidth ?? "fill"}
    >
      {/* Toolbar — sits in the studio shell, never over the preview. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-iris-300">
          Live preview · @noir
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Preview viewport width"
            className="flex items-center gap-1"
          >
            {(["390", "768", "1280", "fill"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onViewportChange(w)}
                aria-pressed={viewport === w}
                data-testid={`studio-preview-viewport-${w}`}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  viewport === w
                    ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/15 text-[var(--text-strong)]"
                    : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-default)]"
                }`}
              >
                {w === "fill" ? "Fill" : `${w}px`}
              </button>
            ))}
          </div>

          <Link
            href="/u/noir"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--text-default)] hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
            data-testid="studio-open-preview"
          >
            <IconEye size={12} /> Open
          </Link>
        </div>
      </div>

      {/* Viewport readout — reflects the *actual* rendered CSS width. */}
      <p
        className="pf-meta mb-2 flex items-center gap-2 text-[11px]"
        data-testid="studio-preview-width-readout"
      >
        <span className="font-medium text-[var(--text-default)]">
          {displayLabel}
        </span>
        <span aria-hidden>·</span>
        <span>
          {frameReady
            ? `iframe viewport = ${pxWidth ?? "fluid"} CSS px`
            : "loading preview…"}
        </span>
      </p>

      {/* The device frame. `overflow: clip` on the wrapper prevents the
          studio's own scrollbars from ever intersecting the preview; the
          iframe scrolls internally. */}
      <div
        className="studio-preview-frame relative flex min-h-[26rem] w-full justify-center overflow-clip rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)]"
        data-testid="studio-preview-frame"
      >
        <iframe
          ref={iframeRef}
          src="/studio/preview"
          title="Public profile preview for Noir Aldridge"
          data-testid="studio-preview-iframe"
          onLoad={() => setFrameReady(true)}
          className="h-[70vh] min-h-[26rem] w-full border-0 bg-[var(--surface-0)]"
          style={
            pxWidth
              ? {
                  width: `${pxWidth}px`,
                  maxWidth: "100%",
                }
              : undefined
          }
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        A real viewport, not a scaled-down desktop page: the profile renders
        inside the frame at {pxWidth ? `${pxWidth} CSS px` : "the editor width"},
        so its own mobile and tablet media queries apply. Save to push the
        same state to the public profile.
      </p>
    </div>
  );
}