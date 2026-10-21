/**
 * Browser-local profile customization draft.
 *
 * Phase 3 has no backend, so the studio persists edits to `localStorage`.
 * The same shape — plus a few appearance/section fields — becomes the
 * public profile's effective state when the profile owner has saved a
 * customization on the current device.
 *
 * The shape is versioned. `localStorage` entries with a missing or wrong
 * version are dropped so a future format change cannot crash the page.
 */

import {
  type ProfileOwner,
  type ProfileCollection,
  type ProfileSoundtrack,
  type Palette,
  PALETTE_NAMES,
  noirProfile,
} from "./noirProfile";
import {
  type ThemeId,
  type TypographyId,
  type LayoutPreset,
  type BackgroundTreatment,
  DEFAULT_THEME_ID,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_LAYOUT,
  DEFAULT_BACKGROUND,
} from "./theme";

export const PROFILE_DRAFT_KEY = "prsme:profile-draft:v1";
export const PROFILE_DRAFT_VERSION = 1;

/**
 * Versioned migrations.
 *
 * Phase 4.1 introduces an upgrade-aware reader: instead of rejecting any
 * unknown version, we read a v1 from storage, run a list of migration
 * passes, and validate the result through `readDraft`. Existing saved
 * drafts keep working without a manual wipe.
 */
type Migration = (raw: unknown) => unknown;
const DRAFT_MIGRATIONS: Migration[] = [
  (raw) => raw,
  /*
   * Phase 4.2 — normalise a draft written before `soundtrack-list` existed.
   *
   * Nothing is *upgraded* here (an old draft cannot have chosen a layout it
   * did not know). What this pass does is make the shape total so the strict
   * reader below never has to guess:
   *   - an unrecognised `layout` becomes `compact` (a dense, safe list);
   *   - a book item with no `format` is pinned to the explicit
   *     `"light-novel"` / `"standard"` pair so downstream label logic reads a
   *     real value instead of testing for absence;
   *   - any `format` on a non-book item is dropped, because "light novel" is a
   *     book-format subtype and must never leak onto a film or an album.
   */
  (raw) => {
    if (!isObject(raw)) return raw;
    const cols = raw.collections;
    if (!Array.isArray(cols)) return raw;

    const KNOWN = new Set([
      "poster-grid",
      "featured",
      "compact",
      "soundtrack-list",
    ]);

    return {
      ...raw,
      collections: cols.map((c) => {
        if (!isObject(c)) return c;
        const layout = typeof c.layout === "string" && KNOWN.has(c.layout) ? c.layout : "compact";
        const items = Array.isArray(c.items)
          ? c.items.map((it) => {
              if (!isObject(it)) return it;
              const isBook = it.kind === "book";
              if (!isBook) {
                if (!("format" in it)) return it;
                const { format: _dropped, ...rest } = it;
                return rest;
              }
              const format = it.format === "light-novel" ? "light-novel" : "standard";
              return { ...it, format };
            })
          : c.items;
        return { ...c, layout, items };
      }),
    };
  },
];

function migrate(raw: unknown): unknown {
  let current: unknown = raw;
  for (const pass of DRAFT_MIGRATIONS) {
    try {
      const next = pass(current);
      if (next !== undefined && next !== null) current = next;
    } catch {
      // A failed migration is non-fatal: the fallback is the original read.
      return raw;
    }
  }
  return current;
}

export type ProfileVisibility = "public" | "followers" | "private";

/** Section ids must be stable. The studio shows four of these tops of the public profile. */
export type SectionId = "soundtrack" | "collections" | "activity" | "clicks";

export const SECTION_LABELS: Record<SectionId, string> = {
  soundtrack: "Profile soundtrack",
  collections: "Curated shelves",
  activity: "Recent activity",
  clicks: "My Clicks",
};

export interface ProfileDraft {
  version: number;
  /** Editable subset of the public profile data. */
  identity: {
    username: string; // kept in sync with the demo for now
    displayName: string;
    bio: string;
    location: string;
    pronouns: string;
    avatarPalette: Palette;
  };
  tags: string[];
  socials: ProfileOwner["socials"];
  avatarDataUrl: string | null; // data URL (browser-local only)
  collections: ProfileCollection[];
  soundtrack: ProfileSoundtrack | null;
  appearance: {
    theme: ThemeId;
    typography: TypographyId;
    layout: LayoutPreset;
    background: BackgroundTreatment;
    /**
     * Optional owner-supplied accent colour (hex). When set, the whole accent
     * family — rating badges, tags, hover states, focus rings — is derived from
     * this single colour via `color-mix`, so the theme stays coherent.
     */
    accentOverride: string | null;
  };
  visibility: ProfileVisibility;
  sectionOrder: SectionId[];
  sectionVisibility: Record<SectionId, boolean>;
}

