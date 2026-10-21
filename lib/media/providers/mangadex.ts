/**
 * MangaDex adapter — manga series metadata and cover artwork.
 *
 * https://api.mangadex.org/manga?title={query}&limit={n}&includes[]=cover_art
 * https://api.mangadex.org/cover/{coverId}
 *
 * MangaDex is a public, documented, key-optional API. We pass the cover
 * relationship's id and build the canonical cover URL from
 * `uploads.mangadex.org/covers/{mangaId}/{fileName}`. The exact file name is
 * only known from the cover endpoint, so we fetch the cover object and read
 * `fileName`. That endpoint is allowlisted.
 *
 * MangaDex returns multilingual titles; we prefer `en` and fall back to the
 * first available alternate title.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "mangadex";

interface MangaDexTitle {
  en?: string;
  ja?: string;
  "ja-ro"?: string;
  [k: string]: string | undefined;
}

interface MangaDexRelationship {
  id?: string;
  type?: string;
  attributes?: { name?: string; nameAlt?: string };
}

interface MangaDexAttributes {
  title?: MangaDexTitle;
  altTitles?: MangaDexTitle[];
  status?: string;
  year?: number;
  description?: Record<string, string>;
  links?: Record<string, string>;
  availableTranslatedLanguages?: string[];
}

interface MangaDexItem {
  id?: string;
  type?: string;
  attributes?: MangaDexAttributes;
  relationships?: MangaDexRelationship[];
}

interface MangaDexSearchResponse {
  result?: string;
  response?: string;
  data?: MangaDexItem[];
}

interface MangaDexCoverAttributes {
  fileName?: string;
  volume?: string | null;
  description?: string | null;
}

interface MangaDexCoverResponse {
  data?: { attributes?: MangaDexCoverAttributes };
}

function pickTitle(item: MangaDexItem): { title: string; alt?: string } | null {
  const attrs = item.attributes;
  if (!attrs?.title) return null;
  const t = attrs.title;
  const title = t.en ?? t.ja ?? t["ja-ro"] ?? Object.values(t).find(Boolean);
  if (!title) return null;
  // First alternate title in a different language than the primary is useful.
  let alt: string | undefined;
  if (Array.isArray(attrs.altTitles)) {
    for (const altEntry of attrs.altTitles) {
      const candidate = altEntry.en ?? Object.values(altEntry).find(Boolean);
      if (candidate && candidate !== title) {
        alt = candidate;
        break;
      }
    }
  }
  return { title: title.trim(), alt: alt?.trim() };
}

function pickAuthor(item: MangaDexItem): string | undefined {
  const rels = item.relationships ?? [];
  const author = rels.find(
    (r) => r.type === "author" || r.type === "artist" || r.type === "creator",
  );
  const primary =
    author?.attributes?.name ??
    rels.find((r) => r.attributes?.name)?.attributes?.name;
  return primary ? primary.trim() : undefined;
}

function coverIdFor(item: MangaDexItem): string | undefined {
  const rel = (item.relationships ?? []).find(
    (r) => r.type === "cover_art" && r.id,
  );
  return rel?.id;
}

/** Build the canonical cover URL, or null if the provider has no cover. */
async function resolveCover(
  mangaId: string,
  coverId: string,
): Promise<{ url: string; source: string } | null> {
  try {
    const cover = await fetchProviderJson<MangaDexCoverResponse>(
      `https://api.mangadex.org/cover/${coverId}`,
      { timeoutMs: 4_000 },
    );
    const fileName = cover?.data?.attributes?.fileName;
    if (!fileName) return null;
    const url = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
    if (!isAllowedArtworkUrl(url)) return null;
    return { url, source: "MangaDex cover" };
  } catch {
    return null;
  }
}

export async function searchMangaDex(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "manga") {
    return { results: [], status: "unavailable", message: "MangaDex does not serve this kind." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const params = new URLSearchParams({
    title: q,
    limit: "8",
    "includes[]": "cover_art",
  });
  const url = `https://api.mangadex.org/manga?${params.toString()}`;
  try {
    const response = await fetchProviderJson<MangaDexSearchResponse>(url, { timeoutMs: 5_500 });
    const items = Array.isArray(response.data) ? response.data : [];
    const baseRecords = items
      .map((item): { item: MangaDexItem; id: string; title: string; alt?: string } | null => {
        if (!item.id) return null;
        const t = pickTitle(item);
        if (!t) return null;
        return { item, id: item.id, title: t.title, alt: t.alt };
      })
      .filter((x): x is { item: MangaDexItem; id: string; title: string; alt?: string } => x !== null)
      .slice(0, 6);

    // Fetch covers in parallel — MangaDex's per-item latency dominates otherwise.
    const withCovers = await Promise.all(
      baseRecords.map(async ({ item, id, title, alt }) => {
        const coverId = coverIdFor(item);
        const artwork = coverId ? await resolveCover(id, coverId) : null;
        const author = pickAuthor(item);
        const desc = item.attributes?.description?.en;
        return {
          id: mediaRecordId(PROVIDER, id),
          kind: "manga" as const,
          provider: PROVIDER,
          providerId: id,
          title,
          alternateTitle: alt,
          creator: author,
          creatorRole: author ? "By" : undefined,
          year: item.attributes?.year,
          coverUrl: artwork?.url ?? null,
          coverSource: artwork?.source,
          externalUrl: `https://mangadex.org/title/${id}`,
          description: desc ? desc.slice(0, 1_000) : undefined,
          meta: item.attributes?.status ? { status: item.attributes.status } : undefined,
        } satisfies MediaRecord;
      }),
    );

    const results = withCovers.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));
    return results.length > 0
      ? { results, status: "ok" }
      : { results: [], status: "empty" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}