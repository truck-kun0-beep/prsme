import Link from "next/link";

type Size = "sm" | "md" | "lg";

interface WordmarkProps {
  size?: Size;
  asLink?: boolean;
  className?: string;
  ariaLabel?: string;
}

const sizeMap: Record<Size, { text: string; symbol: string }> = {
  sm: { text: "text-[15px]", symbol: "h-5 w-5" },
  md: { text: "text-[18px]", symbol: "h-6 w-6" },
  lg: { text: "text-[26px]", symbol: "h-8 w-8" },
};

export function Wordmark({
  size = "md",
  asLink = true,
  className = "",
  ariaLabel = "PRSME — home",
}: WordmarkProps) {
  const sz = sizeMap[size];
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <PrismSymbol className={sz.symbol} aria-hidden />
      <span
        className={`${sz.text} font-semibold tracking-[0.18em] text-muted-50`}
      >
        PRSME
      </span>
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link
      href="/"
      aria-label={ariaLabel}
      className="group inline-flex items-center gap-2 rounded-sm focus-visible:outline-none"
    >
      {inner}
    </Link>
  );
}

export function PrismSymbol({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="prsme-prism" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4F4F6" />
          <stop offset="35%" stopColor="#C8B8FF" />
          <stop offset="65%" stopColor="#8C6CFF" />
          <stop offset="100%" stopColor="#4730A0" />
        </linearGradient>
      </defs>
      {/* Outer rounded square — brand mark container */}
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="10"
        fill="#0B0B10"
        stroke="url(#prsme-prism)"
        strokeWidth="1.2"
      />
      {/* Inner prism — a stylized prismatic "P" peak */}
      <path
        d="M10 11 L17 30 L20 22 L23 30 L30 11"
        fill="none"
        stroke="url(#prsme-prism)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="1.6" fill="#C8B8FF" />
    </svg>
  );
}