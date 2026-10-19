import type { CSSProperties } from "react";

type Palette =
  | "amber"
  | "iris"
  | "rose"
  | "cyan"
  | "forest"
  | "sand"
  | "mono"
  | "violet"
  | "rust";

const paletteStops: Record<Palette, [string, string, string]> = {
  amber: ["#3A2A12", "#A07736", "#F2D49A"],
  iris: ["#1A1244", "#4730A0", "#C8B8FF"],
  rose: ["#3A0F1F", "#9D2F5A", "#F4B7C8"],
  cyan: ["#0F2A33", "#2E7C8A", "#A7E0EA"],
  forest: ["#0E1F14", "#2E6B3F", "#B7D9B7"],
  sand: ["#2E241A", "#8B7355", "#E5D2B1"],
  mono: ["#0E0E12", "#3A3A45", "#BFBFC9"],
  violet: ["#1A0F2E", "#5C2EA0", "#D3B7F2"],
  rust: ["#2A140A", "#94431F", "#E8A57A"],
};

interface ArtworkProps {
  palette: Palette;
  label?: string;
  className?: string;
  ratio?: "1/1" | "2/3" | "3/4" | "4/5" | "16/9" | "21/9" | "auto";
  variant?: "cover" | "tile";
  children?: React.ReactNode;
}

const ratioMap: Record<NonNullable<ArtworkProps["ratio"]>, string> = {
  "1/1": "aspect-square",
  "2/3": "aspect-[2/3]",
  "3/4": "aspect-[3/4]",
  "4/5": "aspect-[4/5]",
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
  auto: "",
};

export function Artwork({
  palette,
  label,
  className = "",
  ratio = "1/1",
  variant = "cover",
  children,
}: ArtworkProps) {
  const [a, b, c] = paletteStops[palette];
  const id = `art-${palette}-${variant}`;

  const styleVars: CSSProperties = {
    ["--a" as string]: a,
    ["--b" as string]: b,
    ["--c" as string]: c,
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-md ${ratioMap[ratio]} ${className}`}
      style={styleVars}
      role="img"
      aria-label={label ?? "Sample artwork"}
    >
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--a)" />
            <stop offset="60%" stopColor="var(--b)" />
            <stop offset="100%" stopColor="var(--c)" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="30%" cy="20%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <pattern
            id={`${id}-dots`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(8)"
          >
            <circle cx="1" cy="1" r="0.6" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="200" height="200" fill={`url(#${id}-bg)`} />
        {/* Light rim */}
        <rect width="200" height="200" fill={`url(#${id}-glow)`} />

        {variant === "cover" ? (
          <>
            {/* Editorial composition — abstract prismatic shapes */}
            <circle cx="148" cy="56" r="42" fill="rgba(255,255,255,0.16)" />
            <circle cx="148" cy="56" r="22" fill="rgba(255,255,255,0.22)" />
            <path
              d="M-10 150 L80 90 L120 130 L210 60 L210 210 L-10 210 Z"
              fill="rgba(0,0,0,0.35)"
            />
            <path
              d="M-10 175 L60 130 L110 160 L210 110 L210 210 L-10 210 Z"
              fill="rgba(0,0,0,0.35)"
              opacity="0.7"
            />
          </>
        ) : (
          <>
            <rect width="200" height="200" fill={`url(#${id}-dots)`} />
            <circle
              cx="100"
              cy="100"
              r="60"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="2"
            />
            <circle cx="100" cy="100" r="6" fill="rgba(255,255,255,0.6)" />
          </>
        )}

        {/* Grain overlay */}
        <rect width="200" height="200" fill="rgba(0,0,0,0.18)" />
      </svg>
      {children}
    </div>
  );
}