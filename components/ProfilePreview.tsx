import { Artwork } from "./Artwork";
import { PrismSymbol } from "./Wordmark";
import { demoProfile, demoRecentlyWatched, demoCollections } from "@/lib/demoProfile";

/**
 * A self-contained preview of a fictional PRSME profile. Used in the hero,
 * the "share" section, and the final CTA. Card-only — does not receive
 * server data; everything is hard-coded fictional copy so the page never
 * implies a real account.
 */
export function ProfilePreview({
  size = "lg",
  className = "",
}: {
  size?: "lg" | "sm";
  className?: string;
}) {
  const compact = size === "sm";
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-[var(--line-soft)] bg-ink-900 shadow-card ${className}`}
      aria-label={`Fictional PRSME profile preview — ${demoProfile.displayName}`}
    >
      {/* Theme header band */}
      <div className="relative h-28 overflow-hidden">
        <Artwork palette="violet" ratio="auto" className="!h-full !w-full rounded-none">
          {/* Theme label */}
          <div className="absolute inset-0 flex items-start justify-between p-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-950/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-100 backdrop-blur">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-iris-300"
              />
              {demoProfile.themeName}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-200/80">
              preview
            </span>
          </div>
        </Artwork>
        {/* Soft fade into card body */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-ink-900 to-transparent" />
      </div>

      {/* Avatar + identity */}
      <div className="px-5 pb-5 pt-0">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <div
            className="relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full border-4 border-ink-900 shadow-ring"
            aria-hidden
          >
            <Artwork palette="iris" ratio="auto" className="!h-full !w-full rounded-none" />
            <PrismSymbol className="absolute h-7 w-7 opacity-90 mix-blend-screen" />
          </div>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-ink-700/60 px-3 ${
              compact ? "h-8 text-[11px]" : "h-9 text-[12px]"
            } font-medium text-muted-100 transition-colors hover:border-iris-400/50 hover:text-muted-50`}
            aria-label="Follow fictional preview profile"
          >
            <span aria-hidden>+</span> Follow
          </button>
        </div>

        <div className={compact ? "mt-3" : "mt-4"}>
          <p className={`font-semibold text-muted-50 ${compact ? "text-[15px]" : "text-[17px]"}`}>
            {demoProfile.displayName}
          </p>
          <p className="font-mono text-[12px] text-muted-300">
            {demoProfile.username}
          </p>
        </div>

        {!compact && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-200">
            {demoProfile.bio}
          </p>
        )}

        <div className="mt-4 flex items-center gap-4 text-[12px] text-muted-300">
          <span>
            <strong className="font-semibold text-muted-50">
              {demoProfile.followerCount.toLocaleString()}
            </strong>{" "}
            followers
          </span>
          <span aria-hidden className="text-muted-500">
            ·
          </span>
          <span>
            <strong className="font-semibold text-muted-50">
              {demoProfile.followingCount}
            </strong>{" "}
            following
          </span>
          <span aria-hidden className="text-muted-500">
            ·
          </span>
          <span className="text-muted-400">{demoProfile.location}</span>
        </div>

        {!compact && (
          <>
            <div className="my-5 hairline" />

            {/* Recently */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-300">
                  Recently
                </h3>
                <span className="text-[11px] text-muted-400">
                  4 of {demoRecentlyWatched.length * 6}
                </span>
              </div>
              <ul className="grid grid-cols-4 gap-2.5">
                {demoRecentlyWatched.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Artwork
                      palette={item.palette}
                      ratio="2/3"
                      label={`${item.title} — ${item.kind}`}
                      variant="cover"
                    />
                    <p className="mt-1.5 truncate text-[11px] text-muted-200">
                      {item.title}
                    </p>
                    {item.rating !== undefined && (
                      <p className="font-mono text-[10px] text-muted-400">
                        {item.rating.toFixed(1)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="my-5 hairline" />

            {/* Collections */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-300">
                  Collections
                </h3>
                <button
                  type="button"
                  className="text-[11px] text-muted-400 transition-colors hover:text-muted-50"
                >
                  See all
                </button>
              </div>
              <ul className="space-y-3">
                {demoCollections.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center gap-3 rounded-md border border-[var(--line-soft)] bg-ink-800/50 p-2.5 transition-colors hover:border-iris-400/30"
                  >
                    <div className="flex shrink-0 -space-x-3">
                      {c.cover.slice(0, 3).map((item, i) => (
                        <div
                          key={item.id}
                          className="h-12 w-9 overflow-hidden rounded-sm ring-2 ring-ink-900"
                          style={{ zIndex: 3 - i }}
                        >
                          <Artwork palette={item.palette} ratio="auto" />
                        </div>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-muted-50">
                        {c.name}
                      </p>
                      <p className="font-mono text-[11px] text-muted-400">
                        {c.count.toLocaleString()} items · {c.tone}
                      </p>
                    </div>
                    <span aria-hidden className="text-muted-400">
                      →
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="my-5 hairline" />

            {/* Mini "share" footer */}
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-mono text-muted-400">
                prsme.app/{demoProfile.username.replace("@", "")}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-ink-800 px-2.5 py-1.5 text-muted-100 transition-colors hover:border-iris-400/40 hover:text-muted-50"
              >
                <span aria-hidden>↗</span> Share
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}