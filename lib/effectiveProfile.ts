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
import { isSafeExternalUrl } from "./validate";

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
    /*
     * Phase 4.3 — My Clicks flows through the draft, including when it is empty.
     *
     * The demo gallery is a *first-visit* fallback applied once, at read time:
     * `readDraft` → `readClicks` substitutes `defaults.clicks` only when the
     * stored value is not an array (i.e. a draft written before Phase 4.3 had
     * no `clicks` key at all). By the time a draft reaches here `clicks` is
     * always an array, so an empty one is a real, honoured decision.
     *
     * Falling back to `defaults.clicks` on `length === 0` — as this branch
     * previously did — made the empty state unreachable: an owner who removed
     * every entry got the demo's eight photographs back on the next render,
     * with no way to ever show the "add your first click" explanation.
     */
    clicks: draft.clicks,
    /*
     * Phase 4.5 — Custom Link Buttons follow the same contract as `clicks`:
     * the stored array is authoritative, and only entries that are actually
     * renderable survive. A button missing a label or carrying a non-https URL
     * is dropped here rather than being filtered at the point of render, so the
     * public section can never emit an empty button.
     *
     * Phase 4.6 keeps that filter, so an invalid button never reaches the
     * section, and adds nothing: the presentation fields are already validated
     * by `readCustomLinks` on the way out of storage and are re-checked here
     * only in the sense that a shape/style/layout value is passed through
     * untouched. `ProfileCustomLinks` owns the defaults.
     */
    customLinks: draft.customLinks.filter(
      (l) =>
        Boolean(l.label.trim()) &&
        Boolean(isSafeExternalUrl(l.url)) &&
        l.url.startsWith("https://"),
    ),
    /*
     * Phase 4.7 — section copy is passed through, not rebuilt.
     *
     * `readDraft` has already repaired it: a pre-4.7 draft has been filled with
     * the defaults, a malformed field has been replaced, and a blank field has
     * been preserved as a deliberate "hide this line". Re-deriving anything here
     * would undo that distinction — above all, treating an empty string as
     * "missing" would resurrect a heading the owner had deliberately removed.
     */
    customLinksSection: { ...draft.customLinksSection },
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
 * Materialize collections for display: take the draft's order / visibility /
 * layout / description, and resolve each shelf's *item list*.
 *
 * The item list is owned by the draft. `removedItemIds` is applied against the
 * demo shelf only so a draft written before Phase 4 — which stored
 * `items: []` but kept `removedItemIds` — still renders the right shelf, and
 * so an item the owner deleted stays deleted.
 *
 * The merge this function used to perform — "demo items first, draft items not
 * already present appended" — was wrong in a way that got worse as the layout
 * library grew:
 *
 *   - It made removal impossible. Deleting a poster from a shelf could never
 *     take effect, because the demo copy was re-merged on the very next render.
 *   - It made the shelf's contents a function of history rather than of the
 *     owner. A shelf authored with four films rendered ten, the extra six
 *     inherited from the demo data it was supposed to have replaced.
 *
 * The demo shelf is still reachable in exactly one case: a draft that names no
 * items at all *and* carries no removals is treated as pre-Phase-4 and falls
 * back to the pristine demo content. Everything else is the owner's truth.
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

      // Pre-Phase-4 draft: no items and no recorded removals means "I never
      // touched this shelf", so the demo content stands in for it.
      const isUntouchedDraft = c.items.length === 0 && removed.size === 0;
      const baseItems = isUntouchedDraft
        ? (original?.items ?? [])
        : c.items;

      return {
        ...c,
        items: baseItems
          .filter((i) => !removed.has(i.id))
          .map((i) => ({ ...i })),
        description: c.description ?? original?.description,
      };
    });
}
