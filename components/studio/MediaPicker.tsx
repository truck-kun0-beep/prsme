"use client";

/**
 * MediaPicker — Phase 4's single reusable search dialog.
 *
 * One component serves every collection in the studio. It owns:
 *   - the kind selector (collection-aware: a "Films" shelf opens on `movie`),
 *   - debounced, cancellable search against `/api/media/search`,
 *   - honest per-provider status (loading / empty / error / unavailable),
 *   - artwork, title, creator, year, and a visible source label per result.
 *
 * Honesty rules encoded here:
 *   - When every provider fails, the dialog says so. It never shows a
 *     fabricated result to paper over an outage.
 *   - The "source" label is the provider that actually answered.
 *   - A result with no artwork shows the placeholder, not a broken image.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Artwork } from "@/components/Artwork";
import type {
  MediaKindId,
  MediaRecord,
  MediaSearchResponse,
} from "@/lib/media/types";
import {
  MEDIA_KIND_IDS,
  MEDIA_KIND_LABELS,
  MEDIA_PROVIDER_LABELS,
} from "@/lib/media/types";

export type PickerStatus =
  | "idle"
  | "loading"
  | "ok"
  | "empty"
  | "degraded";

interface MediaPickerProps {
  /** Pre-select a kind. The collection's category decides this. */
  initialKind?: MediaKindId;
  /** Restrict the kind selector (a movie-only collection locks to movie). */
  allowedKinds?: MediaKindId[];
  /**
   * Phase 4.2 — called with the chosen record plus the book-format subtype the
   * user was in when they picked it. `format` is always `undefined` for
   * non-book kinds, so the parent never has to second-guess it.
   */
  onSelect: (record: MediaRecord, format?: "standard" | "light-novel") => void;
  onClose: () => void;
  /** Title shown in the dialog header. */
  collectionName?: string;
}

const DEBOUNCE_MS = 420;