/* -------------------------------------------------------------------------- */

export function buildDefaultDraft(): ProfileDraft {
  const owner: ProfileOwner = noirProfile;
  return {
    version: PROFILE_DRAFT_VERSION,
    identity: {
      username: owner.username,
      displayName: owner.displayName,
      bio: owner.bio,
      location: owner.location ?? "",
      pronouns: owner.pronouns ?? "",
      avatarPalette: owner.avatarPalette,
    },
    tags: [...owner.tags],
    socials: owner.socials.map((s) => ({ ...s })),
    avatarDataUrl: null,
    collections: owner.collections.map((c) => ({ ...c, items: [...c.items] })),
    soundtrack: owner.soundtrack ? { ...owner.soundtrack } : null,
    appearance: {
      theme: DEFAULT_THEME_ID,
      typography: DEFAULT_TYPOGRAPHY,
      layout: DEFAULT_LAYOUT,
      background: DEFAULT_BACKGROUND,
      accentOverride: null,
    },
    visibility: "public",
    sectionOrder: ["soundtrack", "collections", "activity", "clicks"],
    sectionVisibility: {
      soundtrack: true,
      collections: true,
      activity: true,
      clicks: true,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

const THEME_IDS: ThemeId[] = ["obsidian", "violet", "midnight", "rose-noir", "paper"];
const TYPO_IDS: TypographyId[] = ["serif", "modern", "mono-led"];
const LAYOUT_IDS: LayoutPreset[] = ["editorial", "compact", "poster"];
const BG_IDS: BackgroundTreatment[] = ["solid", "gradient", "paper-grain"];
const SECTION_IDS: SectionId[] = ["soundtrack", "collections", "activity", "clicks"];
const VISIBILITY_VALUES: ProfileVisibility[] = ["public", "followers", "private"];
const SOC_PLATFORMS = ["facebook", "instagram", "snapchat", "linkedin"] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampString(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

/**
 * Validate and repair a value read from localStorage. Malformed data is
 * dropped and replaced with a default. This keeps Phase 3 honest about its
 * local-only guarantees — corrupted state never reaches the DOM.
 */
export function readDraft(input: unknown): ProfileDraft {
  const fallback = buildDefaultDraft();
  if (!isObject(input)) return fallback;
  if (input.version !== PROFILE_DRAFT_VERSION) return fallback;

  const id = isObject(input.identity) ? input.identity : {};
  const ap = isObject(input.appearance) ? input.appearance : {};
  const vis = isObject(input.sectionVisibility) ? input.sectionVisibility : {};

  const out: ProfileDraft = {
    version: PROFILE_DRAFT_VERSION,
    identity: {
      username: clampString(id.username, 80) || fallback.identity.username,
      displayName: clampString(id.displayName, 120) || fallback.identity.displayName,
      bio: clampString(id.bio, 4000),
      location: clampString(id.location, 120),
      pronouns: clampString(id.pronouns, 60),
      avatarPalette: (
        typeof id.avatarPalette === "string" && PALETTE_NAMES.has(id.avatarPalette as Palette)
      )
        ? (id.avatarPalette as Palette)
        : fallback.identity.avatarPalette,
    },
    tags: Array.isArray(input.tags)
      ? input.tags
          .filter((t) => typeof t === "string")
          .map((t) => (t as string).slice(0, 80))
          .filter((t) => t.trim().length > 0)
      : [...fallback.tags],
    socials: Array.isArray(input.socials)
      ? input.socials
          .filter((s) => isObject(s))
          .map((s) => {
            const obj = s as Record<string, unknown>;
            const platform = obj.platform;
            if (
              typeof platform === "string" &&
              (SOC_PLATFORMS as readonly string[]).includes(platform)
            ) {
              return {
                platform: platform as (typeof SOC_PLATFORMS)[number],
                url: clampString(obj.url, 600),
                handle: clampString(obj.handle, 100),
              };
            }
            return null;
          })
          .filter((v): v is NonNullable<typeof v> => v !== null)
      : fallback.socials.map((s) => ({ ...s })),
    avatarDataUrl:
      typeof input.avatarDataUrl === "string"
        ? input.avatarDataUrl.slice(0, 280_000) // ≈200KB ceiling on data URL
        : null,
    collections: Array.isArray(input.collections)
      ? input.collections
          .filter((c) => isObject(c) && typeof (c as Record<string, unknown>).id === "string")
          .map((c) => readCollection(c as Record<string, unknown>))
          .filter((c): c is ProfileCollection => c !== null)
      : fallback.collections.map((c) => ({ ...c, items: [...c.items] })),
    soundtrack:
      input.soundtrack === null
        ? null
        : isObject(input.soundtrack)
        ? readSoundtrack(input.soundtrack)
        : fallback.soundtrack
        ? { ...fallback.soundtrack }
        : null,
    appearance: {
      theme: THEME_IDS.includes(ap.theme as ThemeId)
        ? (ap.theme as ThemeId)
        : fallback.appearance.theme,
      typography: TYPO_IDS.includes(ap.typography as TypographyId)
        ? (ap.typography as TypographyId)
        : fallback.appearance.typography,
      layout: LAYOUT_IDS.includes(ap.layout as LayoutPreset)
        ? (ap.layout as LayoutPreset)
        : fallback.appearance.layout,
      background: BG_IDS.includes(ap.background as BackgroundTreatment)
        ? (ap.background as BackgroundTreatment)
        : fallback.appearance.background,
      accentOverride:
        typeof ap.accentOverride === "string" &&
        /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(ap.accentOverride)
          ? ap.accentOverride
          : null,
    },
    visibility: (
      VISIBILITY_VALUES as unknown as string[]
    ).includes(input.visibility as string)
      ? (input.visibility as ProfileVisibility)
      : fallback.visibility,
    sectionOrder: Array.isArray(input.sectionOrder)
      ? (input.sectionOrder as unknown[])
          .filter((s): s is SectionId =>
            typeof s === "string" && (SECTION_IDS as string[]).includes(s),
          )
      : [...fallback.sectionOrder],
    sectionVisibility: {
      soundtrack:
        typeof vis.soundtrack === "boolean" ? vis.soundtrack : fallback.sectionVisibility.soundtrack,
      collections:
        typeof vis.collections === "boolean"
          ? vis.collections
          : fallback.sectionVisibility.collections,
      activity:
        typeof vis.activity === "boolean" ? vis.activity : fallback.sectionVisibility.activity,
      clicks:
        typeof vis.clicks === "boolean" ? vis.clicks : fallback.sectionVisibility.clicks,
    },
  };

  // De-duplicate section order and ensure all sections are represented.
  const seen = new Set<string>();
  out.sectionOrder = [
    ...out.sectionOrder.filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    }),
    ...SECTION_IDS.filter((s) => !seen.has(s)),
  ];

  return out;
}

function readCollection(c: Record<string, unknown>): ProfileCollection | null {
  const id = typeof c.id === "string" ? c.id.slice(0, 80) : "";
  if (!id) return null;
  /*
   * Phase 4.2 — `soundtrack-list` joined the layout set. A draft written by an
   * older build simply cannot contain it, so nothing migrates for this case;
   * an *unknown* layout (a typo, or a future id read by an older build) falls
   * back to `compact` rather than silently becoming a poster rail, because a
   * dense list is the safer degradation for content we do not understand.
   */
  const layout =
    c.layout === "poster-grid" ||
    c.layout === "featured" ||
    c.layout === "compact" ||
    c.layout === "soundtrack-list"
      ? c.layout
      : "compact";
  const visibility =
    c.visibility === "public" || c.visibility === "followers" || c.visibility === "private"
      ? c.visibility
      : "public";
  return {
    id,
    name: clampString(c.name, 120) || "Untitled collection",
    description: typeof c.description === "string" ? clampString(c.description, 600) : undefined,
    layout,
    visibility,
    items: readCollectionItems(c.items),
    removedItemIds: Array.isArray(c.removedItemIds)
      ? (c.removedItemIds as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => clampString(x, 120))
          .slice(0, 500)
      : undefined,
  };
}

/**
 * Phase 4 — sanitize items stored on a collection. Old drafts had no Phase 4
 * fields; new drafts can carry provider identity + a review. Both shapes are
 * tolerated by the read path. Returns [] for malformed arrays to keep the
 * profile safe.
 */
function readCollectionItems(raw: unknown): ProfileCollection["items"] {
  if (!Array.isArray(raw)) return [];
  // ProfileCollection[].items is `ProfileMediaItem[]`, but Phase 4 store the
  // `SelectedMediaItem` superset. We map shared fields and ignore unknown.
  // To avoid a circular import we keep the read here lightweight: we will not
  // widen ProfileMediaItem beyond a runtime-safe subset and let the writing
  // side (the picker) populate the full shape at the point of insertion.
  return raw
    .map((item) => readProfileMediaItem(item as Record<string, unknown>))
    .filter((m): m is ProfileCollection["items"][number] => m !== null);
}

function readProfileMediaItem(item: Record<string, unknown>): ProfileCollection["items"][number] | null {
  if (typeof item.id !== "string" || !item.id) return null;
  const title = typeof item.title === "string" ? clampString(item.title, 200) : "";
  if (!title) return null;
  const kind: ProfileCollection["items"][number]["kind"] =
    item.kind === "movie" ||
    item.kind === "tv" ||
    item.kind === "music" ||
    item.kind === "manga" ||
    item.kind === "book"
      ? item.kind
      : "music";
  const palette: Palette =
    typeof item.palette === "string" && PALETTE_NAMES.has(item.palette as Palette)
      ? (item.palette as Palette)
      : "iris";
  const yearRaw = item.year;
  const yearNum =
    typeof yearRaw === "number" && Number.isFinite(yearRaw)
      ? yearRaw
      : undefined;
  const myRatingRaw = item.myRating;
  const myRating =
    typeof myRatingRaw === "number" && Number.isFinite(myRatingRaw)
      ? Math.max(0, Math.min(10, Math.round(myRatingRaw)))
      : undefined;
  return {
    id: clampString(item.id, 120),
    title,
    byline: typeof item.byline === "string" ? clampString(item.byline, 200) : undefined,
    kind,
    format:
      item.format === "light-novel" ? "light-novel" : undefined,
    myRating,
    myReview: typeof item.myReview === "string" ? clampString(item.myReview, 4_000) : undefined,
    year: yearNum,
    palette,
    provider: typeof item.provider === "string" ? clampString(item.provider, 60) : undefined,
    providerId: typeof item.providerId === "string" ? clampString(item.providerId, 120) : undefined,
    coverUrl: typeof item.coverUrl === "string" ? clampString(item.coverUrl, 600) : undefined,
    coverSource: typeof item.coverSource === "string" ? clampString(item.coverSource, 80) : undefined,
    externalUrl: typeof item.externalUrl === "string" ? clampString(item.externalUrl, 600) : undefined,
    myReviewTitle: typeof item.myReviewTitle === "string" ? clampString(item.myReviewTitle, 200) : undefined,
    myReviewSpoiler: item.myReviewSpoiler === true,
    myReviewUpdatedAt:
      typeof item.myReviewUpdatedAt === "string" ? clampString(item.myReviewUpdatedAt, 40) : undefined,
  };
}

function readSoundtrack(s: Record<string, unknown>): ProfileSoundtrack | null {
  if (s.provider !== "spotify") return null;
  const trackUrl = typeof s.trackUrl === "string" ? clampString(s.trackUrl, 600) : "";
  if (!trackUrl) return null;
  const palette: Palette =
    typeof s.palette === "string" && PALETTE_NAMES.has(s.palette as Palette)
      ? (s.palette as Palette)
      : "violet";
  return {
    provider: "spotify",
    trackUrl,
    trackTitle: clampString(s.trackTitle, 200) || "Untitled track",
    trackArtist: clampString(s.trackArtist, 200) || "Unknown artist",
    albumTitle: typeof s.albumTitle === "string" ? clampString(s.albumTitle, 200) : undefined,
    coverUrl: typeof s.coverUrl === "string" ? clampString(s.coverUrl, 600) : undefined,
    coverSource: typeof s.coverSource === "string" ? clampString(s.coverSource, 60) : undefined,
    palette,
    caption: typeof s.caption === "string" ? clampString(s.caption, 120) : undefined,
    externalUrl: typeof s.externalUrl === "string" ? clampString(s.externalUrl, 600) : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*                              localStorage IO                              */
/* -------------------------------------------------------------------------- */

export function saveDraft(draft: ProfileDraft): { ok: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { ok: false, error: "Storage is only available in the browser." };
  }
  try {
    window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Local-storage quota exceeded. Try a smaller avatar or reset the demo."
        : e instanceof Error
        ? e.message
        : "Could not save.";
    return { ok: false, error: message };
  }
}

export function loadDraft(): ProfileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Older drafts may pre-date a migration — apply them before validation.
    return readDraft(migrate(parsed) as Parameters<typeof readDraft>[0]);
  } catch {
    return null;
  }
}

export function clearStoredDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
}
