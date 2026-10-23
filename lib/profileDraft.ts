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
  type ClicksPhoto,
  type CustomLinkButton,
  type CustomLinksSection,
  type CollectionLayoutId,
  PALETTE_NAMES,
  noirProfile,
  DEFAULT_CUSTOM_LINKS_SECTION,
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
import {
  THEME_IDS_ALL,
  TYPOGRAPHY_LIST,
} from "./profileTheme";
import {
  isSafeExternalUrl,
  validateCustomLinkLabel,
  validateCustomLinkUrl,
  validateCustomLinkAccent,
  readCustomLinkShape,
  readCustomLinkStyle,
  readCustomLinkColourMode,
  readCustomLinkLayout,
} from "./validate";

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

    /*
     * The recognised set must list *every* layout the renderer can draw.
     *
     * Phase 4.3 added `poster-wall`, `review-journal`, and `album-gallery`;
     * `soundtrack-list` shipped in 4.2. An omission here is silent and total:
     * a draft that saved `poster-wall` came back out of this pass as
     * `compact`, so the chosen layout never survived a save -> reload cycle.
     * `COLLECTION_LAYOUT_IDS` is the single source of truth for the ids, and
     * it is declared further down this module — so the set is derived from it
     * rather than restated, which makes a future layout impossible to forget.
     */
    const KNOWN = new Set<string>(COLLECTION_LAYOUT_IDS);

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
export type SectionId =
  | "soundtrack"
  | "collections"
  | "reviews"
  | "links"
  | "activity"
  | "clicks";

export const SECTION_LABELS: Record<SectionId, string> = {
  soundtrack: "Profile soundtrack",
  collections: "Curated shelves",
  reviews: "Reviews",
  links: "Custom links",
  activity: "Recent activity",
  clicks: "My Clicks",
};

/**
 * Phase 4.6 — the canonical public-profile order.
 *
 * `links` sits after `collections` and before `activity` so Custom Link Buttons
 * are their own section rather than a child of My Clicks, and My Clicks stays
 * last.
 *
 * This is also the repair path for a Phase 4.5 draft: its stored
 * `sectionOrder` holds four ids and no `links`, so `readDraft` inserts the
 * missing one *here* instead of appending it — which would have put the
 * buttons after My Clicks.
 */
export const DEFAULT_SECTION_ORDER: SectionId[] = [
  "soundtrack",
  "collections",
  "links",
  "activity",
  "clicks",
];

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
  /**
   * Phase 4.3 — the My Clicks gallery, editable from the studio.
   *
   * Every entry stores a *reference* to externally hosted content (a direct
   * image URL or a public post URL) and nothing else. PRSME never receives,
   * proxies, or stores the picture itself, which is why there is no upload
   * field here at all.
   */
  clicks: ProfileOwner["clicks"];
  /**
   * Phase 4.5 — owner-defined outbound buttons rendered just before My Clicks.
   *
   * Same contract as `clicks`: the draft stores only what the visitor needs to
   * render the buttons, and an empty array is a real, honoured decision (hide
   * the section) rather than a reason to fall back to the demo.
   */
  customLinks: CustomLinkButton[];
  /**
   * Phase 4.7 — the eyebrow / heading / description that introduce the Custom
   * Links section, stored as ONE record beside the button list rather than as
   * three fields duplicated across every button.
   *
   * Always present after `readDraft` (a missing or malformed value is repaired
   * into the defaults), but any string may be empty: empty means "do not render
   * this element", and the buttons render either way.
   */
  customLinksSection: CustomLinksSection;
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

/**
 * Build the starting draft.
 *
 * `includeDemoClicks` is the one behavioural switch and it matters:
 *
 *   - `true`  (default, used by the *public profile* fallback) seeds the demo
 *     gallery, so a first-time visitor sees a profile that is not bare.
 *   - `false` (used by the *studio*) starts with an empty gallery, because the
 *     studio edits what the owner actually has. Pre-filling the editor with
 *     eight photographs the owner never added meant that "add two entries" left
 *     ten, and the editor claimed credit for content it did not create. An
 *     empty editor is the honest starting point; the demo photographs are a
 *     public-page fallback, not an editable default.
 */
