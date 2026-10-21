/**
 * Google Books adapter — the second permitted book source.
 *
 * https://www.googleapis.com/books/v1/volumes?q={query}&maxResults=8
 *
 * Why it exists: the brief requires a real available cover, and Open Library
 * is *work*-level — many works have `cover_i: null` at the work level while a
 * specific edition in Google Books carries a cover. We use Google Books as a
 * **distinct provider**, never as a silent substitute: a Google Books record
 * keeps its own `providerId` (the volume id) so an edition mismatch is
 * diagnosable rather than hidden.
 *
 * No key is required for basic search. Artwork comes from
 * `volumeInfo.imageLinks`, which we upgrade to the largest available
 * thumbnail the response actually published (never a size the API did not
 * offer).
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { ALLOWED_ARTWORK_HOSTS, fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "googlebooks";

interface GoogleBooksImageLinks {
  smallThumbnail?: string;
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  extraLarge?: string;
}

interface GoogleBooksVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  imageLinks?: GoogleBooksImageLinks;
}

interface GoogleBooksItem {
  id?: string;
  volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
  items?: GoogleBooksItem[];
  totalItems?: number;
}

/**
 * Pick the largest published thumbnail. Google Books returns a `http://`
 * thumbnail for many volumes; we upgrade the scheme to `https://` because the
 * CDN serves both and the artwork allowlist only trusts https.
 */
function bestImage(links: GoogleBooksImageLinks | undefined): string | null {
  if (!links) return null;
  const ordered = [links.extraLarge, links.large, links.medium, links.small, links.thumbnail, links.smallThumbnail];
  for (const raw of ordered) {
    if (!raw) continue;
    const upgraded = raw.startsWith("http://") ? `https://${raw.slice("http://".length)}` : raw;
    try {
      const parsed = new URL(upgraded);
      if (parsed.protocol !== "https:") continue;
      if (!ALLOWED_ARTWORK_HOSTS.has(parsed.hostname)) continue;
      if (!isAllowedArtworkUrl(parsed.toString())) continue;
      return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function firstIsbn(info: GoogleBooksVolumeInfo): string | undefined {
  const match = info.industryIdentifiers?.find((i) => i.type === "ISBN_13") ?? info.industryIdentifiers?.find((i) => i.type === "ISBN_10");
  return match?.identifier;
}

function publicationYear(info: GoogleBooksVolumeInfo): number | undefined {
  if (!info.publishedDate) return undefined;
  const parsed = Number.parseInt(info.publishedDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalise(item: GoogleBooksItem): MediaRecord | null {
  const providerId = String(item.id ?? "").trim();
  const info = item.volumeInfo;
  const title = String(info?.title ?? "").trim();
  if (!providerId || !title || !info) return null;
  const cover = bestImage(info.imageLinks);
  const authors = Array.isArray(info.authors) ? info.authors.filter(Boolean) : [];
  const meta: Record<string, string> = {};
  const isbn = firstIsbn(info);
  if (isbn) meta.isbn = isbn;
  if (info.pageCount) meta.pages = String(info.pageCount);
  // The edition year is what the reader would see on this volume, distinct
  // from the work's first publication year that Open Library reports.
  if (info.publishedDate) meta.edition = info.publishedDate.slice(0, 10);
  // Phase 4.2 — light-novel evidence, taken from Google's own categories and
  // description rather than inferred from the title. Google Books publishes a
  // "Light Novel" / "Juvenile Fiction"-adjacent category for many LN series,
  // and the description usually names the format outright.
  if (looksLikeLightNovel(info)) meta.format = "light-novel";
  return {
    id: mediaRecordId(PROVIDER, providerId),
    kind: "book",
    provider: PROVIDER,
    providerId,
    title,
    alternateTitle: info.subtitle ? String(info.subtitle) : undefined,
    creator: authors.length > 0 ? authors.join(", ") : undefined,
    creatorRole: authors.length > 0 ? "By" : undefined,
    year: publicationYear(info),
    coverUrl: cover,
    coverSource: cover ? "Google Books cover" : undefined,
    externalUrl: `https://books.google.com/books?id=${encodeURIComponent(providerId)}`,
    description: info.description ? String(info.description).slice(0, 600) : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

export async function searchGoogleBooks(
  kind: MediaKindId,
  query: string,
  options: { format?: "standard" | "light-novel" } = {},
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "book") {
    return { results: [], status: "unavailable", message: "Google Books does not serve this kind." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  // Phase 4.2 — a light-novel search appends a ranking hint only. Google Books
  // has no format filter, so the subtype is decided per-result by evidence.
  const wantsLightNovel = options.format === "light-novel";
  const effectiveQuery = wantsLightNovel ? `${q} light novel` : q;
  const params = new URLSearchParams({
    q: effectiveQuery,
    maxResults: "8",
    printType: "books",
  });
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  try {
    const response = await fetchProviderJson<GoogleBooksResponse>(url, { timeoutMs: 5_500 });
    const items = Array.isArray(response.items) ? response.items : [];
    const results = items
      .map(normalise)
      .filter((r): r is MediaRecord => r !== null)
      .slice(0, 8);
    return results.length === 0
      ? { results: [], status: "empty" }
      : { results, status: "ok" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}

/**
 * Evidence test for the light-novel subtype.
 *
 * Only two signals count: an explicit "light novel" phrase in Google's own
 * category list, or the phrase appearing in the volume description. We never
 * infer the format from the title or from the language alone — that is how a
 * plain Japanese novel would get mislabelled.
 */
function looksLikeLightNovel(info: GoogleBooksVolumeInfo): boolean {
  const categories = (info.categories ?? []).map((c) => c.toLowerCase());
  if (categories.some((c) => c.includes("light novel"))) return true;
  const description = String(info.description ?? "").toLowerCase();
  return description.includes("light novel");
}