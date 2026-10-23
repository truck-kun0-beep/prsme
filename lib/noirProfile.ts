/**
 * Fictional demo data for the Phase 2 public profile experience.
 *
 * Everything here is hand-written, clearly fictional, and never wired to a
 * backend or external media API. The shape is intentionally rich enough to
 * exercise the real consumer UI (rating types, social platforms, collections,
 * recent activity, My Clicks gallery) without requiring more data later.
 */

export type Palette =
  | "amber"
  | "iris"
  | "rose"
  | "cyan"
  | "forest"
  | "sand"
  | "mono"
  | "violet"
  | "rust";

export type MediaKind =
  | "movie"
  | "tv"
  | "music"
  | "manga"
  | "book";

/**
 * Mapping rule from the provider/catalogue kind to the profile card kind.
 * PRSME keeps a single `music` kind on `ProfileMediaItem` so demo items
 * never shift, while the picker still distinguishes songs and albums.
 */
export function profileKindFor(
  pickerKind: "movie" | "tv" | "song" | "album" | "manga" | "book",
): MediaKind {
  if (pickerKind === "song" || pickerKind === "album") return "music";
  return pickerKind;
}

/**
 * Book-format subtype. Defaults to "standard" when absent.
 *
 * A light novel is a book-format *style*, not a separate catalogue: it shares
 * the Books picker, artwork pipeline, ratings, reviews, and layouts. The
 * subtype exists only so the UI can label it honestly.
 */
export type BookFormat = "standard" | "light-novel";

/**
 * Layout identifiers accepted by every collection renderer.
 *
 * Phase 4.3 adds three general layouts (`poster-wall`, `review-journal`) and
 * one music layout (`album-gallery`) alongside the four that shipped earlier.
 * `soundtrack-list` and `album-gallery` are *music* layouts; they render
 * square, softly rounded artwork and read badly against 2:3 posters, so the
 * studio only offers them for music-compatible collections (see
 * `isMusicLayout` / `collectionAcceptsMusicLayouts`).
 */
export type CollectionLayoutId =
  /* Established layouts — preserved exactly. */
  | "poster-grid"
  | "featured"
  | "compact"
  | "soundtrack-list"
  /* Phase 4.3 additions. */
  | "poster-wall"
  | "review-journal"
  | "album-gallery";

/** Human-readable layout names for the studio selector. */
export const COLLECTION_LAYOUT_LABELS: Record<CollectionLayoutId, string> = {
  "poster-grid": "Poster grid",
  featured: "Featured",
  compact: "Compact",
  "soundtrack-list": "Soundtrack list",
  "poster-wall": "Poster Wall",
  "review-journal": "Review Journal",
  "album-gallery": "Album Gallery",
};

/**
 * Layouts that treat artwork as square and are only meaningful for music.
 *
 * A movie poster forced into a rounded square reads as a mistake, so these are
 * offered exclusively on music collections. Every layout remains *renderable*
 * for any collection — a draft saved with `album-gallery` on a film shelf
 * still renders (and still renders honestly) rather than throwing.
 */
export const MUSIC_LAYOUT_IDS: CollectionLayoutId[] = [
  "soundtrack-list",
  "album-gallery",
];

export function isMusicLayout(layout: CollectionLayoutId): boolean {
  return MUSIC_LAYOUT_IDS.includes(layout);
}

/**
 * Phase 4.3 — can this collection carry music layouts?
 *
 * A collection qualifies when every item on it is music, or when it is still
 * empty (the owner is about to pick media and may well choose albums). A shelf
 * that already holds films or books does not qualify: offering Square Artwork
 * there would be a suggestion PRSME cannot honour.
 */
export function collectionAcceptsMusicLayouts(
  collection: Pick<ProfileCollection, "items">,
): boolean {
  if (collection.items.length === 0) return true;
  return collection.items.every((i) => i.kind === "music");
}

export interface SocialLink {
  platform: "facebook" | "instagram" | "snapchat" | "linkedin";
  /** Public profile URL — never authenticated, never used for OAuth. */
  url: string;
  handle: string;
}

