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
function SnapchatGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M12 2.5c4.3 0 6.6 3 6.6 6.7 0 1.6-.05 3.05-.18 4.3.78.4 1.58.78 2.42.78.5 0 .66.66.2.93-1.5.86-2.96 1.04-3.42 1.45-.32.28-.22.92 1.05 1.95.85.69 1.78 1.18 1.78 1.61 0 .4-.36.49-1.66.7-1.4.23-1.66.32-2.04.97-.5.86-1.66 1.16-2.92 1.16-.66 0-1.27-.16-1.7-.16-.62 0-.78.4-1.8 1.34-.74.68-1.6 1.1-2.6 1.18-.99-.08-1.86-.5-2.6-1.18-1.02-.94-1.18-1.34-1.8-1.34-.43 0-1.04.16-1.7.16-1.26 0-2.42-.3-2.92-1.16-.38-.65-.64-.74-2.04-.97-1.3-.21-1.66-.3-1.66-.7 0-.43.93-.92 1.78-1.61 1.27-1.03 1.37-1.67 1.05-1.95-.46-.41-1.92-.59-3.42-1.45-.46-.27-.3-.93.2-.93.84 0 1.64-.38 2.42-.78A36 36 0 0 1 5.4 9.2c0-3.7 2.3-6.7 6.6-6.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
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
