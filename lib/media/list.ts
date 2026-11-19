/**
 * My List — category definitions.
 *
 * The list is a single personal queue, and the three groups it divides into
 * are a FUNCTION of the canonical media item's catalogue kind. They are not
 * stored on the list row: the kind already lives on `media_items`, it is
 * already constrained there, and a second copy could disagree with it.
 *
 * The mapping is derived from `MediaKindId`, so a new catalogue kind would
 * have to be classified here rather than silently falling out of every
 * category — which is the point: an unclassified kind is a visible bug, not a
 * silent disappearance.
 */

/** The three list categories, plus the "everything" view. */
export type ListCategoryId = "all" | "to-watch" | "to-read" | "to-listen";

export interface ListCategory {
  id: ListCategoryId;
  /** The label shown on the filter. */
  label: string;
  /** A one-line explanation of what belongs here. */
  description: string;
  /**
   * The catalogue kinds this category covers.
   *
   * Empty for `all`, which is the absence of a filter rather than a set of
   * kinds.
   */
  kinds: readonly string[];
}

/**
 * The categories, in display order.
 *
 *   to-watch   films and TV series
 *   to-read    books, manga, and light novels
 *   to-listen  songs and albums
 *
 * The brief names light novels explicitly. PRSME's catalogue does not have a
 * separate "light novel" kind — a light novel is a `book` or a `manga` in
 * this catalogue — so those kinds are what the category covers. Inventing a
 * new media kind would mean inventing catalogue rows, which is exactly what
 * the brief says not to do.
 */
export const LIST_CATEGORIES: readonly ListCategory[] = [
  {
    id: "all",
    label: "All",
    description: "Everything on your list, whatever kind it is.",
    kinds: [],
  },
  {
    id: "to-watch",
    label: "To Watch",
    description: "Films and TV series you want to get to.",
    kinds: ["movie", "tv"],
  },
  {
    id: "to-read",
    label: "To Read",
    description: "Books, manga, and light novels.",
    kinds: ["book", "manga"],
  },
  {
    id: "to-listen",
    label: "To Listen",
    description: "Songs and albums.",
    kinds: ["song", "album"],
  },
];

export const LIST_CATEGORY_IDS: readonly ListCategoryId[] = LIST_CATEGORIES.map(
  (c) => c.id,
);

/** The category a catalogue kind falls into, or `null` if it has none. */
export function categoryForKind(kind: string): ListCategoryId | null {
  for (const category of LIST_CATEGORIES) {
    if (category.kinds.includes(kind)) return category.id;
  }
  return null;
}

/** The catalogue kinds a category covers. Empty for `all`. */
export function kindsForCategory(category: ListCategoryId): readonly string[] {
  return LIST_CATEGORIES.find((c) => c.id === category)?.kinds ?? [];
}

/**
 * Is this a category id we understand?
 *
 * Anything unrecognised falls back to `all`, so a hand-edited URL cannot
 * produce an error page — it produces the unfiltered list.
 */
export function normaliseCategory(value: unknown): ListCategoryId {
  if (typeof value !== "string") return "all";
  const trimmed = value.trim().toLowerCase();
  return (LIST_CATEGORY_IDS as readonly string[]).includes(trimmed)
    ? (trimmed as ListCategoryId)
    : "all";
}
