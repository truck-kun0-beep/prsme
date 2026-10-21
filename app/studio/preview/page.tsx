/**
 * /studio/preview — same-origin iframe host.
 *
 * Renders the customised public profile for @noir inside the
 * `.profile-scope` so the studio can preview it at any chosen viewport.
 * Because this is a real route, the embedded document responds to media
 * queries at the iframe's CSS width — a 390 px iframe genuinely triggers
 * the mobile profile layout, including the sticky site nav, the
 * single-column header, and the touch-friendly shelf.
 *
 * State is sent from the parent (StudioClient) via `postMessage` of the
 * shape `{ type: "prsme-preview-state", draft: ProfileDraft | null }`. The
 * parent also forwards a `prsme-preview-reload` message when the user
 * wants the iframe to re-resolve theme tokens from a fresh URL parameter
 * (used by the "Open preview" button so the new tab opens with the same
 * unsaved state).
 *
 * The iframe also reads `localStorage["prsme:profile-draft:v1"]` on its
 * own to honour the no-connection fallback so it can be opened directly
 * (e.g. by sharing the URL) and still show the last saved state.
 */

import { PreviewFrameClient } from "./PreviewFrameClient";

/**
 * The route is dynamic to prevent any chance of being cached as a static
 * page (which would freeze the draft at build time).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Preview · PRSME",
  robots: { index: false, follow: false },
};

export default function StudioPreviewPage() {
  return <PreviewFrameClient />;
}