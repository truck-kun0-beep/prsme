/**
 * Fictional demo data used to populate the PRSME preview on the landing page.
 * Nothing here is wired to a backend or external media API.
 *
 * Artwork is rendered locally via inline SVG gradients so the page works
 * fully offline and never depends on unstable image hosts.
 */

export interface DemoItem {
  id: string;
  title: string;
  kind: "film" | "series" | "kdrama" | "music" | "manga" | "book" | "photo";
  rating?: number; // 0..10 — only set when relevant
  note?: string;
  year?: number;
  /** Theme key used by Artwork.tsx to draw a unique gradient. */
  palette: "amber" | "iris" | "rose" | "cyan" | "forest" | "sand" | "mono" | "violet" | "rust";
}

export const demoProfile = {
  username: "@noor.k",
  displayName: "Noor K.",
  bio: "Quiet films, slower series, late-night K-pop. Always reading.",
  location: "Berlin · she/her",
  followerCount: 2483,
  followingCount: 187,
  themeName: "Iris After Dark",
};

export const demoRecentlyWatched: DemoItem[] = [
  { id: "rw-1", title: "Pastel City", kind: "film", rating: 9.1, year: 2024, palette: "iris" },
  { id: "rw-2", title: "A Quiet Frequency", kind: "series", rating: 8.6, palette: "cyan" },
  { id: "rw-3", title: "When the Camellia Blooms", kind: "series", rating: 9.4, palette: "rose" },
  { id: "rw-4", title: "Long After Midnight", kind: "music", rating: 9.0, palette: "violet" },
];

export const demoCollections: { name: string; count: number; tone: string; cover: DemoItem[] }[] = [
  {
    name: "Films I'd rewatch tonight",
    count: 42,
    tone: "Iris After Dark",
    cover: [
      { id: "c1-1", title: "Slow Burn Sundays", kind: "film", palette: "amber" },
      { id: "c1-2", title: "Soft Terror", kind: "film", palette: "rust" },
      { id: "c1-3", title: "Paper Lanterns", kind: "film", palette: "sand" },
    ],
  },
  {
    name: "TV Series that understood me",
    count: 18,
    tone: "Petal Static",
    cover: [
      { id: "c2-1", title: "Twenty-Five, Twenty-One", kind: "series", palette: "rose" },
      { id: "c2-2", title: "My Liberation Notes", kind: "series", palette: "amber" },
      { id: "c2-3", title: "Move to Heaven", kind: "series", palette: "forest" },
    ],
  },
  {
    name: "On heavy rotation",
    count: 64,
    tone: "Volta",
    cover: [
      { id: "c3-1", title: "Cobalt Hours EP", kind: "music", palette: "cyan" },
      { id: "c3-2", title: "After the Album", kind: "music", palette: "violet" },
      { id: "c3-3", title: "Soft Modular", kind: "music", palette: "iris" },
    ],
  },
];

export const demoReviews: { title: string; rating: number; excerpt: string; palette: DemoItem["palette"] }[] = [
  {
    title: "Pastel City (2024)",
    rating: 9,
    excerpt:
      "Stays quiet on purpose. The last twenty minutes do all the work and I cried on a tram.",
    palette: "iris",
  },
  {
    title: "My Liberation Notes",
    rating: 10,
    excerpt: "A show that paces itself the way a long walk does. Not for everyone. For me, perfect.",
    palette: "amber",
  },
];

export const demoClicks = [
  { id: "cl-1", title: "Rear window, March", kind: "photo", palette: "mono" },
  { id: "cl-2", title: "Train to Trieste", kind: "photo", palette: "amber" },
  { id: "cl-3", title: "Studio, last light", kind: "photo", palette: "iris" },
  { id: "cl-4", title: "Berlin, off-season", kind: "photo", palette: "cyan" },
  { id: "cl-5", title: "Botanic, in fog", kind: "photo", palette: "forest" },
  { id: "cl-6", title: "Reading, October", kind: "photo", palette: "rose" },
] as const;