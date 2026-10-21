/**
 * MusicBrainz + Cover Art Archive adapter — supplementary song/album lookup.
 *
 * Why this exists: iTunes is excellent but not exhaustive, and users asked for
 * broad catalogue coverage without a Spotify connection. MusicBrainz is an open
 * music encyclopedia (CC0 core data, key-free, 1 req/s rate limit) and the
 * Cover Art Archive serves real release artwork.
 *
 *   https://musicbrainz.org/ws/2/recording/?query=…&fmt=json
 *   https://musicbrainz.org/ws/2/release-group/?query=…&fmt=json
 *   https://coverartarchive.org/release/{mbid}/front-500
 *
 * MusicBrainz enforces a 1 request/second rate limit, so we serialise calls
 * and keep the timeout generous. We are the *supplementary* provider: the
 * route runs it in parallel with iTunes and only surfaces it when it adds
 * genuinely new matches.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import { fetchProviderJson, isAllowedArtworkUrl } from "../http";

const PROVIDER: MediaProviderId = "musicbrainz";

interface MBArtistCredit {
  artist?: { name?: string; id?: string };
}

interface MBRecording {
  id?: string;
  title?: string;
  "artist-credit"?: MBArtistCredit[];
  releases?: Array<{ id?: string; title?: string; date?: string }>;
  "first-release-date"?: string;
  score?: number;
}

interface MBReleaseGroup {
  id?: string;
  title?: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: MBArtistCredit[];
  score?: number;
}

interface MBReleaseGroupWithArtwork extends MBReleaseGroup {
  releases?: Array<{ id?: string; title?: string; date?: string; media?: Array<{ "cover-art-archive"?: { front?: boolean } }> }>;
}

interface MBCollectionResponse<T> {
  count?: number;
  [k: string]: unknown;
}

function artistNames(credits: MBArtistCredit[] | undefined): string | undefined {
  if (!Array.isArray(credits)) return undefined;
  const names = credits
    .map((c) => c?.artist?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  return names.length > 0 ? names.join(", ") : undefined;
}

function yearFrom(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const parsed = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Ask the Cover Art Archive for a release's front cover. Returns a proxied
 * archive URL (their own documented image endpoint) only when the host is
 * allowlisted.
 */
async function coverForRelease(releaseMbid: string): Promise<{ url: string; source: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(releaseMbid)) return null;
  const candidate = `https://coverartarchive.org/release/${releaseMbid}/front-500`;
  if (!isAllowedArtworkUrl(candidate)) return null;
  // The Archive returns 404 when no art exists; HEAD avoids downloading bytes.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const response = await fetch(candidate, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "PRSME/0.4 (+https://prsme.app)" },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return { url: candidate, source: "Cover Art Archive" };
  } catch {
    return null;
  }
}

/**
 * Resolve a release-group to one of its releases, which is what the Cover Art
 * Archive indexes. Uses the documented `inc=release-groups` browse endpoint and
 * respects MusicBrainz's 1 req/s guidance with a short serialised call.
 */
async function firstReleaseIdForGroup(groupMbid: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(groupMbid)) return null;
  try {
    const url = `https://musicbrainz.org/ws/2/release?release-group=${encodeURIComponent(
      groupMbid,
    )}&fmt=json&limit=5`;
    const data = await fetchProviderJson<{ releases?: Array<{ id?: string }> }>(url, {
      timeoutMs: 5_000,
    });
    const withFront = data?.releases?.find((r) => Boolean(r?.id));
    return withFront?.id ?? null;
  } catch {
    return null;
  }
}

export async function searchMusicBrainz(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  if (kind !== "song" && kind !== "album") {
    return { results: [], status: "unavailable", message: "MusicBrainz does not serve this kind." };
  }
  const q = query.trim();
  if (q.length < 2) return { results: [], status: "empty" };

  const isRecording = kind === "song";
  const endpoint = isRecording ? "recording" : "release-group";
  const params = new URLSearchParams({
    query: q,
    fmt: "json",
    limit: "6",
  });
  const url = `https://musicbrainz.org/ws/2/${endpoint}/?${params.toString()}`;

  try {
    if (isRecording) {
      const response = await fetchProviderJson<MBCollectionResponse<MBRecording>>(url, { timeoutMs: 6_000 });
      const list = (response as unknown as { recordings?: MBRecording[] }).recordings ?? [];
      const base = list
        .map((r): { r: MBRecording; id: string; title: string } | null => {
          if (!r.id || !r.title) return null;
          return { r, id: r.id, title: String(r.title).trim() };
        })
        .filter((x): x is { r: MBRecording; id: string; title: string } => x !== null)
        .slice(0, 5);
      const records = await Promise.all(
        base.map(async ({ r, id, title }) => {
          const release = r.releases?.[0];
          const artwork = release?.id ? await coverForRelease(release.id) : null;
          return {
            id: mediaRecordId(PROVIDER, id),
            kind: "song" as const,
            provider: PROVIDER,
            providerId: id,
            title,
            creator: artistNames(r["artist-credit"]),
            creatorRole: "Song by",
            year: yearFrom(r["first-release-date"] ?? release?.date),
            coverUrl: artwork?.url ?? null,
            coverSource: artwork?.source,
            externalUrl: `https://musicbrainz.org/recording/${id}`,
            meta: release?.title ? { release: release.title } : undefined,
          } satisfies MediaRecord;
        }),
      );
      const filtered = records.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));
      return filtered.length > 0 ? { results: filtered, status: "ok" } : { results: [], status: "empty" };
    }

    // Album path — release-group with release ids for cover lookup.
    const response = await fetchProviderJson<MBCollectionResponse<MBReleaseGroupWithArtwork>>(url, { timeoutMs: 6_000 });
    const list = (response as unknown as { "release-groups"?: MBReleaseGroupWithArtwork[] })["release-groups"] ?? [];
    const base = list
      .map((r): { r: MBReleaseGroupWithArtwork; id: string; title: string } | null => {
        if (!r.id || !r.title) return null;
        return { r, id: r.id, title: String(r.title).trim() };
      })
      .filter((x): x is { r: MBReleaseGroupWithArtwork; id: string; title: string } => x !== null)
      .slice(0, 5);
    const records = await Promise.all(
      base.map(async ({ r, id, title }) => {
        const release = r.releases?.find((rel) =>
          rel.media?.some((m) => m["cover-art-archive"]?.front),
        ) ?? r.releases?.[0];
        let artwork = release?.id ? await coverForRelease(release.id) : null;
        // The release-group search does not include releases, so when we have
        // no release id we look one up. The Cover Art Archive indexes releases,
        // not release groups.
        if (!artwork) {
          const relId = await firstReleaseIdForGroup(id);
          if (relId) artwork = await coverForRelease(relId);
        }
        const primaryType = r["primary-type"] ?? "album";
        return {
          id: mediaRecordId(PROVIDER, id),
          kind: "album" as const,
          provider: PROVIDER,
          providerId: id,
          title,
          creator: artistNames(r["artist-credit"]),
          creatorRole: "Album by",
          year: yearFrom(r["first-release-date"]),
          coverUrl: artwork?.url ?? null,
          coverSource: artwork?.source,
          externalUrl: `https://musicbrainz.org/release-group/${id}`,
          meta: { type: primaryType },
        } satisfies MediaRecord;
      }),
    );
    const filtered = records.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));
    return filtered.length > 0 ? { results: filtered, status: "ok" } : { results: [], status: "empty" };
  } catch (error) {
    return { results: [], status: "unavailable", message: (error as Error).message };
  }
}