/**
 * Personal rating chip ("My rating"). Distinct from any external service
 * score — there's no implied viewer count and no external audience average.
 */
export function RatingBadge({
  value,
  size = "md",
  withLabel = false,
  className = "",
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  withLabel?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: "h-6 px-2 text-[11px]",
    md: "h-7 px-2.5 text-[12px]",
    lg: "h-8 px-3 text-[13px]",
  } as const;
  const safe = Math.max(0, Math.min(10, value));
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-iris-400/30 bg-iris-400/10 font-mono font-medium text-iris-200 ${sizes[size]} ${className}`}
      aria-label={`My rating ${safe} out of 10`}
    >
      <span aria-hidden>★</span>
      <span>{safe.toFixed(1)}</span>
      {withLabel && (
        <span className="font-sans font-normal tracking-tight text-iris-300/80">
          / 10
        </span>
      )}
    </span>
  );
}
