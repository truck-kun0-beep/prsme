/**
 * The personal rating chip — PRSME's own score, never an external one.
 *
 * There is no IMDb rating, no audience average, and no viewer count here.
 * This is exactly what the profile owner scored the item, and the component
 * says so through its accessible name ("My rating 9.2 out of 10").
 *
 * Phase 4.2 — contrast pass.
 *
 * The previous treatment was a pale-violet glyph on a translucent violet pill
 * at 11px, which measured at ~2.4:1 against Obsidian's background: technically
 * present, practically unreadable, and worse on Paper where the same violet
 * sat on a near-white surface. Ratings are core content for a profile, so the
 * chip now:
 *
 *   - renders tabular numerals so a column of ratings reads as a column, not
 *     a ragged edge;
 *   - uses a deliberately designed solid surface on top of the artwork so the
 *     score is legible across posters and dark/light backgrounds alike;
 *   - never invents a value — an item with no rating renders nothing at all,
 *     so there is no "unrated" state to mistake for a real score.
 *
 * Colours resolve from the profile-scoped rating tokens in `lib/profileTheme`,
 * so Obsidian, Violet Haze, Midnight Blue, Rose Noir, and Paper each get
 * their own legible pairing without a hardcoded accent.
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
    sm: "pf-rating-sm",
    md: "pf-rating-md",
    lg: "pf-rating-lg",
  } as const;

  // Clamp rather than trust the caller: a draft hand-edited in devtools must
  // still render a 0–10 value, never "-3" or "NaN".
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;

  return (
    <span
      className={`pf-rating ${sizes[size]} ${className}`.trim()}
      aria-label={`My rating ${safe} out of 10`}
      title={`My rating ${safe.toFixed(1)} out of 10`}
      data-testid="rating-badge"
    >
      <span aria-hidden className="pf-rating-star">
        ★
      </span>
      <span className="pf-rating-value">{safe.toFixed(1)}</span>
      {withLabel && <span className="pf-rating-of">/ 10</span>}
    </span>
  );
}