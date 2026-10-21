"use client";

import { Artwork } from "./Artwork";
import type { ActivityEntry } from "@/lib/noirProfile";

const kindLabel: Record<ActivityEntry["kind"], string> = {
  watched: "Watched",
  added: "Added",
  rated: "Rated",
  reviewed: "Reviewed",
  updated: "Updated",
};

/**
 * ActivityList — the profile's "recently" ledger.
 *
 * Renders inside `.profile-scope`, so every colour resolves from the
 * `--pf-*` tokens. Phase 3 hard-coded `text-iris-300` / `bg-ink-800` here,
 * which is why activity stayed violet under Midnight Blue and washed out
 * under Paper.
 */
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="pf-empty">
        <p className="pf-body text-[14px]">No recent activity yet.</p>
      </div>
    );
  }

  return (
    <ul
      className="pf-collection divide-y divide-[var(--pf-border)] overflow-hidden"
      data-testid="activity-list"
    >
      {entries.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[auto_1fr] items-start gap-3 px-3 py-3.5 transition-colors hover:bg-[var(--pf-hover)] sm:grid-cols-[auto_1fr_auto] sm:gap-5 sm:px-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--pf-border)] bg-[var(--pf-surface-2)] text-[10px] uppercase tracking-[0.18em] text-[var(--pf-accent)]">
            <span className="sr-only">{kindLabel[e.kind]}</span>
            <span aria-hidden className="pf-meta">
              {kindLabel[e.kind].slice(0, 2)}
            </span>
          </div>

          <div className="min-w-0">
            <p className="pf-body text-[14px] leading-relaxed">{e.text}</p>
            <div className="pf-meta mt-1 flex items-center gap-3">
              <span>{e.when}</span>
              {e.item && (
                <span className="truncate text-[var(--pf-text-muted)]">
                  · {e.item.title}
                </span>
              )}
            </div>
          </div>

          {e.item && (
            <div
              className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--pf-border)] sm:block"
              aria-hidden
            >
              <Artwork palette={e.item.palette} ratio="auto" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}