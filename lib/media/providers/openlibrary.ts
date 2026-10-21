/**
 * Open Library adapter — book metadata and covers.
 *
 * https://openlibrary.org/search.json?q={query}&limit={n}&fields=...
 *
 * Open Library is a project of the Internet Archive, public, key-free, and
 * openly licensed catalogue data. Covers are served from
 * `covers.openlibrary.org/b/id/{coverId}-L.jpg` — large but allowlisted.
 *
 * Normalisation note: Open Library returns *works*, and a single work has many
 * editions. We surface the work-level record (title/author/first_publish_year)
 * and keep the edition key so a future "specific edition" mode can attach one
 * without changing the model. We deliberately do **not** collapse different
 * works that share a title.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "openlibrary";

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_key?: string[];
  first_sentence?: string;
  subject?: string[];
  language?: string[];
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
  numFound?: number;
}

function coverUrlFor(coverId: number | undefined): string | null {
  if (!coverId) return null;
  // -L requests the large cover; the -M medium is a safe default if -L is
  // unavailable upstream.
  const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  if (!isAllowedArtworkUrl(url)) return null;
  return url;
}

function normalise(doc: OpenLibraryDoc): MediaRecord | null {
  // Work keys look like `/works/OL45804W`.
  if (!doc.key || !doc.key.startsWith("/works/")) return null;
  const providerId = doc.key.replace("/works/", "");
  const title = String(doc.title ?? "").trim();
  if (!providerId || !title) return null;
  const authors = Array.isArray(doc.author_name) ? doc.author_name.filter(Boolean) : [];
  const cover = coverUrlFor(doc.cover_i);
  const meta: Record<string, string> = {};
  if (doc.edition_key && doc.edition_key[0]) meta.edition = doc.edition_key[0];
  if (doc.language && doc.language[0]) meta.language = doc.language[0];
  if (doc.subject && doc.subject[0]) meta.subject = doc.subject.slice(0, 3).join(", ");
  return {
    id: mediaRecordId(PROVIDER, providerId),
    kind: "book",
    provider: PROVIDER,
    providerId,
    title,
    creator: authors.length > 0 ? authors.join(", ") : undefined,
    creatorRole: authors.length > 0 ? "By" : undefined,
    year: doc.first_publish_year,
    coverUrl: cover,
    coverSource: cover ? "Open Library cover" : undefined,
    externalUrl: `https://openlibrary.org${doc.key}`,
    description: doc.first_sentence ? doc.first_sentence.slice(0, 400) : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

export async function searchOpenLibrary(
  kind: MediaKindId,
  query: string,
  options: { format?: "standard" | "light-novel" } = {},
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "book") {
    return { results: [], status: "unavailable", message: "Open Library does not serve this kind." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const fields = [
    "key",
    "title",
    "author_name",
    "first_publish_year",
    "cover_i",
    "edition_key",
    "first_sentence",
    "subject",
    "language",
  ].join(",");
  // Phase 4.2 — light-novel narrowing. Open Library has no dedicated format
  // filter, and we never *relabel* a book without evidence, so the only thing
  // the format hint does is rank likely candidates higher (`subject:fiction`
  // is the documented ranking hint). Subtype classification is done
  // downstream by `looksLikeLightNovel` based on Open Library's own subjects.
  const wantsLightNovel = options.format === "light-novel";
  const effectiveQuery = wantsLightNovel ? `${q} subject:fiction` : q;
  const params = new URLSearchParams({ q: effectiveQuery, limit: "8", fields });
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  try {
    const response = await fetchProviderJson<OpenLibraryResponse>(url, { timeoutMs: 5_500 });
    const docs = Array.isArray(response.docs) ? response.docs : [];
    const results = docs
      .map((doc) => {
        const record = normalise(doc);
        if (!record) return null;
        if (wantsLightNovel && looksLikeLightNovel(doc)) {
          record.meta = { ...(record.meta ?? {}), format: "light-novel" };
        }
        return record;
      })
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
 * Evidence test for the light-novel subtype. Deliberately conservative: a
 * result only earns the label when Open Library itself tagged the work
 * "light novel", or when it is tagged as Japanese fiction + language ja. A
 * Japanese *manga* lives on its own `manga` kind, so the test cannot leak a
 * Japanese-language work into the Book shelf by accident.
 */
function looksLikeLightNovel(doc: OpenLibraryDoc): boolean {
  const subjects = (doc.subject ?? []).map((s) => s.toLowerCase());
  // Open Library publishes several mutually-exclusive markers. We treat them
  // as evidence because the brief forbids fabricating the subtype — we only
  // call it a light novel when the catalogue itself says so.
  if (subjects.some((s) => s.includes("light novel"))) return true;
  if (subjects.some((s) => /^form:\s*light\s*novel$/.test(s))) return true;
  if (subjects.some((s) => /^series:\s*light\s*novel$/.test(s))) return true;
  if (
    subjects.some((s) => s.includes("japanese fiction")) &&
    (doc.language ?? []).some((l) => l.toLowerCase().startsWith("jpn"))
  ) {
    return true;
  }
  return false;
}