export function buildDefaultDraft(
  options: { includeDemoClicks?: boolean } = {},
): ProfileDraft {
  const { includeDemoClicks = true } = options;
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
    clicks: includeDemoClicks ? owner.clicks.map((c) => ({ ...c })) : [],
    // Demo buttons seed the public-profile fallback but the studio starts
    // empty, for the same reason the gallery does: the editor must show what
    // the owner actually has, not content they never created.
    customLinks: includeDemoClicks
      ? (owner.customLinks ?? []).map((l) => ({ ...l }))
      : [],
    /*
     * Phase 4.7 — section copy is seeded from the owner's record when it has one,
     * else from the shared defaults.
     *
     * Note this is NOT gated on `includeDemoClicks`. The studio opens with an
     * empty button list, but the three copy fields are always editable, so
     * starting them blank would show placeholder prose in fields the owner has
     * not touched yet — the same mistake an empty gallery would have been.
     */
    customLinksSection: {
      ...DEFAULT_CUSTOM_LINKS_SECTION,
      ...(owner.customLinksSection ?? {}),
    },
    appearance: {
      theme: DEFAULT_THEME_ID,
      typography: DEFAULT_TYPOGRAPHY,
      layout: DEFAULT_LAYOUT,
      background: DEFAULT_BACKGROUND,
      accentOverride: null,
    },
    visibility: "public",
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sectionVisibility: {
      soundtrack: true,
      collections: true,
      /*
       * Phase 4.6 — `links` defaults to visible. The section renders nothing at
       * all when there is no valid button, so an owner who never configures one
       * sees no gap, and one who does sees it without hunting for a toggle.
       */
      links: true,
      /*
       * Phase 6 — `reviews` defaults to visible. Like `links`, the section
       * renders nothing at all when the owner has no published reviews, so
       * defaulting it to visible costs no space and means an owner who
       * publishes their first review sees it without hunting for a toggle.
       */
      reviews: true,
      activity: true,
      clicks: true,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                    Custom Link Buttons (Phase 4.5)                          */
/* -------------------------------------------------------------------------- */

const MAX_CUSTOM_LINKS = 24;

/**
 * Read persisted Custom Link Buttons.
 *
 * Backwards compatibility is the whole job here. A draft written before Phase
 * 4.5 has no `customLinks` key at all, so `Array.isArray(input)` is false and we
 * fall back to the demo buttons — exactly how every other field migrates. The
 * owner does not have to delete their saved customization to pick this feature
 * up.
 *
 * An entry is dropped unless BOTH parts are valid: a non-empty label and an
 * https destination. That is the same rule the studio enforces on save, so a
 * hand-edited or corrupted `localStorage` value cannot put an empty button or a
 * `javascript:` href on a public profile.
 */
function readCustomLinks(
  input: unknown,
  fallback: CustomLinkButton[],
): CustomLinkButton[] {
  if (!Array.isArray(input)) return fallback.map((l) => ({ ...l }));

  const out: CustomLinkButton[] = [];
  const seen = new Set<string>();

  for (const raw of input.slice(0, MAX_CUSTOM_LINKS)) {
    if (!isObject(raw)) continue;

    const label = validateCustomLinkLabel(raw.label);
    if (!label.ok || !label.label) continue;

    const url = validateCustomLinkUrl(raw.url);
    if (!url.ok || !url.url) continue;

    // Stable id: keep the stored one when it is usable, otherwise mint one.
    // Never the array index — a reorder must not rewrite an entry's identity.
    let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : "";
    if (!id || seen.has(id)) {
      const uuid =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      id = `lnk-${uuid}`;
    }
    seen.add(id);

    /*
     * Phase 4.6 — presentation fields.
     *
     * Each is read through its own validating reader and *omitted* when absent
     * or unrecognised, rather than defaulted here. That keeps a stored button
     * identical to what the owner actually saved, and leaves the renderer's
     * defaults as the single place where "what does an absent field mean" is
     * answered. A corrupt value is dropped rather than repaired: `shape:
     * "blob"` falls back to the documented default instead of rendering an
     * unstyled button.
     */
    const shape = readCustomLinkShape(raw.shape);
    const style = readCustomLinkStyle(raw.style);
    const colourMode = readCustomLinkColourMode(raw.colourMode);
    const layout = readCustomLinkLayout(raw.layout);
    const accent = validateCustomLinkAccent(raw.accent);

    out.push({
      id,
      label: label.label,
      url: url.url,
      ...(shape ? { shape } : {}),
      ...(style ? { style } : {}),
      ...(colourMode ? { colourMode } : {}),
      ...(layout ? { layout } : {}),
      // An accent only means anything in custom mode, so we never carry a
      // dangling colour around after the owner switches back to the theme.
      ...(colourMode === "custom" && accent.ok && accent.accent
        ? { accent: accent.accent }
        : {}),
    });
  }

  return out;
}
/* -------------------------------------------------------------------------- */
/*                  Custom Links section copy (Phase 4.7)                      */
/* -------------------------------------------------------------------------- */

/**
 * Per-field caps.
 *
 * These exist for the same reason `MAX_CUSTOM_LINKS` and `MAX_CLICKS` do: a
 * draft is attacker-adjacent data once it lives in `localStorage`, and an
 * unbounded string in a heading is a way to break the page rather than describe
 * it. Each cap is well above what reads as copy — the eyebrow is a short label
 * and the description is a sentence — and short enough that a pasted URL cannot
 * become a wall of text on someone's profile.
 */
const MAX_CUSTOM_LINKS_EYEBROW = 40;
const MAX_CUSTOM_LINKS_HEADING = 80;
const MAX_CUSTOM_LINKS_DESCRIPTION = 200;

/**
 * Read the Custom Links section copy out of a saved draft.
 *
 * Backward compatibility is the whole job of this function. A draft written
 * before Phase 4.7 has no `customLinksSection` key at all, so `isObject(input)`
 * is false and we return `fallback` — the defaults. That single branch is what
 * lets an owner who saved custom buttons in Phase 4.5 or 4.6 pick this feature
 * up without retyping anything: their buttons survive, and the section keeps the
 * copy it always had.
 *
 * The three fields are repaired independently, because drafts in the wild are
 * partially formed:
 *
 *   - **Missing or non-string** → the default for that field alone. A draft
 *     with a saved heading but no description still gets the default description
 *     rather than losing the other two.
 *   - **Present but too long** → truncated, never rejected. Losing the whole
 *     heading because a paste carried 400 characters would be a worse outcome
 *     than a clipped one.
 *   - **Empty string** → preserved verbatim. This is a *decision*: "do not show
 *     me an eyebrow." It must not be replaced by the default, or the owner would
 *     have no way to remove a line at all.
 *
 * Newlines are collapsed to single spaces so a copied-in multi-line value cannot
 * break the heading's line-height.
 */
function readCustomLinksSection(
  input: unknown,
  fallback: CustomLinksSection,
): CustomLinksSection {
  if (!isObject(input)) return { ...fallback };

  return {
    eyebrow: readCopyField(input.eyebrow, fallback.eyebrow, MAX_CUSTOM_LINKS_EYEBROW),
    heading: readCopyField(input.heading, fallback.heading, MAX_CUSTOM_LINKS_HEADING),
    description: readCopyField(
      input.description,
      fallback.description,
      MAX_CUSTOM_LINKS_DESCRIPTION,
    ),
  };
}

/**
 * One copy field, validated.
 *
 * Whitespace is collapsed rather than trusted — a pasted value can carry a
 * newline or a run of tabs that is invisible in the renderer but breaks the
 * heading's line-height — and the result is trimmed, because trailing spaces
 * would make the renderer's "is this blank?" check disagree with the owner.
 *
 * A missing or non-string value falls back to the default for *this field only*,
 * so one malformed entry cannot cost the other two. An empty string comes back
 * as an empty string: that is a deliberate "hide this line", not a missing value,
 * and it must survive the read unchanged or the owner could never remove a line.
 */
function readCopyField(
  raw: unknown,
  fallback: string | undefined,
  max: number,
): string {
  if (typeof raw !== "string") return fallback ?? "";
  const value = raw.replace(/\s+/g, " ").trim();
  return value.length > max ? value.slice(0, max) : value;
}

/* -------------------------------------------------------------------------- */
/*                          My Clicks (Phase 4.3)                              */
/* -------------------------------------------------------------------------- */

const MAX_CLICKS = 40;

/**
 * Read the My Clicks gallery out of a saved draft.
 *
 * Three rules, all of them load-time rather than render-time, so a corrupt or
 * hand-edited localStorage entry can never break the profile:
 *
 *  1. **Stable ids.** We require a string id and generate one only when the
 *     entry has none. An array index is never used as an id — reordering must
 *     not rewrite identity, and the React key must survive a move.
 *  2. **Validated URLs.** `imageUrl` / `postUrl` / `sourceUrl` are only kept
 *     when they pass `isSafeExternalUrl`. Anything else is dropped, which turns
 *     that entry into a placeholder card rather than a broken image. A
 *     `post` entry that loses its URL is demoted to `image` mode with no
 *     image, so it still renders the honest "post unavailable" card.
 *  3. **Required alt text.** `image` entries keep their alt text or inherit a
 *     description built from the title, because an uncaptioned image in a
 *     public gallery is invisible to anyone not looking at it.
 *
 * A draft with no `clicks` key at all (written before Phase 4.3) falls back to
 * the demo gallery, matching how every other field migrates.
 */
function readClicks(
  input: unknown,
  fallback: ProfileOwner["clicks"],
): ProfileOwner["clicks"] {
  if (!Array.isArray(input)) return fallback.map((c) => ({ ...c }));

  const out: ProfileOwner["clicks"] = [];
  const seen = new Set<string>();

  for (const raw of input.slice(0, MAX_CLICKS)) {
    if (!isObject(raw)) continue;

    const title = clampString(raw.title, 120);
    if (!title) continue;

    const mode: "image" | "post" = raw.mode === "post" ? "post" : "image";
    const imageUrl = isSafeExternalUrl(raw.imageUrl) ? raw.imageUrl : undefined;
    const postUrl = isSafeExternalUrl(raw.postUrl) ? raw.postUrl : undefined;
    const postPlatform =
      raw.postPlatform === "facebook" || raw.postPlatform === "instagram"
        ? raw.postPlatform
        : undefined;

    /*
     * A `post` entry is only honoured when it still has a URL *and* a known
     * platform. Without either, we fall through to image mode so the card
     * renders as "external post" instead of silently disappearing.
     */
    const effectiveMode: "image" | "post" =
      mode === "post" && postUrl && postPlatform ? "post" : "image";

    const id = stableClickId(raw.id, seen, out.length);

    out.push({
      id,
      title,
      ratio: CLICK_RATIOS.includes(raw.ratio as ClicksPhoto["ratio"])
        ? (raw.ratio as ClicksPhoto["ratio"])
        : "square",
      palette: PALETTES.includes(raw.palette as ClicksPhoto["palette"])
        ? (raw.palette as ClicksPhoto["palette"])
        : "mono",
      place: typeof raw.place === "string" ? clampString(raw.place, 80) : undefined,
      mode: effectiveMode,
      imageUrl: effectiveMode === "image" ? imageUrl : undefined,
      postUrl: effectiveMode === "post" ? postUrl : undefined,
      postPlatform: effectiveMode === "post" ? postPlatform : undefined,
      altText:
        typeof raw.altText === "string" && raw.altText.trim()
          ? clampString(raw.altText, 240)
          : `${title} — photograph from the owner's My Clicks gallery.`,
      sourceUrl: isSafeExternalUrl(raw.sourceUrl) ? raw.sourceUrl : undefined,
    });
  }

  return out;
}

const CLICK_RATIOS = ["tall", "wide", "square", "portrait"] as const;
const PALETTES = [
  "amber", "iris", "rose", "cyan", "forest", "sand", "mono", "violet", "rust",
] as const;

/**
 * A stable id for a gallery entry.
 *
 * `crypto.randomUUID` is used when available; otherwise we fall back to a
 * counter *seeded at read time* rather than an array index, which is the thing
 * the brief rules out. The suffix keeps two entries created in the same
 * millisecond from colliding.
 */
function stableClickId(
  raw: unknown,
  seen: Set<string>,
  position: number,
): string {
  const candidate =
    typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, 80)
      : typeof raw === "object" && raw !== null && "id" in raw
      ? String((raw as { id: unknown }).id ?? "").trim().slice(0, 80)
      : "";

  if (candidate && !seen.has(candidate)) {
    seen.add(candidate);
    return candidate;
  }

  let id = "";
  do {
    const uuid =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    id = `click-${uuid}`;
  } while (seen.has(id));
  void position;
  seen.add(id);
  return id;
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

const THEME_IDS: ThemeId[] = THEME_IDS_ALL;
const TYPO_IDS: TypographyId[] = TYPOGRAPHY_LIST.map((t) => t.id);
const LAYOUT_IDS: LayoutPreset[] = ["editorial", "compact", "poster"];
const BG_IDS: BackgroundTreatment[] = ["solid", "gradient", "paper-grain"];
const COLLECTION_LAYOUT_IDS: CollectionLayoutId[] = [
  "poster-grid",
  "featured",
  "compact",
  "soundtrack-list",
  "poster-wall",
  "review-journal",
  "album-gallery",
];

/**
 * Phase 6 — the catalogue kinds a stored profile item may carry.
 *
 * These mirror `MediaKindId` in `lib/media/types.ts`. The list lives here as
 * its own constant so the draft validator does not need to import from the
 * media layer, and so an unknown value in stored JSON is dropped rather than
 * passed through to the catalogue resolver.
 */
const CATALOG_KINDS = [
  "movie",
  "tv",
  "song",
  "album",
  "manga",
  "book",
] as const;

type CatalogKind = (typeof CATALOG_KINDS)[number];
/*
 * Phase 4.6 — kept as an alias of `DEFAULT_SECTION_ORDER` rather than a second
 * hand-written list. Two lists would drift, and the repair below depends on
 * this array being in canonical order.
 */
const SECTION_IDS: SectionId[] = [...DEFAULT_SECTION_ORDER];
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
    clicks: readClicks(input.clicks, fallback.clicks),
    customLinks: readCustomLinks(input.customLinks, fallback.customLinks),
    customLinksSection: readCustomLinksSection(
      input.customLinksSection,
      fallback.customLinksSection,
    ),
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
      reviews:
        typeof vis.reviews === "boolean" ? vis.reviews : fallback.sectionVisibility.reviews,
      links:
        typeof vis.links === "boolean" ? vis.links : fallback.sectionVisibility.links,
      clicks:
        typeof vis.clicks === "boolean" ? vis.clicks : fallback.sectionVisibility.clicks,
    },
  };

