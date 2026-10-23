import type { SVGProps } from "react";

/**
 * Tiny, hand-rolled social brand glyphs. Inline SVG so we don't ship extra
 * files and don't depend on a third-party icon kit. Stays visually consistent
 * with the rest of the PRSME outline / mono-tone direction.
 */

type SocialPlatform = "facebook" | "instagram" | "snapchat" | "linkedin";

const platformLabel: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
};

function FacebookGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.4 21v-7.6h2.55l.38-2.96H13.4V8.63c0-.86.24-1.44 1.47-1.44h1.57V4.5a21 21 0 0 0-2.29-.12c-2.27 0-3.82 1.39-3.82 3.93v2.13H7.78v2.96h2.55V21h3.07Z" />
    </svg>
  );
}
function InstagramGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      {...props}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
/*
 * Phase 4.7 — the Snapchat ghost was replaced; the previous path was not merely
 * ugly, it was geometrically wrong.
 *
 * The old path used a huge arc (`A36 36`) to close the body back to its start,
 * which swept the curve far outside the 24x24 viewBox. Measured, the outline
 * started 5.85 units left of x=0 and ran 1.41 units past y=24, so the SVG
 * viewport clipped the left flank and the bottom rim. The same flaw made the
 * shape 13.44 units of left/right asymmetry and left its centre 4.27 units off
 * x=12 — which is why it never lined up with the Facebook, Instagram, and
 * LinkedIn glyphs sitting beside it.
 *
 * The replacement is a plain path with no arc flag. Every control point on the
 * left half is the 24-x mirror of its counterpart on the right, so the outline
 * is point-symmetric by construction rather than by eye; verified via
 * getBBox()/getTotalLength(), it measures 17x17.6 inside the box, centred on
 * x=12, with 0 asymmetry. The two dots are the ghost's face and are placed on
 * the same mirror axis, so they mirror each other too.
 */
function SnapchatGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <path d="M12 2.8C16.1 2.8 20.5 5.7 20.5 10.6c0 3.4-.8 6-1.9 7.4-.5.7-1.2 1.5-2.1 1.5-1.9 0-2.7-2.3-4.5.9C10.2 17.2 9.4 19.5 7.5 19.5c-.9 0-1.6-.8-2.1-1.5C4.3 16.6 3.5 14 3.5 10.6 3.5 5.7 7.9 2.8 12 2.8Z" />
      <circle cx="9.3" cy="11.4" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11.4" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
function LinkedInGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M4.6 8.5h2.6V19H4.6V8.5Zm1.3-4.2a1.5 1.5 0 1 1 0 3.1 1.5 1.5 0 0 1 0-3.1ZM9.2 8.5h2.5v1.43h.04c.35-.66 1.2-1.36 2.46-1.36 2.63 0 3.12 1.73 3.12 3.97V19h-2.6v-5.55c0-1.32-.02-3.02-1.84-3.02-1.85 0-2.13 1.44-2.13 2.93V19H9.2V8.5Z" />
    </svg>
  );
}

export function SocialIcon({
  platform,
  className = "h-4 w-4",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  switch (platform) {
    case "facebook":
      return <FacebookGlyph className={className} />;
    case "instagram":
      return <InstagramGlyph className={className} />;
    case "snapchat":
      return <SnapchatGlyph className={className} />;
    case "linkedin":
      return <LinkedInGlyph className={className} />;
  }
}

export function SocialPlatformLabel({
  platform,
}: {
  platform: SocialPlatform;
}): string {
  return platformLabel[platform];
}
