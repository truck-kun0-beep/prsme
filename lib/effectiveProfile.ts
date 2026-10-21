/**
 * Adapter from `ProfileDraft` to the public-profile `ProfileOwner` shape.
 *
 * The Phase 2 presentation components consume `ProfileOwner`. Phase 3 keeps
 * those components entirely untouched — we build a virtual `ProfileOwner`
 * out of the demo defaults + the saved draft. This is *the* contract that
 * guarantees /u/noir and /studio never diverge visually for unrelated data.
 */

import type { ProfileOwner, ProfileCollection, ProfileMediaItem } from "./noirProfile";
import type { ProfileDraft, SectionId } from "./profileDraft";

interface EffectiveOwnerOptions {
  /**
   * Restrict the public profile to a particular section order and
   * visibility. The studio passes a specific section list when previewing;
   * the public profile uses the canonical ordered set.
   */
  sectionOrder?: SectionId[];
  sectionVisibility?: Record<SectionId, boolean>;
}

export function buildEffectiveOwner(
  defaults: ProfileOwner,
  draft: ProfileDraft | null,
  options: EffectiveOwnerOptions = {},
): ProfileOwner {
  if (!draft) {
    return {
      ...defaults,
      collections: orderCollections(defaults.collections),
    };
  }

  const demoLookup = buildDemoCollectionLookup(defaults);

  // Collections carry the demo's item content forward so a saved customization
  // never empties a shelf. Phase 3.1 edits metadata (name, description,
  // layout, visibility, order) but not item content, so the pristine demo
  // items are re-attached by stable collection id.
  const collections = materializeCollections(draft, demoLookup);

  // Identity
  const identity = {
    username: defaults.username, // username is locked to "noir" in Phase 3
    displayName: draft.identity.displayName.trim() || defaults.displayName,
    bio: draft.identity.bio.trim() || defaults.bio,
    location: draft.identity.location.trim() || undefined,
    pronouns: draft.identity.pronouns.trim() || undefined,
    avatarPalette: draft.identity.avatarPalette,
    tags: dedupeTags(draft.tags),
    socials: draft.socials.filter((s) => (s.url ?? "").trim().length > 0),
    collections: orderCollections(collections),
    recent: defaults.recent,
    clicks: defaults.clicks,
    soundtrack: draft.soundtrack && draft.soundtrack.trackUrl ? draft.soundtrack : undefined,
  };

  // We embed `avatarDataUrl` as a separate field via type-only extension.
  // The header reads `avatarPalette`; the avatar component is responsible
  // for honouring `avatarDataUrl` if present (see ProfileHeader refactor).
  const withAvatar = identity as ProfileOwner & { avatarDataUrl?: string | null };
  withAvatar.avatarDataUrl = draft.avatarDataUrl;
  // Follower/following demo stats stay off the customizable draft and come
  // straight from the demo owner so a real backend can replace them later.
  withAvatar.socialStats = defaults.socialStats;

  // Optional section reordering (used by /studio preview; /u/noir receives
  // them via the draft directly).
  return withAvatar;
}

function orderCollections(cs: ProfileCollection[]): ProfileCollection[] {
  // Same order as received; the studio explicitly builds a new array.
  return cs.map((c) => ({ ...c, items: [...c.items] }));
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Sort collections by their stable IDs (we don't reorder collections by
 * default here — the studio reorders via sectionOrder; collections stick
 * together as a block).
 */
export function visibleCollectionsFor(
  draft: ProfileDraft,
): ProfileCollection[] {
  return draft.collections.filter((c) => Boolean(c.id && c.name));
}

/**
 * Helper: extract the array of items that the *actual* demo uses for
 * `defaults.collections`. Phase 3 only renames / reorders / changes layout
 * / visibility — content is preserved from the demo. This keeps the
 * default richness on /u/noir.
 */
export interface DemoCollectionContentLookup {
  byId: Record<string, ProfileCollection>;
}

export function buildDemoCollectionLookup(owner: ProfileOwner): DemoCollectionContentLookup {
  const byId: Record<string, ProfileCollection> = {};
  for (const c of owner.collections) byId[c.id] = c;
  return { byId };
}

/**
 * Materialize collections for display: take the draft's order/visibility/
 * layout/description, and merge the draft's items with the demo's.
 *
 * Phase 4 rule (this replaced the old "demo always wins" behaviour):
 *   - Demo items come first, in their demo order.
 *   - Draft items that are NOT already in the demo shelf are appended.
 *   - A draft item whose id matches a demo item replaces it in place, so
 *     editing a demo item's review is visible without reordering the shelf.
 *
 * This is why adding one TV show does not wipe the five demo posters, and why
 * a draft written before Phase 4 (which stores `items: []`) still renders the
 * full demo shelves.
 */
export function materializeCollections(
  draft: ProfileDraft,
  demoLookup: DemoCollectionContentLookup,
): ProfileCollection[] {
  return draft.collections
    .slice()
    .map<ProfileCollection>((c) => {
      const original = demoLookup.byId[c.id];
      const removed = new Set(c.removedItemIds ?? []);
      const demoItems: ProfileMediaItem[] = original
        ? original.items.filter((i) => !removed.has(i.id))
        : [];

      // Index the surviving demo items by id so a draft edit can replace in
      // place without moving the item to the end of the shelf.
      const merged: ProfileMediaItem[] = demoItems.map((i) => ({ ...i }));
      const indexById = new Map(merged.map((i, idx) => [i.id, idx]));

      for (const item of c.items) {
        const existing = indexById.get(item.id);
        if (existing !== undefined) {
          merged[existing] = { ...merged[existing], ...item };
        } else {
          merged.push({ ...item });
        }
      }

      return {
        ...c,
        items: merged,
        description: c.description ?? original?.description,
      };
    });
}