/*
   * Normalise the stored order: de-duplicate it, then insert anything it was
   * missing at its CANONICAL position rather than at the end.
   *
   * Phase 4.6 — this is the difference between "the buttons appear somewhere" and
   * "the buttons appear in the right place". A Phase 4.5 draft stores four ids
   * and has no `links` at all. The obvious repair is to append the missing ids,
   * but that is exactly wrong here: it lands Custom Link Buttons *after*
   * `clicks`, i.e. the reported bug this phase exists to fix. An earlier
   * revision of this function did precisely that, and the browser test caught it
   * (see `scripts/phase46-qa.mjs`, "Phase 4.5 draft is repaired").
   *
   * So each section is placed relative to its canonical neighbours:
   *   - present sections keep the owner's chosen order among themselves, so a
   *     deliberate reorder in the studio is preserved;
   *   - a missing section is inserted before the first present section that
   *     canonically follows it, and appended only if none does.
   *
   * Unrecognised ids are dropped: `sectionOrder` is read through `SECTION_IDS`
   * above, so anything unknown never reaches this loop.
   */
  const deduped: SectionId[] = [];
  const seen = new Set<string>();
  for (const s of out.sectionOrder) {
    if (seen.has(s)) continue;
    seen.add(s);
    deduped.push(s);
  }

  const repaired: SectionId[] = [];
  for (let i = 0; i < SECTION_IDS.length; i++) {
    const canonical = SECTION_IDS[i]!;
    if (deduped.includes(canonical)) {
      repaired.push(canonical);
      continue;
    }
    // Not stored: slot it in before the next canonically-later section the owner
    // actually has, so `links` lands between `collections` and `activity`.
    const successor = SECTION_IDS.slice(i + 1).find((s) => repaired.includes(s));
    if (successor) repaired.splice(repaired.indexOf(successor), 0, canonical);
    else repaired.push(canonical);
  }

  out.sectionOrder = repaired;

  return out;
}

