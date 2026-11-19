"use client";

/**
 * The My List grid.
 *
 * A Client Component because two of its jobs are inherently interactive:
 *
 *   - the category filters change the URL, which changes what the server
 *     renders;
 *   - removing an item updates the list in place, without a full page
 *     reload.
 *
 * The category filter is a LINK, not a button. A filter that changes the
 * visible set without changing the URL cannot be bookmarked, shared, or
 * reached with the back button — and a list page whose filter is invisible
 * in the address bar is a list page whose state cannot be restored.
 *
 * The remove control is optimistic: the card disappears immediately and comes
 * back if the write fails.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Artwork } from "@/components/Artwork";
import { ListButton } from "@/components/list/ListButton";
import {
  LIST_CATEGORIES,
  type ListCategoryId,
} from "@/lib/media/list";
import { MEDIA_KIND_LABELS, type MediaKindId } from "@/lib/media/types";
import type { ListEntry } from "@/lib/supabase/list";

/**
 * The placeholder palette for a media item with no artwork.
 *
 * Deterministic from the media id, so the same work always renders the same
 * colour between renders. A random pick would make a card change appearance
 * on every re-render, which reads as a bug.
 */
const PLACEHOLDER_PALETTES = [
  "amber",
  "iris",
  "rose",
  "cyan",
  "forest",
  "sand",
  "mono",
  "violet",
  "rust",
] as const;

