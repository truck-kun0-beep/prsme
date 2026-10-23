"use client";

import { useCallback, useState } from "react";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import type { ClicksPhoto } from "@/lib/noirProfile";
import { isSafeExternalUrl, classifyExternalUrl } from "@/lib/validate";
import { PanelCard, TextInput, TextArea, Select } from "./StudioFields";
import { IconUp, IconDown, IconTrash, IconPlus, IconX } from "./StudioIcons";

/**
 * My Clicks Manager (Phase 4.3).
 *
 * The gallery is managed entirely by *reference*. PRSME stores a URL and the
 * visitor's browser fetches the picture; there is no file input here and no
 * upload path anywhere in this component, by design. That is the whole reason
 * this panel can be called "no uploads": there is literally nothing to upload
 * to.
 *
 * Two modes are offered, and both are validated before they are saved:
 *
 *   - **Image** — a direct HTTPS image resource. Rejected with an explanation
 *     when it is not HTTPS, is not a URL at all, or points at a private host.
 *     We deliberately do *not* fetch the URL server-side to confirm it is an
 *     image: that would be exactly the unrestricted remote-fetch proxy the
 *     brief forbids. The browser reveals the truth on the public profile, and
 *     the gallery shows an honest fallback if it does not load.
 *   - **Post** — a public Instagram or Facebook permalink, rendered through
 *     that platform's official embed. An unrecognised host falls back to an
 *     explicit external-post card rather than a broken tile.
 *
 * Alt text is required for image entries: a public gallery image with no
 * description is invisible to anyone not looking directly at it.
 */

type Mode = "image" | "post";

interface DraftEntry {
  id: string | null;
  mode: Mode;
  title: string;
  place: string;
  imageUrl: string;
  postUrl: string;
  sourceUrl: string;
  altText: string;
  ratio: ClicksPhoto["ratio"];
  palette: ClicksPhoto["palette"];
}

const EMPTY: DraftEntry = {
  id: null,
  mode: "image",
  title: "",
  place: "",
  imageUrl: "",
  postUrl: "",
  sourceUrl: "",
  altText: "",
  ratio: "square",
  palette: "mono",
};

const PALETTE_OPTIONS: ClicksPhoto["palette"][] = [
  "mono", "amber", "iris", "cyan", "forest", "rose", "sand", "violet", "rust",
];