export interface ProfileMediaItem {
  id: string;
  title: string;
  /** Sub-title (e.g. director, artist, author). Optional. */
  byline?: string;
  kind: MediaKind;
  /**
   * Phase 4.2 — book-format subtype.
   *
   * A light novel is a *book*, not a separate catalogue: it shares the Books
   * picker, artwork, rating, review, and layout behaviour. The subtype only
   * exists so the UI can label it honestly and so a Books shelf can mix
   * standard books and light novels without pretending they are the same
   * thing. Absent means "standard book".
   */
  format?: BookFormat;
  /** The owner's personal rating on a 0–10 scale. Optional. */
  myRating?: number;
  /** Owner's short written review. Optional. */
  myReview?: string;
  /** Display year, when meaningful. */
  year?: number;
  /** Optional artwork palette used by `Artwork.tsx`. */
  palette: Palette;
  /**
   * Phase 4 — when the item was added via the media picker, the provider
   * identity is preserved so the same record can be re-resolved. Items
   * without `provider` are demo items that were hand-authored.
   */
  provider?: string;
  /**
   * Phase 6 — the picker kind, preserved separately from `kind`.
   *
   * `kind` collapses a song and an album into "music" for the card layout.
   * The shared catalogue needs the distinction (a media page is for an album
   * or for a song, not for "music"), so the original picker kind is kept
   * here and is what gets sent to the catalogue resolver.
   */
  catalogKind?: "movie" | "tv" | "song" | "album" | "manga" | "book";
  /** The provider's role for `creator` ("Director", "Artist", …). */
  creatorRole?: string;
  providerId?: string;
  /** Provider-attributed artwork URL, if any. */
  coverUrl?: string;
  coverSource?: string;
  externalUrl?: string;
  /**
   * Optional longer review metadata: a review title and a spoiler indicator.
   * Keeping these separate from `byline` so legacy demos stay tidy.
   */
  myReviewTitle?: string;
  myReviewSpoiler?: boolean;
  /**
   * ISO timestamp of the last time the owner updated the review. Browser-only;
   * never used for gating.
   */
  myReviewUpdatedAt?: string;
}

export interface ProfileCollection {
  id: string;
  /** Invented collection name — there is no fixed "Favourite Movies" category. */
  name: string;
  /** A short description shown beneath the name. Optional. */
  description?: string;
  /**
   * Layout hint the consumer can use to vary visual treatments.
   *
   * Phase 4.2 adds `soundtrack-list` — a vertical list of compact soundtrack
   * cards, intended for music collections. Every layout is safe on any
   * collection; `soundtrack-list` simply reads best when the items are songs
   * or albums.
   */
  layout: CollectionLayoutId;
  /** Future-friendly: "public" | "followers" | "private". */
  visibility: "public" | "followers" | "private";
  items: ProfileMediaItem[];
  /**
   * Phase 4 — ids the owner explicitly removed from this shelf.
   *
   * The public profile merges demo items with draft items (so a fresh draft
   * never wipes the demo shelves). Removal therefore has to be recorded, or a
   * removed demo item would reappear on every render.
   */
  removedItemIds?: string[];
}

/**
 * A Custom Link Button (Phase 4.5).
 *
 * An owner-defined outbound button on the public profile — portfolio, shop,
 * channel, event, anything they want to promote. Deliberately minimal: a
 * visible label and a destination. That separation is the point:
 *
 *   - `label` is what the visitor reads. It is the ONLY text rendered.
 *   - `url` is where the button goes. It is never displayed as body text or as
 *     decorative metadata, so a long tracking query string cannot leak into the
 *     design.
 *
 * `id` is stable and is never an array index: reordering must not rewrite an
 * entry's identity, and the React key has to survive a move.
 */
export interface CustomLinkButton {
  id: string;
  /** Visible button text. Non-empty, clamped, and owner-supplied. */
  label: string;
  /** Destination. Must pass `isSafeExternalUrl` before it is ever stored. */
  url: string;
  /** Phase 4.6 — corner treatment. Default `rounded`. */
  shape?: CustomLinkShape;
  /** Phase 4.6 — fill treatment. Default `solid`. */
  style?: CustomLinkStyle;
  /** Phase 4.6 — `"theme"` follows the profile accent; `"custom"` uses `accent`. */
  colourMode?: CustomLinkColourMode;
  /** Phase 4.6 — owner accent (hex), used only when `colourMode` is `"custom"`. */
  accent?: string;
  /** Phase 4.6 — row arrangement. Default `stack` (full width, one per row). */
  layout?: CustomLinkLayout;
}