function paletteForMedia(mediaId: string) {
  let hash = 0;
  for (let i = 0; i < mediaId.length; i++) {
    hash = (hash * 31 + mediaId.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_PALETTES[hash % PLACEHOLDER_PALETTES.length]!;
}

export interface ListCounts {
  total: number;
  toWatch: number;
  toRead: number;
  toListen: number;
}

export function ListGrid({
  entries,
  category,
  counts,
}: {
  entries: ListEntry[];
  category: ListCategoryId;
  counts: ListCounts;
}) {
  const router = useRouter();

  /*
   * The items currently on screen, in the order the server returned them.
   *
   * A local copy rather than the server's array, so a removal is immediate.
   * The server's list stays the truth; a failed removal restores the row.
   */
  const [items, setItems] = useState(entries);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A filter change replaces the whole set, so the local copy is reset.
  // `key` on the parent would also work, but this keeps the reset explicit.
  const [seenCategory, setSeenCategory] = useState(category);
  if (seenCategory !== category) {
    setSeenCategory(category);
    setItems(entries);
    setError(null);
  }

  const remove = useCallback(
    async (entry: ListEntry) => {
      if (removingId) return;
      setRemovingId(entry.id);
      setError(null);

      const previous = items;
      // Optimistic: the card goes now, and comes back if the write fails.
      setItems((current) => current.filter((item) => item.id !== entry.id));

      try {
        const response = await fetch(
          `/api/list?mediaId=${encodeURIComponent(entry.media.id)}`,
          { method: "DELETE" },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setItems(previous);
          setError(payload?.error ?? "Could not remove that item.");
          return;
        }

        // The header count and the filter counts are server-computed, so the
        // page is refreshed to pick the new numbers up. The removal itself has
        // already been applied locally, so this does not flash the row back.
        router.refresh();
      } catch {
        setItems(previous);
        setError("Could not remove that item.");
      } finally {
        setRemovingId(null);
      }
    },
    [items, removingId, router],
  );

  const countFor = (id: ListCategoryId): number | null => {
    if (id === "all") return counts.total;
    if (id === "to-watch") return counts.toWatch;
    if (id === "to-read") return counts.toRead;
    if (id === "to-listen") return counts.toListen;
    return null;
  };

  return (
    <div>
      {/* ---- Filters ---- */}
      <nav aria-label="List categories" className="flex flex-wrap gap-2">
        {LIST_CATEGORIES.map((cat) => {
          const active = cat.id === category;
          const count = countFor(cat.id);
          const href = cat.id === "all" ? "/list" : `/list?filter=${cat.id}`;

          return (
            <Link
              key={cat.id}
              href={href}
              aria-current={active ? "page" : undefined}
              data-testid={`list-filter-${cat.id}`}
              data-active={active ? "true" : "false"}
              className={[
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                active
                  ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/12 text-[var(--text-strong)]"
                  : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]",
              ].join(" ")}
            >
              {cat.label}
              {count !== null ? (
                <span
                  className="font-mono text-[11px] text-[var(--text-faint)]"
                  data-testid={`list-filter-count-${cat.id}`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-[var(--line-strong)] px-3 py-2 text-[13px] text-[#E8A0A4]"
          data-testid="list-error"
        >
          {error}
        </p>
      ) : null}

      {/* ---- Grid ---- */}
      {items.length === 0 ? (
        <EmptyState category={category} hasAnything={counts.total > 0} />
      ) : (
        <ul
          className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-x-5 md:gap-y-9"
          data-testid="list-grid"
        >
          {items.map((entry) => (
            <li key={entry.id} data-testid="list-item" className="min-w-0">
              <Link
                href={`/media/${entry.media.id}`}
                className="group block focus-visible:outline-none"
                aria-label={`Open ${entry.media.title}`}
              >
                <div className="relative overflow-hidden rounded-lg border border-[var(--line-soft)] transition-colors group-hover:border-[var(--line-strong)]">
                  <Artwork
                    palette={paletteForMedia(entry.media.id)}
                    src={entry.media.artworkUrl}
                    alt={`${entry.media.title} cover`}
                    ratio="2/3"
                    className="!rounded-none"
                  />
                </div>
                <h2 className="mt-2.5 line-clamp-2 text-[14px] font-medium leading-snug text-[var(--text-strong)]">
                  {entry.media.title}
                </h2>
              </Link>

              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                {MEDIA_KIND_LABELS[entry.media.kind as MediaKindId] ?? "Media"}
                {entry.media.year ? ` · ${entry.media.year}` : ""}
              </p>

              <div className="mt-2.5">
                <ListButton
                  mediaId={entry.media.id}
                  title={entry.media.title}
                  saved
                  compact
                />
              </div>

              {/*
               * The remove control is separate from the bookmark so the
               * removal is an explicit act on THIS list, not a side effect of
               * the bookmark's toggle. It is only enabled while the item is
               * genuinely on the list.
               */}
              <button
                type="button"
                onClick={() => remove(entry)}
                disabled={removingId === entry.id}
                className="mt-2 text-[11px] text-[var(--text-faint)] underline underline-offset-4 transition-colors hover:text-[var(--text-default)] disabled:opacity-50"
                data-testid={`list-remove-${entry.media.id}`}
              >
                {removingId === entry.id ? "Removing…" : "Remove from list"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The empty state.
 *
 * It differs by filter, because "you have nothing" and "you have nothing
 * *of this kind*" are different situations — and in the second case the
 * right thing to do is switch filters, not go hunting.
 */
function EmptyState({
  category,
  hasAnything,
}: {
  category: ListCategoryId;
  hasAnything: boolean;
}) {
  const active = LIST_CATEGORIES.find((c) => c.id === category);

  if (category !== "all" && hasAnything) {
    return (
      <div
        className="mt-8 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] px-6 py-12 text-center"
        data-testid="list-empty-state"
      >
        <h2 className="text-[16px] font-medium text-[var(--text-strong)]">
          Nothing in {active?.label} yet.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--text-muted)]">
          Nothing on your list falls into {active?.label} — {active?.description.toLowerCase()}
          That shelf is empty. Switch back to everything, or save something
          new from Discover.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/list"
            className="inline-flex h-10 items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
          >
            Show everything
          </Link>
          <Link
            href="/discover"
            className="inline-flex h-10 items-center rounded-md bg-[var(--accent-400)] px-4 text-[13px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
          >
            Find something to save
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-8 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] px-6 py-12 text-center"
      data-testid="list-empty-state"
    >
      <h2 className="text-[16px] font-medium text-[var(--text-strong)]">
        Your list is empty.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--text-muted)]">
        One queue for everything worth coming back to — films and series to
        watch, books and manga to read, records and songs to listen. Use the
        bookmark button on any media page to add something.
      </p>
      <Link
        href="/discover"
        className="mt-6 inline-flex h-10 items-center rounded-md bg-[var(--accent-400)] px-4 text-[13px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
        data-testid="list-empty-discover"
      >
        Browse Discover
      </Link>
    </div>
  );
}