export function MediaPicker({
  initialKind = "movie",
  allowedKinds,
  onSelect,
  onClose,
  collectionName,
}: MediaPickerProps) {
  const [kind, setKind] = useState<MediaKindId>(initialKind);
  const [query, setQuery] = useState("");
  /*
   * Phase 4.2 — book-format subtype. Only meaningful while `kind === "book"`,
   * so it is reset whenever the owner leaves the Books catalogue; otherwise a
   * film search would carry a stale light-novel hint.
   */
  const [bookFormat, setBookFormat] = useState<"standard" | "light-novel">(
    "standard",
  );
  const [status, setStatus] = useState<PickerStatus>("idle");
  const [results, setResults] = useState<MediaRecord[]>([]);
  const [response, setResponse] = useState<MediaSearchResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const titleId = useId();
  const listId = useId();

  const kinds = useMemo(
    () => (allowedKinds && allowedKinds.length > 0 ? allowedKinds : MEDIA_KIND_IDS),
    [allowedKinds],
  );

  /* ---------------------------------------------------------------- search */

  const runSearch = useCallback(
    async (
      nextKind: MediaKindId,
      term: string,
      format?: "standard" | "light-novel",
    ) => {
      // Cancel anything in flight — a stale response must never overwrite a
      // newer one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      try {
        const params = new URLSearchParams({ kind: nextKind, q: term });
        // Phase 4.2 — only Books understands a format hint. Sending it for
        // other kinds would be a no-op, but the route also guards against it.
        if (nextKind === "book" && format) params.set("format", format);
        const res = await fetch(`/api/media/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          setResponse(null);
          setStatus("degraded");
          return;
        }
        const data = (await res.json()) as MediaSearchResponse;
        if (controller.signal.aborted) return;
        setResponse(data);
        setResults(data.results);
        setActiveIndex(0);
        setStatus(
          data.results.length > 0 ? "ok" : data.degraded ? "degraded" : "empty",
        );
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("degraded");
      }
    },
    [],
  );

  // Debounce the input so we don't fire a provider request per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setStatus("idle");
      setResults([]);
      setResponse(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(
        kind,
        term,
        kind === "book" ? bookFormat : undefined,
      );
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, kind, bookFormat, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ------------------------------------------------------------ a11y setup */

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted row in view while arrowing through results.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = results[activeIndex];
      if (pick) onSelect(pick);
    }
  }

  /* ---------------------------------------------------------------- render */

  const providerSummary = response?.providers ?? [];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[var(--line-strong)] bg-[var(--surface-1)] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-iris-300">
              Media catalogue
            </p>
            <h2 id={titleId} className="mt-1 font-display text-lg text-[var(--text-strong)]">
              Add to {collectionName ?? "this collection"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
          >
            Close
          </button>
        </header>

        {/* Search controls */}
        <div className="space-y-3 border-b border-[var(--line-soft)] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor={`${titleId}-q`} className="sr-only">
                Search the media catalogue
              </label>
              <input
                id={`${titleId}-q`}
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a title, artist, or author…"
                autoComplete="off"
                className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none"
                aria-describedby={listId}
              />
            </div>
            <div className="sm:w-52">
              <label htmlFor={`${titleId}-kind`} className="sr-only">
                Media type
              </label>
              <select
                id={`${titleId}-kind`}
                value={kind}
                onChange={(e) => setKind(e.target.value as MediaKindId)}
                disabled={kinds.length === 1}
                className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text-strong)] focus:border-[var(--accent-400)] focus:outline-none disabled:opacity-60"
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {MEDIA_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/*
           * Phase 4.2 — book-format subtype.
           *
           * A light novel is a *book format*, not a new catalogue, so this
           * control only appears while the Books category is selected. It tunes
           * the search (providers rank likely candidates higher) and supplies
           * the value stamped on the stored item — but a result is only ever
           * *labelled* a light novel when the provider's own metadata says so.
           */}
          {kind === "book" && (
            <fieldset
              className="flex flex-wrap items-center gap-2"
              data-testid="media-picker-book-format"
            >
              <legend className="sr-only">Book format</legend>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Format
              </span>
              {(["standard", "light-novel"] as const).map((f) => {
                const inputId = `${titleId}-format-${f}`;
                return (
                  <label
                    key={f}
                    htmlFor={inputId}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] text-[var(--text-default)] has-[:checked]:border-[var(--accent-400)] has-[:checked]:text-[var(--text-strong)]"
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={`${titleId}-format`}
                      value={f}
                      checked={bookFormat === f}
                      onChange={() => setBookFormat(f)}
                      className="h-3 w-3 accent-[var(--accent-400)]"
                    />
                    {f === "standard" ? "Standard book" : "Light novel"}
                  </label>
                );
              })}
              <span className="text-[11px] text-[var(--text-faint)]">
                Narrows the search. The “Light novel” label only appears on
                covers the catalogue itself marks that way.
              </span>
            </fieldset>
          )}

          <ProviderStatusLine status={status} providers={providerSummary} />
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {status === "idle" && (
            <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">
              Type at least two characters to search {MEDIA_KIND_LABELS[kind].toLowerCase()}.
            </p>
          )}

          {status === "loading" && (
            <div
              className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--text-muted)]"
              role="status"
              aria-live="polite"
            >
              <Spinner />
              Searching {MEDIA_KIND_LABELS[kind].toLowerCase()}…
            </div>
          )}

          {status === "empty" && (
            <div className="py-10 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">
                No matches for “{query.trim()}” in {MEDIA_KIND_LABELS[kind].toLowerCase()}.
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-faint)]">
                Try a different spelling, or switch the media type above.
              </p>
            </div>
          )}

          {status === "degraded" && (
            <div className="py-10 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">
                The catalogue could not be reached just now.
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-faint)]">
                PRSME does not substitute made-up results when a provider is down.
                Try again in a moment.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <ul id={listId} ref={listRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {results.map((record, index) => (
                <li key={record.id}>
                  <ResultCard
                    record={record}
                    active={index === activeIndex}
                    onSelect={() =>
                      onSelect(record, kind === "book" ? bookFormat : undefined)
                    }
                    onHover={() => setActiveIndex(index)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--line-soft)] px-5 py-3">
          <p className="text-[11px] text-[var(--text-faint)]">
            Use ↑ ↓ to move, Enter to add, Esc to close.
          </p>
          <p className="text-[11px] text-[var(--text-faint)]">
            {response ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}
          </p>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Result card                                */
/* -------------------------------------------------------------------------- */

function ResultCard({
  record,
  active,
  onSelect,
  onHover,
}: {
  record: MediaRecord;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const byline =
    record.creatorRole && record.creator
      ? `${record.creatorRole} ${record.creator}`
      : record.creator;

  return (
    <button
      type="button"
      data-testid={`media-result-${record.provider}`}
      data-active={active}
      data-cover={record.coverUrl ? "yes" : "no"}
      data-title={record.title}
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={`group flex w-full gap-3 rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-[var(--accent-400)] bg-[var(--surface-2)]"
          : "border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]"
      }`}
    >
      <div className="h-[4.5rem] w-[3.375rem] shrink-0 overflow-hidden rounded-md">
        <Artwork
          palette="iris"
          src={record.coverUrl ?? undefined}
          alt={`${record.title} cover`}
          ratio="2/3"
          className="!rounded-none"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-[var(--text-strong)]" title={record.title}>
          {record.title}
        </p>
        {byline && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--text-muted)]">
            {byline}
          </p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-faint)]">
          {record.year && <span>{record.year}</span>}
          <span aria-hidden>·</span>
          <span className="rounded-full border border-[var(--line-soft)] px-1.5 py-0.5">
            {MEDIA_PROVIDER_LABELS[record.provider]}
          </span>
          {record.coverUrl ? (
            <span className="text-[var(--text-faint)]" aria-label="This result includes artwork">artwork attached</span>
          ) : (
            <span className="text-[var(--text-faint)]" aria-label="No artwork for this result">no artwork</span>
          )}
        </p>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Provider status                               */
/* -------------------------------------------------------------------------- */

function ProviderStatusLine({
  status,
  providers,
}: {
  status: PickerStatus;
  providers: MediaSearchResponse["providers"];
}) {
  if (status === "idle") {
    return (
      <p className="text-[12px] text-[var(--text-faint)]" role="status" aria-live="polite">
        Results come from public catalogues. Artwork stays on the provider&apos;s servers.
      </p>
    );
  }
  if (providers.length === 0) return null;

  const failed = providers.filter((p) => p.status === "unavailable" || p.status === "error");
  const ok = providers.filter((p) => p.status === "ok" && p.count > 0);

  return (
    <p className="text-[12px] text-[var(--text-faint)]" role="status" aria-live="polite">
      {ok.length > 0 && (
        <>
          Searched {ok.map((p) => MEDIA_PROVIDER_LABELS[p.provider]).join(", ")}.
        </>
      )}
      {ok.length > 0 && failed.length > 0 && <span> </span>}
      {failed.length > 0 && failed[0] && (
        <>
          {MEDIA_PROVIDER_LABELS[failed[0].provider]} did not respond
          {failed.length > 1 ? " (and others)" : ""} — results shown are from the
          catalogues that did answer.
        </>
      )}
    </p>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}