/**
 * Phase 4.7 — the Custom Links *section* copy, as profile data.
 *
 * Until this type existed the eyebrow ("Elsewhere"), the heading ("Where to find
 * Noir."), and the description ("Other work, other rooms, other ways in.") were
 * hardcoded inside the public profile renderer, so an owner could name their
 * buttons but could never introduce them.
 *
 * The shape is deliberately separate from `CustomLinkButton[]`:
 *
 *   - The buttons are a *list* — many records, each with its own id, label, url,
 *     and order. Copy belongs to the section, not to any one button, and storing
 *     it on every record would mean three edits for one change and no way to say
 *     "no heading".
 *   - Each field is optional-by-omission. An empty string means "do not render
 *     this element", which is different from "render an empty one". The renderer
 *     drops the element *and its spacing*; the buttons stay visible.
 *
 * The heading is *never* derived from the display name. "Where to find Noir." is
 * only the demo's default copy — the owner types whatever they want, including a
 * heading that has nothing to do with their PRSME display name.
 */
export interface CustomLinksSection {
  /** Short intro label above the heading. Optional. */
  eyebrow?: string;
  /** The section heading. Optional, and entirely owner-authored. */
  heading?: string;
  /** Supporting sentence under the heading. Optional. */
  description?: string;
}

/**
 * The default section copy.
 *
 * These are the three strings that were hardcoded in the renderer before Phase
 * 4.7, kept verbatim so every profile that never customised the section renders
 * exactly what it did before. They live here rather than in the component so the
 * draft reader, the studio editor, and the renderer cannot disagree about what
 * "reset to defaults" means.
 */
export const DEFAULT_CUSTOM_LINKS_SECTION: Required<CustomLinksSection> = {
  eyebrow: "Elsewhere",
  heading: "Where to find Noir.",
  description: "Other work, other rooms, other ways in.",
};

/**
 * Phase 4.6 — corner treatment.
 *
 * `rounded` is a deliberate default rather than a pill. A pill at a 56px height
 * is a stadium, and a screen of stadiums reads as a traffic-light display rather
 * than an editorial link list. Pill stays available for owners who want it.
 */
export type CustomLinkShape = "rounded" | "rect" | "pill";

/** Fill treatment. `solid` is the default because it is the most legible. */
export type CustomLinkStyle = "solid" | "outline" | "tint";

/**
 * Colour source.
 *
 * `theme` (default) keeps the buttons inside the profile's palette with no extra
 * wiring — a saved theme change recolours them for free. `custom` hands the
 * accent family to `accent`, which is what the "custom button colour" option
 * sets.
 */
export type CustomLinkColourMode = "theme" | "custom";

/**
 * Row arrangement.
 *
 * `stack` (default) is the full-width single column the brief asks for. `grid`
 * is offered for the case where it genuinely fits — short labels, several of
 * them, and room to spare. A grid that forces a long label onto three lines is
 * worse than a stack, so `grid` still collapses on narrow screens (see
 * `ProfileCustomLinks`).
 */
export type CustomLinkLayout = "stack" | "grid";

export interface ActivityEntry {
  id: string;
  kind: "watched" | "added" | "rated" | "reviewed" | "updated";
  /** Human-readable date label ("3 hours ago", "Yesterday"). */
  when: string;
  /** A short sentence describing the activity. */
  text: string;
  /** Optional ref to a media item for an artwork chip. */
  item?: { title: string; palette: Palette };
}

/**
 * How a My Clicks entry sources its picture.
 *
 * Phase 4.3 replaced the placeholder-only gallery with two honest external
 * modes. Neither uploads anything to PRSME: the browser loads the picture from
 * the owner's chosen host, and PRSME stores only the URL.
 *
 *  - `image`  — a direct HTTPS image resource the owner has permission to
 *               display. The browser `<img>` loads it directly; we never
 *               proxy or re-host it.
 *  - `post`   — a public social post URL. Instagram and Facebook are rendered
 *               through their *official* embed iframes (see
 *               `components/studio/ClicksPanel.tsx` for the per-platform
 *               allowlist). Anything that cannot be embedded renders as an
 *               explicit external-post card instead of a broken tile.
 */
export type ClicksMode = "image" | "post";

/** Which platform a `post` entry belongs to. Determines the embed strategy. */
export type ClicksPostPlatform = "instagram" | "facebook";

export interface ClicksPhoto {
  /** Stable id. Never an array index — reordering must not rewrite identity. */
  id: string;
  title: string;
  /** Visible dimension label — used to vary the gallery mosaic. */
  ratio: "tall" | "wide" | "square" | "portrait";
  palette: Palette;
  /** Optional place caption shown on hover. */
  place?: string;

