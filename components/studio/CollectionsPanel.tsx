"use client";

import { useState } from "react";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import type { ProfileCollection, ProfileMediaItem } from "@/lib/noirProfile";
import {
  addRecordToCollection,
  allowedKindsForCollection,
  applyReviewToItem,
  defaultKindForCollection,
  removeItemFromCollection,
} from "@/lib/collectionMedia";
import type { MediaKindId, MediaRecord } from "@/lib/media/types";
import { PanelCard, FieldGroup, TextInput, TextArea, Select } from "./StudioFields";
import { IconUp, IconDown, IconTrash, IconPlus, IconX, IconSearch } from "./StudioIcons";
import { MediaPicker } from "./MediaPicker";
import { ReviewEditor, type ReviewDraft, reviewFromItem, validateReview } from "./ReviewEditor";

const LAYOUT_LABELS = {
  "poster-grid": "Poster grid",
  "featured": "Featured",
  "compact": "Compact",
} as const;

type LayoutKey = keyof typeof LAYOUT_LABELS;
type VisibilityKey = "public" | "followers" | "private";

export function CollectionsPanel() {
  const { draft, update } = useProfileDraft();
  const list = draft.collections;
  const [notice, setNotice] = useState<string | null>(null);

  function patch(index: number, patch: Partial<ProfileCollection>) {
    const next = list.map((c, i) => (i === index ? { ...c, ...patch } : c));
    update({ collections: next });
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[index]!;
    const b = list[j]!;
    const next = [...list];
    next[index] = b;
    next[j] = a;
    update({ collections: next });
  }

  function remove(index: number) {
    update({ collections: list.filter((_, i) => i !== index) });
  }

  function add() {
    const id = nextCollectionId(list);
    const fresh: ProfileCollection = {
      id,
      name: "New collection",
      description: "An empty collection — populate it from a real catalogue below.",
      layout: "poster-grid",
      visibility: "public",
      items: [],
    };
    update({ collections: [...list, fresh] });
  }

  /**
   * Add a catalogue record to a collection, refusing in-collection duplicates.
   *
   * Phase 4.2 — `format` is the book subtype the user was in the picker. When
   * the provider's own metadata already marked the record (Open Library /
   * Google Books subjects), that evidence wins; otherwise the picker's choice
   * is recorded so a Books shelf can hold a deliberate mix.
   */
  function addItem(
    collectionId: string,
    record: MediaRecord,
    format?: "standard" | "light-novel",
  ) {
    const { collections, outcome } = addRecordToCollection(list, collectionId, record, {
      format: record.kind === "book" ? format : undefined,
    });
    if (!outcome.ok) {
      setNotice(`“${record.title}” is already in this collection.`);
      return;
    }
    setNotice(null);
    update({ collections });
  }

  function removeItem(collectionId: string, itemId: string) {
    update({ collections: removeItemFromCollection(list, collectionId, itemId) });
  }

  function setReview(itemId: string, review: ReviewDraft) {
    const patch: {
      myRating?: number;
      myReviewTitle?: string;
      myReview?: string;
      myReviewSpoiler?: boolean;
    } = {};
    if (review.rating !== null) patch.myRating = review.rating;
    if (review.title.trim()) patch.myReviewTitle = review.title.trim();
    if (review.body.trim()) patch.myReview = review.body.trim();
    else patch.myReview = undefined;
    patch.myReviewSpoiler = review.spoiler;
    update({ collections: applyReviewToItem(list, itemId, patch) });
  }

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-collections-list"
        title="Collections"
        description="Each tile below is one section on the public profile. Reorder with the up/down arrows."
      >
        <ol className="space-y-3" data-testid="studio-collections">
          {list.map((c, i) => (
            <li
              key={c.id}
              data-testid={`studio-collection-${c.id}`}
              className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] p-3"
            >
              <CollectionEditor
                collection={c}
                index={i}
                total={list.length}
                onPatch={(p) => patch(i, p)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onRemove={() => remove(i)}
                onAddItem={(record) => addItem(c.id, record)}
                onRemoveItem={(itemId) => removeItem(c.id, itemId)}
                onSetReview={(itemId, review) => setReview(itemId, review)}
                isNewCollection={c.id.startsWith("col-new-")}
              />
            </li>
          ))}
        </ol>

        {notice && (
          <p
            className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-default)]"
            role="status"
            aria-live="polite"
            data-testid="studio-collection-notice"
          >
            {notice}
          </p>
        )}

        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-default)] hover:bg-[var(--surface-4)]"
          data-testid="studio-collection-add"
        >
          <IconPlus size={12} /> New collection
        </button>
      </PanelCard>
    </div>
  );
}

