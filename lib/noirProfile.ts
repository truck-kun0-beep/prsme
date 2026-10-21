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

/** Layout identifiers accepted by every collection renderer. */
export type CollectionLayoutId =
  | "poster-grid"
  | "featured"
  | "compact"
  | "soundtrack-list";

/** Human-readable layout names for the studio selector. */
export const COLLECTION_LAYOUT_LABELS: Record<CollectionLayoutId, string> = {
  "poster-grid": "Poster grid",
  featured: "Featured",
  compact: "Compact",
  "soundtrack-list": "Soundtrack list",
};

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

export interface ClicksPhoto {
  id: string;
  title: string;
  /** Visible dimension label — used to vary the gallery mosaic. */
  ratio: "tall" | "wide" | "square" | "portrait";
  palette: Palette;
  /** Optional place caption shown on hover. */
  place?: string;
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
    title: "Rear window, March",
    place: "Lisbon",
    ratio: "tall",
    palette: "mono",
  },
  {
    id: "cl-2",
    title: "Train to Trieste",
    place: "Italy, 2024",
    ratio: "wide",
    palette: "amber",
  },
  {
    id: "cl-3",
    title: "Studio, last light",
    place: "Berlin",
    ratio: "portrait",
    palette: "iris",
  },
  {
    id: "cl-4",
    title: "Berlin, off-season",
    place: "Neukölln",
    ratio: "square",
    palette: "cyan",
  },
  {
    id: "cl-5",
    title: "Botanic, in fog",
    place: "Edinburgh",
    ratio: "tall",
    palette: "forest",
  },
  {
    id: "cl-6",
    title: "Reading, October",
    place: "Café Geist",
    ratio: "wide",
    palette: "rose",
  },
  {
    id: "cl-7",
    title: "Backstage, soundcheck",
    place: "Primavera",
    ratio: "portrait",
    palette: "violet",
  },
  {
    id: "cl-8",
    title: "North sea, grey",
    place: "Aberdeen",
    ratio: "square",
    palette: "sand",
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
  soundtrack: {
    provider: "spotify",
    /**
     * Verified real track. Pulled directly from Spotify's public track page
     * (https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh) and confirmed
     * from the page's <meta> tags:
     *   title : Prelude for Piano No. 11 in F-Sharp Minor
     *   artist: Eduard Abramyan, Sona Shaboyan
     *   album : Abramyan: Preludes – Rachmaninoff: Sonata No. 2 in B-Flat
     *           Minor, Op. 36 – Babadjanyan: Capriccio, Improvisation,
     *           Folksong, Elegy, Poem (Sona Shaboyan · 2010)
     *   cover : https://i.scdn.co/image/ab67616d0000b2734f61e186facbb486f79e9fd9
     *
     * The album URL is verified the same way (and is also embeddable, so
     * the component can show the full album if the visitor wants more).
     */
    trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
    trackTitle: "Prelude for Piano No. 11 in F-Sharp Minor",
    trackArtist: "Eduard Abramyan · Sona Shaboyan",
    albumTitle:
      "Abramyan: Preludes – Rachmaninoff: Sonata No. 2 in B-Flat Minor",
    coverUrl: "https://i.scdn.co/image/ab67616d0000b2734f61e186facbb486f79e9fd9",
    coverSource: "Spotify",
    palette: "violet",
    caption: "Profile soundtrack",
    externalUrl: "https://open.spotify.com/album/6fu8fvc7O4p8Gb8KMTBTUW",
  },
};

/**
 * Whether a given username resolves to a profile in the demo catalog.
 * Used by the dynamic route's not-found branch.
 */
export function isKnownProfile(username: string): boolean {
  return username.toLowerCase() === noirProfile.username;
}