  /* ---- Phase 4.3: external content modes ---- */

  /** How this entry sources its picture. Absent on pre-4.3 drafts = `image`. */
  mode?: ClicksMode;

  /**
   * Direct HTTPS URL of an image the owner may display. Rendered in the
   * browser via a plain `<img>` with `referrerPolicy="no-referrer"`; PRSME
   * never downloads or stores a copy.
   */
  imageUrl?: string;

  /**
   * Public post URL. Only meaningful when `mode === "post"`. We validate the
   * host and shape before storing it, and the renderer only builds an embed
   * iframe for the platforms on the official-embed allowlist.
   */
  postUrl?: string;
  postPlatform?: ClicksPostPlatform;

  /**
   * Owner-supplied alternative text. Required for `image` entries — a gallery
   * image with no alt text is invisible to anyone not looking at it.
   */
  altText?: string;

  /**
   * Optional outbound link back to the original source. For `image` entries
   * this is the page the picture came from; for `post` entries it defaults to
   * `postUrl`.
   */
  sourceUrl?: string;
}

/**
 * Optional soundtrack that a profile owner can attach. The embedded URL
 * points at a publicly supported embed (Spotify, etc.). When absent, the
 * profile simply does not render the soundtrack component.
 *
 * IMPORTANT: this is for public embeds only. We never call OAuth, never
 * persist a "now playing" state, and never read listening history.
 */
export interface ProfileSoundtrack {
  /** Provider used for the embed. */
  provider: "spotify";
  /**
   * URL of the playable track / album / playlist — i.e. the public Spotify
   * URL the provider wants users to share. Component builds the embed URL
   * from it. The track id field is intentionally not modelled — we don't
   * fabricate ids; the URL itself is the source of truth.
   */
  trackUrl: string;
  /** Catalogue track or album id used to render the cover artwork inline. */
  trackId?: string;
  /** Display title shown in the soundtrack card (track or album name). */
  trackTitle: string;
  /** Display artist name(s). */
  trackArtist: string;
  /**
   * Optional album or single title. Rendered as a sub-label on the
   * soundtrack card. Not used for the embed; metadata only.
   */
  albumTitle?: string;
  /**
   * Album or single cover artwork. When provided the component renders it
   * as a real image; if the image fails to load the local palette tile
   * becomes the visible fallback. The host provider of the cover is shown
   * honestly ("Album art from Spotify"), with no implied endorsement.
   *
   * Hotlinking stability is best-effort; if the image becomes unavailable
   * the embedded fallback is what the visitor sees.
   */
  coverUrl?: string;
  /**
   * Source attribution for `coverUrl`. Defaults to the provider name. Used
   * in the cover's alt text and a small visible credit line so the
   * component never implies it owns the artwork.
   */
  coverSource?: string;
  /** Local palette used as fallback art when no coverUrl is set or it fails. */
  palette: Palette;
  /** Optional caption shown in the player, e.g. "Profile soundtrack". */
  caption?: string;
  /**
   * Fallback external page URL if the embed cannot be loaded (e.g. network
   * blocked). When set, the player shows a "Listen on <provider>" link
   * instead of pretending playback is happening.
   */
  externalUrl?: string;
}

export const PALETTE_NAMES = new Set<Palette>([
  "amber",
  "iris",
  "rose",
  "cyan",
  "forest",
  "sand",
  "mono",
  "violet",
  "rust",
]);

export interface ProfileOwner {
  /** URL segment for the profile. Lowercase, no spaces. */
  username: string;
  /** Display name shown in headings. */
  displayName: string;
  bio: string;
  location?: string;
  pronouns?: string;
  avatarPalette: Palette;
  /**
   * Optional override for the avatar. When present, the header prefers
   * this data URL over the palette. Used by the customization studio;
   * kept on the same typed shape so /u/noir and /studio stay in sync.
   */
  avatarDataUrl?: string | null;
  tags: string[];
  socials: SocialLink[];
  collections: ProfileCollection[];
  recent: ActivityEntry[];
  clicks: ClicksPhoto[];
  /**
   * Phase 4.5 — owner-defined outbound buttons, rendered immediately before My
   * Clicks. Optional: absent means "no Custom Links section at all", which is
   * different from an empty array (an explicit, honoured decision to hide them).
   */
  customLinks?: CustomLinkButton[];
  /**
   * Phase 4.7 — the eyebrow / heading / description that introduce the Custom
   * Links section. Kept apart from `customLinks` so section copy is one record,
   * not three fields duplicated across every button.
   *
   * Optional: absent means the renderer uses `DEFAULT_CUSTOM_LINKS_SECTION`, so
   * every pre-4.7 profile keeps the copy it always had.
   */
  customLinksSection?: CustomLinksSection;
  /** Opt-in profile soundtrack. When undefined the player is not rendered. */
  soundtrack?: ProfileSoundtrack;
  /**
   * Demo follower/following counts.
   *
   * Phase 3.1 has no backend, so these are clearly-labelled fictional demo
   * numbers that exist only so the profile layout can be evaluated. They are
   * intentionally *not* part of `ProfileDraft` — follower graphs are not
   * owner-customizable, and a real implementation will source them from the
   * database instead of local storage.
   */
  socialStats?: ProfileSocialStats;
}

