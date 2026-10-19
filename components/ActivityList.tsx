import { Artwork } from "./Artwork";
import type { ActivityEntry } from "@/lib/noirProfile";

const kindLabel: Record<ActivityEntry["kind"], string> = {
  watched: "Watched",
  added: "Added",
  rated: "Rated",
  reviewed: "Reviewed",
  updated: "Updated",
};

export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ul className="flex min-w-0 flex-col divide-y divide-[var(--line-soft)] border-y border-[var(--line-soft)]">
      {entries.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[auto,1fr] items-start gap-4 py-4 first:pt-5 last:pb-5 sm:grid-cols-[auto,1fr,auto] sm:gap-6"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line-soft)] bg-ink-800/60 text-[10px] uppercase tracking-[0.18em] text-iris-300">
            <span className="sr-only">{kindLabel[e.kind]}</span>
            <span aria-hidden className="font-mono">
              {kindLabel[e.kind].slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] leading-relaxed text-muted-100">{e.text}</p>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-muted-400">
              <span className="font-mono">{e.when}</span>
              {e.item && (
                <span className="truncate">
                  · <span className="text-muted-200">{e.item.title}</span>
                </span>
              )}
            </div>
          </div>
          {e.item && (
            <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-md sm:block">
              <Artwork palette={e.item.palette} ratio="auto" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}