export function ClicksPanel() {
  const { draft, update } = useProfileDraft();
  const [entry, setEntry] = useState<DraftEntry>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clicks = draft.clicks ?? [];

  const write = useCallback(
    (next: ClicksPhoto[]) => update({ clicks: next }),
    [update],
  );

  function load(photo: ClicksPhoto) {
    setEditingId(photo.id);
    setEntry({
      id: photo.id,
      mode: photo.mode ?? "image",
      title: photo.title,
      place: photo.place ?? "",
      imageUrl: photo.imageUrl ?? "",
      postUrl: photo.postUrl ?? "",
      sourceUrl: photo.sourceUrl ?? "",
      altText: photo.altText ?? "",
      ratio: photo.ratio,
      palette: photo.palette,
    });
    setError(null);
  }

  function reset() {
    setEditingId(null);
    setEntry(EMPTY);
    setError(null);
  }

  /** Validate, then insert or replace. Never stores an unvalidated URL. */
  function commit() {
    const title = entry.title.trim();
    if (!title) {
      setError("Give this click a caption — it is what visitors read on the tile.");
      return;
    }

    let imageUrl: string | undefined;
    let postUrl: string | undefined;
    let postPlatform: ClicksPhoto["postPlatform"];
    let sourceUrl: string | undefined;

    if (entry.mode === "image") {
      if (!isSafeExternalUrl(entry.imageUrl)) {
        setError(
          "That image URL is not usable. Paste a direct https:// link to the image file itself — not a page that contains it.",
        );
        return;
      }
      if (!entry.altText.trim()) {
        setError("Add a short description (alt text). This is what screen readers announce.");
        return;
      }
      imageUrl = entry.imageUrl.trim();
      if (entry.sourceUrl.trim()) {
        if (!isSafeExternalUrl(entry.sourceUrl)) {
          setError("The source link must be a valid https:// address.");
          return;
        }
        sourceUrl = entry.sourceUrl.trim();
      }
    } else {
      if (!isSafeExternalUrl(entry.postUrl)) {
        setError("That post URL is not usable. Paste a public https:// post link.");
        return;
      }
      const classified = classifyExternalUrl(entry.postUrl.trim());
      if (!classified || classified.kind === "source") {
        setError(
          "PRSME can only embed Instagram and Facebook posts. For anything else, add it as an image URL instead.",
        );
        return;
      }
      postUrl = entry.postUrl.trim();
      postPlatform = classified.kind === "instagram" ? "instagram" : "facebook";
    }

    const record: ClicksPhoto = {
      id: entry.id ?? newClickId(),
      title,
      place: entry.place.trim() || undefined,
      ratio: entry.ratio,
      palette: entry.palette,
      mode: entry.mode,
      imageUrl,
      postUrl,
      postPlatform,
      /*
       * Alt text is mandatory for every entry, not just images.
       *
       * The panel requires the owner to type it for an image — there is no
       * other way to see what the picture is. A `post` entry has no such field,
       * yet it still renders a picture (the platform's embed) inside the same
       * gallery, so leaving `altText` undefined made a public gallery image
       * invisible to anyone not looking at it. When the owner did not supply a
       * description we build one from the caption, which is always present and
       * always something they chose. `readClicks` applies the same fallback on
       * load, so an entry written by an older build is repaired on the way in.
       */
      altText:
        entry.altText.trim() ||
        `${title} — from the owner's My Clicks gallery.`,
      sourceUrl,
    };

    if (editingId) {
      write(clicks.map((c) => (c.id === editingId ? record : c)));
    } else {
      write([...clicks, record]);
    }
    reset();
  }

  function move(id: string, dir: -1 | 1) {
    const i = clicks.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= clicks.length) return;
    // Reorder by stable id — never by index-based identity.
    const next = [...clicks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    write(next);
  }

  function remove(id: string) {
    write(clicks.filter((c) => c.id !== id));
    if (editingId === id) reset();
  }

  const set = <K extends keyof DraftEntry>(key: K, value: DraftEntry[K]) =>
    setEntry((e) => ({ ...e, [key]: value }));

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-clicks-intro"
        title="My Clicks"
        description="A gallery of externally hosted images and public posts. PRSME stores only the URL — the picture is loaded by the visitor's browser, never uploaded here."
      >
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          Saved to this browser only. Other devices and future accounts are not
          synced — that arrives with the authenticated backend.
        </p>
      </PanelCard>

      <PanelCard
        testId="studio-clicks-editor"
        title={editingId ? "Edit click" : "Add a click"}
        description="Two honest modes. Neither uploads a photograph to PRSME."
      >
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-[var(--text-default)]">
              Content type
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["image", "Image URL", "A direct https:// link to an image file you have permission to display."],
                  ["post", "Public post", "A public Instagram or Facebook post, embedded through their official player."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 transition-colors ${
                    entry.mode === value
                      ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/10"
                      : "border-[var(--line-soft)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]"
                  }`}
                  data-testid={`studio-clicks-mode-${value}`}
                >
                  <input
                    type="radio"
                    name="clicks-mode"
                    value={value}
                    checked={entry.mode === value}
                    onChange={() => set("mode", value)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent-400)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-[var(--text-strong)]">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
                      {hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextLabeled id="clicks-title" label="Caption">
              <TextInput
                id="clicks-title"
                value={entry.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Gion, after rain"
                maxLength={120}
              />
            </TextLabeled>
            <TextLabeled id="clicks-place" label="Place / credit (optional)">
              <TextInput
                id="clicks-place"
                value={entry.place}
                onChange={(e) => set("place", e.target.value)}
                placeholder="Kyoto"
                maxLength={80}
              />
            </TextLabeled>
          </div>

          {entry.mode === "image" ? (
            <>
              <TextLabeled
                id="clicks-image-url"
                label="Direct image URL (https://)"
                hint="The image file itself, not the page that shows it. Hosts that block hotlinking will show an honest fallback on the profile rather than a blank tile."
              >
                <TextInput
                  id="clicks-image-url"
                  value={entry.imageUrl}
                  onChange={(e) => set("imageUrl", e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  data-testid="studio-clicks-image-url"
                />
              </TextLabeled>
              <TextLabeled
                id="clicks-alt"
                label="Alt text (required)"
                hint="What a screen reader announces, and what shows if the image fails to load."
              >
                <TextArea
                  id="clicks-alt"
                  rows={2}
                  value={entry.altText}
                  onChange={(e) => set("altText", e.target.value)}
                  placeholder="A narrow Kyoto alley lined with wooden machiya houses."
                  maxLength={240}
                  data-testid="studio-clicks-alt"
                />
              </TextLabeled>
              <TextLabeled
                id="clicks-source"
                label="Link to the original post (optional)"
              >
                <TextInput
                  id="clicks-source"
                  value={entry.sourceUrl}
                  onChange={(e) => set("sourceUrl", e.target.value)}
                  placeholder="https://…"
                />
              </TextLabeled>
            </>
          ) : (
            <TextLabeled
              id="clicks-post-url"
              label="Public post URL"
              hint="Instagram or Facebook only. A private or deleted post renders as a labelled link card instead of an embed — PRSME does not attempt to bypass that."
            >
              <TextInput
                id="clicks-post-url"
                value={entry.postUrl}
                onChange={(e) => set("postUrl", e.target.value)}
                placeholder="https://www.instagram.com/p/…"
                data-testid="studio-clicks-post-url"
              />
            </TextLabeled>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TextLabeled id="clicks-ratio" label="Shape">
              <Select
                id="clicks-ratio"
                value={entry.ratio}
                onChange={(e) => set("ratio", e.target.value as DraftEntry["ratio"])}
              >
                <option value="square">Square</option>
                <option value="portrait">Portrait</option>
                <option value="tall">Tall</option>
                <option value="wide">Wide</option>
              </Select>
            </TextLabeled>
            <TextLabeled id="clicks-palette" label="Placeholder tone">
              <Select
                id="clicks-palette"
                value={entry.palette}
                onChange={(e) => set("palette", e.target.value as DraftEntry["palette"])}
              >
                {PALETTE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </TextLabeled>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border px-3 py-2 text-[11px] leading-relaxed"
              style={{
                borderColor: "rgba(214,117,123,0.5)",
                background: "rgba(57,26,34,0.5)",
                color: "var(--text-strong)",
              }}
              data-testid="studio-clicks-error"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={commit}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
              data-testid="studio-clicks-save"
            >
              <IconPlus size={12} /> {editingId ? "Save changes" : "Add to gallery"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-3)] px-3 py-2 text-[12px] text-[var(--text-default)] hover:bg-[var(--surface-4)]"
                data-testid="studio-clicks-cancel"
              >
                <IconX size={12} /> Cancel edit
              </button>
            )}
          </div>
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-clicks-list"
        title={`Gallery entries (${clicks.length})`}
        description="Reorder with the arrows. Ids are stable, so reordering never rewrites an entry's identity."
      >
        {clicks.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-4 text-center text-[12px] leading-relaxed text-[var(--text-muted)]"
            data-testid="studio-clicks-empty"
          >
            Nothing in the gallery yet. Add a direct image URL or a public post URL
            above — PRSME will link to it, never host it.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="studio-clicks-entries">
            {clicks.map((c, i) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2"
                data-testid={`studio-clicks-entry-${c.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-strong)]">
                    {c.title}
                  </p>
                  <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">
                    {c.mode === "post"
                      ? `post · ${c.postPlatform ?? "external"} · ${c.postUrl ?? "no url"}`
                      : `image · ${c.imageUrl ?? "no url"}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(c.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${c.title} up`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
                  >
                    <IconUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(c.id, 1)}
                    disabled={i === clicks.length - 1}
                    aria-label={`Move ${c.title} down`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
                  >
                    <IconDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => load(c)}
                    aria-label={`Edit ${c.title}`}
                    className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--text-default)] hover:border-[var(--line-strong)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label={`Remove ${c.title}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] text-[color:#D6757B] hover:border-[color:#D6757B]/40"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

/**
 * A stable id for a new entry.
 *
 * `randomUUID` where available; otherwise a timestamp + random suffix. Never an
 * array index — an index would change meaning the moment the entry is moved,
 * which is precisely the bug the brief warns about.
 */
function newClickId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `click-${uuid}`;
}

function TextLabeled({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-[var(--text-default)]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">{hint}</p>}
    </div>
  );
}