function readCollection(c: Record<string, unknown>): ProfileCollection | null {
  const id = typeof c.id === "string" ? c.id.slice(0, 80) : "";
  if (!id) return null;
  /*
   * Phase 4.3 — three layouts joined the set (`poster-wall`, `review-journal`,
   * `album-gallery`). A draft written by an older build simply cannot contain
   * them, so nothing migrates for that case. An *unknown* layout (a typo, or a
   * future id read by an older build) falls back to `compact` rather than
   * silently becoming a poster rail, because a dense list is the safer
   * degradation for content we do not understand.
   */
  const layout = COLLECTION_LAYOUT_IDS.includes(c.layout as CollectionLayoutId)
    ? (c.layout as CollectionLayoutId)
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
    catalogKind: CATALOG_KINDS.includes(item.catalogKind as CatalogKind)
      ? (item.catalogKind as CatalogKind)
      : undefined,
    creatorRole:
      typeof item.creatorRole === "string" ? clampString(item.creatorRole, 80) : undefined,
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
  /*
   * Phase 4.5 - this no longer REQUIRES `provider: "spotify"`.
   *
   * The old guard was `if (s.provider !== "spotify") return null`, so a draft
   * whose URL pointed at Apple Music was discarded outright unless it also lied
   * and said `"spotify"`. That is precisely the contradiction the brief calls
   * out: a stored `provider` label has no business disagreeing with the URL the
   * card actually opens. The destination now decides. `provider` survives on
   * the type only for back-compat; the provider used for the icon and the href
   * is derived from the URL at render time (`resolveSoundtrackProvider`), so the
   * mark and the destination can never disagree.
   */
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
