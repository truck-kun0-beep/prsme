import { Artwork } from "./Artwork";
import { PrismSymbol } from "./Wordmark";
import type { Palette } from "@/lib/noirProfile";

/**
 * Profile avatar — a circular local artwork tile that doubles as a calm
 * wordmark sigil when zoomed in. No remote images.
 */
export function ProfileAvatar({
  palette,
  size = "lg",
  className = "",
  alt,
}: {
  palette: Palette;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  alt?: string;
}) {
  const sizeMap = {
    sm: { box: "h-14 w-14", symbol: "h-6 w-6" },
    md: { box: "h-20 w-20", symbol: "h-9 w-9" },
    lg: { box: "h-28 w-28 md:h-32 md:w-32", symbol: "h-12 w-12" },
    xl: { box: "h-36 w-36", symbol: "h-14 w-14" },
  } as const;
  const s = sizeMap[size];
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-white/10 shadow-ring ${s.box} ${className}`}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt}
    >
      <Artwork palette={palette} ratio="auto" className="!h-full !w-full !rounded-full" />
      <div className="absolute inset-0 grid place-items-center">
        <PrismSymbol className={`${s.symbol} mix-blend-screen opacity-80`} aria-hidden />
      </div>
    </div>
  );
}