export interface ProfileSocialStats {
  followers: number;
  following: number;
  /** Marks the numbers as demo data in the UI and for assistive tech. */
  isDemo: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                 Demo data                                  */
/* -------------------------------------------------------------------------- */

const collections: ProfileCollection[] = [
  {
    id: "col-films",
    name: "Films That Stayed With Me",
    description:
      "Quiet ones and loud ones — the films I still think about years later.",
    layout: "poster-grid",
    visibility: "public",
    items: [
      {
        id: "film-pastel-city",
        title: "Pastel City",
        byline: "Dir. Hana Kawai · 2024",
        kind: "movie",
        myRating: 9.4,
        myReview:
          "Stays quiet on purpose. The last twenty minutes do all the work and I cried on a tram.",
        year: 2024,
        palette: "iris",
      },
      {
        id: "film-paper-lanterns",
        title: "Paper Lanterns",
        byline: "Dir. Ada Mazur · 2021",
        kind: "movie",
        myRating: 8.8,
        year: 2021,
        palette: "sand",
      },
      {
        id: "film-soft-terror",
        title: "Soft Terror",
        byline: "Dir. M. Reigns · 2019",
        kind: "movie",
        myRating: 8.5,
        myReview: "A horror film that knows when to be a drama.",
        year: 2019,
        palette: "rust",
      },
      {
        id: "film-long-summer",
        title: "The Long Summer of '83",
        byline: "Dir. Émile Bonnet · 2022",
        kind: "movie",
        myRating: 8.3,
        year: 2022,
        palette: "amber",
      },
      {
        id: "film-light-traffic",
        title: "Light Traffic",
        byline: "Dir. Yara Sandoval · 2023",
        kind: "movie",
        myRating: 8.1,
        year: 2023,
        palette: "cyan",
      },
      {
        id: "film-quiet-channel",
        title: "The Quiet Channel",
        byline: "Dir. P. Vinet · 2018",
        kind: "movie",
        myRating: 8.0,
        year: 2018,
        palette: "forest",
      },
    ],
  },
  {
    id: "col-tv",
    name: "TV Series for Rainy Days",
    description:
      "Series from anywhere — slow-burners, melancholic leads, endings that don't shout.",
    layout: "featured",
    visibility: "public",
    items: [
      {
        id: "kd-camellia",
        title: "When the Camellia Blooms",
        byline: "KBS (Korean) · 2019",
        kind: "tv",
        myRating: 9.5,
        myReview:
          "The kind of show that teaches you how to root for small kindnesses.",
        year: 2019,
        palette: "rose",
      },
      {
        id: "kd-liberation",
        title: "My Liberation Notes",
        byline: "JTBC (Korean) · 2022",
        kind: "tv",
        myRating: 9.6,
        myReview:
          "Paces itself like a long walk. Not for everyone. For me, perfect.",
        year: 2022,
        palette: "amber",
      },
      {
        id: "kd-twentyfive",
        title: "Twenty-Five, Twenty-One",
        byline: "tvN (Korean) · 2022",
        kind: "tv",
        myRating: 9.0,
        year: 2022,
        palette: "rose",
      },
      {
        id: "kd-moveheaven",
        title: "Move to Heaven",
        byline: "Netflix (Korean) · 2021",
        kind: "tv",
        myRating: 8.9,
        year: 2021,
        palette: "forest",
      },
      {
        id: "kd-mymister",
        title: "My Mister",
        byline: "tvN (Korean) · 2018",
        kind: "tv",
        myRating: 9.3,
        year: 2018,
        palette: "violet",
      },
    ],
  },
  {
    id: "col-music",
    name: "Albums on Repeat",
    description:
      "The records I return to when the rest of the world gets too loud.",
    layout: "compact",
    visibility: "public",
    items: [
      {
        id: "m-cobalt",
        title: "Cobalt Hours (EP)",
        byline: "Sora Verlaine",
        kind: "music",
        myRating: 9.2,
        year: 2024,
        palette: "cyan",
      },
      {
        id: "m-after",
        title: "After the Album",
        byline: "Mira Halvorsen",
        kind: "music",
        myRating: 8.7,
        year: 2023,
        palette: "violet",
      },
      {
        id: "m-modular",
        title: "Soft Modular",
        byline: "Kestrel & Mori",
        kind: "music",
        myRating: 8.4,
        year: 2022,
        palette: "iris",
      },
      {
        id: "m-nightletter",
        title: "Nightletter",
        byline: "Aoife Brennan",
        kind: "music",
        myRating: 8.1,
        year: 2021,
        palette: "mono",
      },
    ],
  },
  {
    id: "col-manga",
    name: "Manga I Could Read Forever",
    description:
      "Series I've re-read cover to cover at least twice and probably will again.",
    layout: "compact",
    visibility: "public",
    items: [
      {
        id: "mg-barefoot",
        title: "Barefoot Gen",
        byline: "Keiji Nakazawa",
        kind: "manga",
        myRating: 9.1,
        year: 1973,
        palette: "sand",
      },
      {
        id: "mg-chihayafuru",
        title: "Chihayafuru",
        byline: "Yuki Suetsugu",
        kind: "manga",
        myRating: 9.0,
        year: 2007,
        palette: "rose",
      },
      {
        id: "mg-yokohama",
        title: "Yokohama Kaidashi Kikou",
        byline: "Hitoshi Ashino",
        kind: "manga",
        myRating: 8.9,
        year: 1994,
        palette: "iris",
      },
      {
        id: "mg-vagabond",
        title: "Vagabond",
        byline: "Takehiko Inoue",
        kind: "manga",
        myRating: 8.5,
        year: 1998,
        palette: "rust",
      },
    ],
  },
  {
    id: "col-books",
    name: "Books That Changed My Perspective",
    description:
      "Not the loudest books I've read — the ones that rearranged me quietly.",
    layout: "featured",
    visibility: "public",
    items: [
      {
        id: "bk-conversations",
        title: "Conversations with Friends",
        byline: "Sally Rooney",
        kind: "book",
        myRating: 8.7,
        year: 2017,
        palette: "cyan",
      },
      {
        id: "bk-on-beauty",
        title: "On Beauty",
        byline: "Zadie Smith",
        kind: "book",
        myRating: 9.3,
        myReview:
          "A campus novel that feels like the inside of a family photograph.",
        year: 2005,
        palette: "amber",
      },
      {
        id: "bk-instructions",
        title: "Instructions for a Heatwave",
        byline: "David Szalay",
        kind: "book",
        myRating: 8.0,
        year: 2013,
        palette: "sand",
      },
    ],
  },
];

const recent: ActivityEntry[] = [
  {
    id: "act-1",
    kind: "watched",
    when: "2 hours ago",
    text: "Finished Pastel City and sat on the floor for ten minutes.",
    item: { title: "Pastel City", palette: "iris" },
  },
  {
    id: "act-2",
    kind: "rated",
    when: "Yesterday",
    text: "Rated The Quiet Channel 8.0 / 10.",
    item: { title: "The Quiet Channel", palette: "forest" },
  },
  {
    id: "act-3",
    kind: "reviewed",
    when: "2 days ago",
    text: "Wrote a short note on My Liberation Notes.",
    item: { title: "My Liberation Notes", palette: "amber" },
  },
  {
    id: "act-4",
    kind: "added",
    when: "3 days ago",
    text: "Added Cobalt Hours (EP) to Albums on Repeat.",
    item: { title: "Cobalt Hours (EP)", palette: "cyan" },
  },
  {
    id: "act-5",
    kind: "updated",
    when: "Last week",
    text: "Reordered Books That Changed My Perspective.",
  },
];

const clicks: ClicksPhoto[] = [
  {
    id: "cl-1",
    title: "Tram 28, Calçada de São Francisco",
    place: "Lisbon",
    ratio: "tall",
    palette: "mono",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg/960px-Number_28_tram%2C_Cal%C3%A7ada_de_S%C3%A3o_Francisco%2C_Lisbon%2C_Portugal_julesvernex2.jpg",
    altText:
      "A yellow vintage tram climbing a steep cobbled street in Lisbon, filmed from below.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Number_28_tram,_Cal%C3%A7ada_de_S%C3%A3o_Francisco,_Lisbon,_Portugal_julesvernex2.jpg",
  },
  {
    id: "cl-2",
    title: "Lisbon at night",
    place: "Portugal, 2015",
    ratio: "wide",
    palette: "amber",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Lisbon_at_night_%2824301569479%29.jpg/960px-Lisbon_at_night_%2824301569479%29.jpg",
    altText:
      "Lisbon's rooftops and terraced streets lit by warm window and street light after dark.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Lisbon_at_night_(24301569479).jpg",
  },
  {
    id: "cl-3",
    title: "TV tower, Alexanderplatz",
    place: "Berlin",
    ratio: "portrait",
    palette: "iris",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg/960px-09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg",
    altText:
      "The Berlin TV Tower rising above Alexanderplatz at night, its sphere lit against a dark sky.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:09065023_-_TV_tower_detailed_-_Berlin_Alexanderplatz_-_night_view.jpg",
  },
  {
    id: "cl-4",
    title: "Damrak at golden hour",
    place: "Amsterdam",
    ratio: "square",
    palette: "cyan",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg/960px-Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg",
    altText:
      "Narrow gabled canal houses along the Damrak glowing orange in low evening sun.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Colorful_canal_houses_at_golden_hour_in_Damrak_avenue_Amsterdam_the_Netherlands.jpg",
  },
  {
    id: "cl-5",
    title: "Gion, after rain",
    place: "Kyoto",
    ratio: "tall",
    palette: "forest",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg/960px-Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg",
    altText:
      "A narrow Kyoto alley in Gion lined with traditional wooden machiya houses.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Streets_of_Gion,_Kyoto_-_Gion7712.jpg",
  },
  {
    id: "cl-6",
    title: "Blue hour, Damrak",
    place: "Amsterdam",
    ratio: "wide",
    palette: "rose",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Water_reflection_of_canal_houses_at_blue_hour_in_Damrak_Amsterdam_the_Netherlands.jpg/960px-Water_reflection_of_canal_houses_at_blue_hour_in_Damrak_Amsterdam_the_Netherlands.jpg",
    altText:
      "Amsterdam canal houses mirrored in still water under a deep blue evening sky.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Water_reflection_of_canal_houses_at_blue_hour_in_Damrak_Amsterdam_the_Netherlands.jpg",
  },
  {
    id: "cl-7",
    title: "Gion alley at night",
    place: "Kyoto",
    ratio: "portrait",
    palette: "violet",
    mode: "image",
    imageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/Gion_Alley_at_Night.jpg/960px-Gion_Alley_at_Night.jpg",
    altText:
      "A quiet Gion alley at night, lantern light spilling onto wet stone.",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Gion_Alley_at_Night.jpg",
  },
  {
    id: "cl-8",
    /*
     * Phase 4.3 — a public-post entry, kept in the seed so the official-embed
     * path and the external-card fallback are both exercised by the demo. The
     * URL is a syntactically valid Instagram post permalink; Instagram decides
     * whether that specific post is publicly embeddable, and when it is not,
     * PRSME renders the external-post card rather than a broken tile.
     */
    title: "North sea, grey",
    place: "Aberdeen",
    ratio: "square",
    palette: "sand",
    mode: "post",
    postPlatform: "instagram",
    postUrl: "https://www.instagram.com/p/C2example1/",
    altText: "A grey North Sea shoreline under flat winter light.",
  },
];

/**
 * Demo Custom Link Buttons (Phase 4.5, presentation defaults in 4.6).
 *
 * Three real, working destinations owned by a fictional filmmaker, chosen to
 * exercise the layout: two short labels and one long one that must wrap rather
 * than force horizontal overflow.
 *
 * Only `label` is ever rendered. `url` is the destination and nothing else.
 *
 * Phase 4.6 keeps these entries field-free on purpose: with no `shape`,
 * `style`, `colourMode`, or `layout` present, the renderer applies the
 * documented defaults (`rounded` / `solid` / `theme` / `stack`). That is what
 * a Phase 4.5 save still looks like, so the demo doubles as proof that the
 * added fields are genuinely optional rather than required.
 */
const customLinks: CustomLinkButton[] = [
  { id: "lnk-1", label: "Portfolio", url: "https://example.com/noir-portfolio" },
  { id: "lnk-2", label: "Print shop", url: "https://example.com/noir-prints" },
  {
    id: "lnk-3",
    label: "Bookings & collaborations",
    url: "https://example.com/noir-bookings",
  },
];

export const noirProfile: ProfileOwner = {
  username: "noir",
  displayName: "Noir Aldridge",
  bio: "Filmmaker, occasional photographer, frequent over-reader. I keep shelves for the things that teach me how to be slower.",
  location: "Berlin",
  pronouns: "she/her",
  avatarPalette: "iris",
  /**
   * Fictional demo counts so the follower/following row can be evaluated
   * before the backend exists. Not part of the customizable draft.
   */
  socialStats: {
    followers: 1284,
    following: 312,
    isDemo: true,
  },
  tags: [
    "Independent film",
    "Korean drama",
    "Ambient music",
    "Slow books",
    "Analog photography",
  ],
  socials: [
    {
      platform: "instagram",
      url: "https://instagram.com/noir.aldridge",
      handle: "@noir.aldridge",
    },
    {
      platform: "linkedin",
      url: "https://www.linkedin.com/in/noir-aldridge",
      handle: "Noir Aldridge",
    },
    {
      platform: "facebook",
      url: "https://facebook.com/noir.aldridge",
      handle: "Noir Aldridge",
    },
    {
      platform: "snapchat",
      url: "https://www.snapchat.com/add/noir.aldridge",
      handle: "@noir.aldridge",
    },
  ],
  collections,
  recent,
  clicks,
  customLinks,
  /*
   * Phase 4.7 — the demo states the default copy *explicitly* rather than leaving
   * the field absent. Leaving it absent would also render correctly (the renderer
   * falls back to the same constants), but an explicit record is what a reader of
   * the demo data needs: it shows that these three strings are editable profile
   * data, not decoration wired into a component.
   */
  customLinksSection: { ...DEFAULT_CUSTOM_LINKS_SECTION },
  soundtrack: {
    provider: "spotify",
    /**
     * The same real track — "Prelude for Piano No. 11 in F-Sharp Minor" by
     * Eduard Abramyan / Sona Shaboyan — now resolved on **Apple Music**,
     * because the card's button opens Apple Music.
     *
     * Verified against Apple's public iTunes Search API
     * (https://itunes.apple.com/search?term=...&media=music&entity=song):
     *   trackId       : 557706656
     *   collectionId  : 557706378
     *   collection    : Abramyan: Preludes – Rachmaninoff: Sonata No. 2 in
     *                   B-Flat Minor, Op. 36 – Babadjanyan: Capriccio,
     *                   Improvisation, Folksong, Elegy, Poem (Sona Shaboyan)
     *   apple track   : https://music.apple.com/us/album/prelude-for-piano-no-11-in-f-sharp-minor/557706378?i=557706656
     *   cover         : is1-ssl.mzstatic.com/.../100x100bb.jpg (upgraded to
     *                   1200x1200bb.jpg at render size below)
     *
     * `trackUrl` is kept as the Spotify link because it is still what the
     * studio's oEmbed resolver resolves titles and artwork from; `externalUrl`
     * is the Apple Music destination the button opens. The component picks its
     * label and glyph from whichever URL it is actually opening, so the two can
     * never disagree on screen.
     */
    trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
    trackTitle: "Prelude for Piano No. 11 in F-Sharp Minor",
    trackArtist: "Eduard Abramyan · Sona Shaboyan",
    albumTitle:
      "Abramyan: Preludes – Rachmaninoff: Sonata No. 2 in B-Flat Minor",
    coverUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/26/50/46/26504658-11f9-b7d3-3706-7514bc020e94/887396379862.tif/1200x1200bb.jpg",
    coverSource: "Apple Music",
    palette: "violet",
    caption: "Profile soundtrack",
    externalUrl:
      "https://music.apple.com/us/album/prelude-for-piano-no-11-in-f-sharp-minor/557706378?i=557706656",
  },
};

/**
 * Whether a given username resolves to a profile in the demo catalog.
 * Used by the dynamic route's not-found branch.
 */
export function isKnownProfile(username: string): boolean {
  return username.toLowerCase() === noirProfile.username;
}