function nextCollectionId(list: ProfileCollection[]) {
  // Stable IDs derived from array index, NOT based on grid position.
  // We namespace them so demos and user-created collections cannot collide.
  let n = 1;
  while (list.find((c) => c.id === `col-new-${n}`)) n++;
  return `col-new-${n}`;
}

function CollectionEditor({
  collection,
  index,
  total,
  onPatch,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddItem,
  onRemoveItem,
  onSetReview,
  isNewCollection,
}: {
  collection: ProfileCollection;
  index: number;
  total: number;
  onPatch: (p: Partial<ProfileCollection>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onAddItem: (
    record: MediaRecord,
    format?: "standard" | "light-novel",
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onSetReview: (itemId: string, review: ReviewDraft) => void;
  isNewCollection: boolean;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
  const [pickerInitialKind, setPickerInitialKind] = useState<MediaKindId>(
    () => defaultKindForCollection(collection),
  );

  const reviewingItem =
    reviewingItemId === null
      ? null
      : collection.items.find((i) => i.id === reviewingItemId) ?? null;

  return (
    <div>
      {pickerOpen && (
        <MediaPicker
          initialKind={pickerInitialKind}
          allowedKinds={allowedKindsForCollection(collection)}
          onSelect={(record, format) => {
            onAddItem(record, format);
            setPickerOpen(false);
            setPickerInitialKind(record.kind);
          }}
          onClose={() => setPickerOpen(false)}
          collectionName={collection.name}
        />
      )}
      {reviewingItem && (
        <ReviewDrawer
          item={reviewingItem}
          onSave={(review) => {
            onSetReview(reviewingItem.id, review);
            setReviewingItemId(null);
          }}
          onClose={() => setReviewingItemId(null)}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
            Collection · {collection.id}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[13px] font-medium text-[var(--text-strong)]">
            {collection.name || "Untitled collection"}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">
            {collection.description || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move collection up"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
          >
            <IconUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move collection down"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
          >
            <IconDown size={14} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            aria-label={`Remove collection ${collection.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[color:#D6757B]"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {confirmRemove && (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-2 rounded-md border border-[color:#D6757B]/60 bg-[color:#391A22] px-3 py-2 text-[11px] text-[var(--text-strong)]"
        >
          <span>
            Remove <strong>{collection.name}</strong>? This appears empty on the
            public profile.
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] px-2 py-1 text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onRemove();
                setConfirmRemove(false);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[color:#D6757B] bg-[color:#391A22] px-2 py-1 text-[11px]"
            >
              <IconX size={12} /> Remove
            </button>
          </span>
        </div>
      )}

      <div className="mt-3 space-y-3">
        <FieldGroup id={`f-name-${collection.id}`} label="Name">
          <TextInput
            id={`f-name-${collection.id}`}
            value={collection.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </FieldGroup>
        <FieldGroup id={`f-desc-${collection.id}`} label="Description">
          <TextArea
            id={`f-desc-${collection.id}`}
            rows={2}
            value={collection.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            maxLength={300}
          />
        </FieldGroup>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldGroup id={`f-layout-${collection.id}`} label="Layout">
            <Select
              id={`f-layout-${collection.id}`}
              value={collection.layout}
              onChange={(e) =>
                onPatch({ layout: e.target.value as ProfileCollection["layout"] })
              }
            >
              {(
                Object.entries(LAYOUT_LABELS) as Array<[LayoutKey, string]>
              ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup id={`f-vis-${collection.id}`} label="Visibility">
            <Select
              id={`f-vis-${collection.id}`}
              value={collection.visibility}
              onChange={(e) =>
                onPatch({
                  visibility: e.target.value as ProfileCollection["visibility"],
                })
              }
            >
              <option value="public">Public</option>
              <option value="followers">Followers only</option>
              <option value="private">Private</option>
            </Select>
          </FieldGroup>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[12px]">
          <label className="flex items-center gap-2 text-[var(--text-default)]" htmlFor={`f-show-${collection.id}`}>
            <input
              id={`f-show-${collection.id}`}
              type="checkbox"
              checked={!isHidden(collection.id)}
              onChange={(e) =>
                onPatch({ visibility: e.target.checked ? collection.visibility : "private" })
              }
              className="h-3.5 w-3.5 accent-[var(--accent-400)]"
            />
            Show on public profile
          </label>
          <span className="text-[11px] text-[var(--text-muted)]">
            Showing as {collection.visibility === "private" ? "private" : `${collection.visibility}`}
          </span>
        </div>

        {isNewCollection && (
          <div className="rounded-md border border-[color:var(--accent-400)]/40 bg-[color:var(--accent-400)]/8 px-3 py-2 text-[11px] text-[var(--text-muted)]">
            New collection — empty by design. Use “Add media” below to seed it from a catalogue.
          </div>
        )}

        {/* Items list */}
        <div className="mt-2 space-y-2" data-testid={`studio-collection-items-${collection.id}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--text-default)]">
              Items ({collection.items.length})
            </p>
            <button
              type="button"
              data-testid={`studio-collection-add-${collection.id}`}
              onClick={() => {
                setPickerInitialKind(defaultKindForCollection(collection));
                setPickerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
            >
              <IconSearch size={12} /> Add media
            </button>
          </div>

          {collection.items.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 text-center text-[12px] text-[var(--text-muted)]">
              No items yet. Click <span className="font-medium">Add media</span> to search a real catalogue.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {collection.items.map((item) => (
                <li
                  key={item.id}
                  data-testid={`studio-collection-item-${item.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--text-strong)]" title={item.title}>
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {[item.byline, item.year, item.provider].filter(Boolean).join(" · ") || "Demo item"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`studio-item-review-${item.id}`}
                      onClick={() => setReviewingItemId(item.id)}
                      title={`Write or edit your review of ${item.title}`}
                      className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--text-default)] hover:border-[var(--line-strong)]"
                    >
                      {item.myReviewTitle || item.myReview ? "Edit review" : "Add review"}
                    </button>
                    <button
                      type="button"
                      data-testid={`studio-item-remove-${item.id}`}
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove ${item.title}`}
                      className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[color:#D6757B] hover:border-[color:#D6757B]/40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ReviewDrawer — opens the review editor inline inside the collection editor.
 * (The dialog lives in the same DOM tree so the studio grid layout doesn't
 * shift; we have already proven dialogs work in Profile 3.1.)
 */
function ReviewDrawer({
  item,
  onSave,
  onClose,
}: {
  item: ProfileMediaItem;
  onSave: (review: ReviewDraft) => void;
  onClose: () => void;
}) {
  const [review, setReview] = useState<ReviewDraft>(() => reviewFromItem(item));
  const validation = validateReview(review);
  return (
    <div
      className="mt-3 rounded-md border border-[var(--accent-400)]/50 bg-[var(--surface-1)] p-3"
      data-testid="studio-review-drawer"
    >
      <p className="mb-2 text-[11px] font-medium text-[var(--text-muted)]">
        Editing your review of{" "}
        <span className="text-[var(--text-strong)]">{item.title}</span>
      </p>
      <ReviewEditor
        item={item}
        review={review}
        onChange={setReview}
        onSave={() => {
          if (validation.ok) onSave(review);
        }}
        onCancel={onClose}
        authorName="@noir"
      />
      {!validation.ok &&
        (review.title.trim().length > 0 || review.body.trim().length > 0) && (
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
            {validation.message}
          </p>
        )}
    </div>
  );
}

function isHidden(id: string) {
  // We don't currently maintain collection-level hide flag — visibility is
  // the explicit "private" field. Keep the helper for future "hide"
  // support without changing the data model now.
  void id;
  return false;
}