"use client";

/**
 * Phase 6 — Discover Reviews controls.
 *
 * Three controls, all of which act on REAL database records:
 *
 *   - **Search** — searches PRSME's own catalogue (the works members have
 *     actually reviewed) and links each hit to its media page.
 *   - **Category filters** — filter by the media item's catalogue kind. These
 *     change the query, not the appearance of the selected tab: clicking
 *     "Manga" genuinely fetches the manga feed.
 *   - **Sort** — reorders the feed by real review counts or real community
 *     averages.
 *
 * The controls are a client island that pushes URL query parameters. The page
 * itself is a server component, so the resulting state is shareable, linkable,
 * and renderable without JavaScript — the form still submits with GET when
 * scripting is unavailable.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export interface DiscoverCategory {
  id: string;
  label: string;
}

export interface DiscoverSort {
  id: string;
  label: string;
}

export function DiscoverControls({
  categories,
  sorts,
  currentCategory,
  currentSort,
  currentQuery,
}: {
  categories: DiscoverCategory[];
  sorts: DiscoverSort[];
  currentCategory: string;
  currentSort: string;
  currentQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [term, setTerm] = useState(currentQuery);

  // Keep the input in step with the URL, so a back-navigation or a shared
  // link shows the right text in the field.
  useEffect(() => {
    setTerm(currentQuery);
  }, [currentQuery]);

  /**
   * Replace the query string while keeping the filters the reader has set.
   *
   * Every change resets the page to 1: keeping the old page number with a new
   * filter would land the reader on a page that may not exist, which reads as
   * "the filter broke the page".
   */
  function navigate(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in updates)) next.delete("page");

    startTransition(() => {
      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    });
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: term.trim() || null });
  }

  return (
    <div className="space-y-4" data-testid="discover-controls">
      {/* ---- Search ---- */}
      <form
        onSubmit={onSearch}
        role="search"
        className="flex flex-col gap-2.5 sm:flex-row"
      >
        <div className="relative flex-1">
          <label htmlFor="discover-search" className="sr-only">
            Search the media catalogue
          </label>
          <input
            id="discover-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a title, artist, or author…"
            autoComplete="off"
            className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[14px] text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none"
            data-testid="discover-search-input"
          />
        </div>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-[var(--accent-400)] px-4 py-2.5 text-[13px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
          data-testid="discover-search-submit"
        >
          Search
        </button>
      </form>

      {/* ---- Category filters ---- */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          role="group"
          aria-label="Filter by media type"
          className="flex flex-wrap gap-1.5"
          data-testid="discover-categories"
        >
          {categories.map((category) => {
            const active = category.id === currentCategory;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => navigate({ category: category.id === "all" ? null : category.id })}
                className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/12 text-[var(--text-strong)]"
                    : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
                }`}
                data-testid={`discover-category-${category.id}`}
                data-active={active}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        {/* ---- Sort ---- */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="discover-sort"
            className="shrink-0 text-[12px] text-[var(--text-muted)]"
          >
            Sort
          </label>
          <select
            id="discover-sort"
            value={currentSort}
            onChange={(e) =>
              navigate({ sort: e.target.value === "recent" ? null : e.target.value })
            }
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--text-strong)] focus:border-[var(--accent-400)] focus:outline-none"
            data-testid="discover-sort"
          >
            {sorts.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pending ? (
        <p className="text-[11px] text-[var(--text-faint)]" role="status">
          Updating…
        </p>
      ) : null}
    </div>
  );
}
