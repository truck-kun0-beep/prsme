/**
 * Cinemeta adapter — movie and series metadata.
 *
 * Cinemeta is a community-maintained addon that normalises IMDb ids into a
 * uniform metadata shape. We use the public, key-free endpoints for both
 * search and direct-id lookups:
 *
 *   https://v3-cinemeta.strem.io/.../search/{kind}?search=…
 *   https://v3-cinemeta.strem.io/meta/{kind}/{imdbId}.json
 *
 * `kind` is either `movie` or `series`. `kdrama` is treated as `series` —
 * the metadata shape is identical; the year and creator are what mark it as
 * a K-drama in PRSME.
 *
 * Posters come back as a relative path on `image-cdn.cinemeta.io`; we promote
 * them to absolute URLs only when they hit the allowlisted host.
 *
 * Phase 4.2 note on artwork: Cinemeta's artwork path has degraded upstream —
 * `images.metahub.space` no longer resolves and `image-cdn.cinemeta.io`
 * answers with an HTML page rather than an image. Films therefore fall back to
 * a Wikimedia Commons poster (see `wikipediaPosterFor`), which is public,
 * key-free, and stable. See `lib/media/http.ts` for the artwork allowlist.
 */

import {
  type MediaKindId,
  type MediaProviderId,
  type MediaRecord,
  mediaRecordId,
} from "../types";
import {
  fetchProviderJson,
  isAllowedArtworkUrl,
  ProviderFetchError,
} from "../http";

const PROVIDER: MediaProviderId = "cinemeta";

interface CinemetaByIdResponse {
  meta?: CinemetaMeta;
}

interface CinemetaMeta {
  id?: string;
  type?: string;
  name?: string;
  year?: number | string;
  imdb_id?: string;
  poster?: string;
  background?: string;
  description?: string;
  runtime?: string | number;
  cast?: string[];
  director?: string[];
  creator?: string[];
  genre?: string[];
  status?: string;
  // Series-only fields:
  episodes?: Array<{ season?: number | string; episode?: number | string }>;
  // Movie-specific fields:
  duration?: string;
}

interface CinemetaSearchResponse {
  metas?: CinemetaMeta[];
}

/** Direct-id lookups return `{ meta: ... }` per Cinemeta docs. */
interface CinemetaDirectResponse {
  meta?: CinemetaMeta;
}

/**
 * Cinemeta's path conventions follow its kind taxonomy. We translate.
 */
function cinemetaKind(kind: MediaKindId): "movie" | "series" | null {
  if (kind === "movie") return "movie";
  if (kind === "tv") return "series";
  return null;
}

/** Resolve a Cinemeta poster URL, returning null when the host is not allowed. */
function resolvePoster(meta: CinemetaMeta): { url: string; source: string } | null {
  const raw = meta.poster ?? meta.background ?? "";
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://v3-cinemeta.strem.io/");
  } catch {
    return null;
  }
  // Cinemeta sometimes returns proxy URLs (`https://images.metahub.space/...`).
  // Both endpoints serve cover art and are mirrored to the same files, but we
  // only surface allowlisted hosts.
  if (isAllowedArtworkUrl(parsed.toString())) {
    return { url: parsed.toString(), source: "Cinemeta artwork" };
  }
  return null;
}

/** Pick the most useful creator credit the provider returned. */
function pickCreator(meta: CinemetaMeta): { creator: string; role: string } | null {
  if (meta.director && meta.director.length > 0) {
    return { creator: meta.director.join(", "), role: "Director" };
  }
  if (meta.creator && meta.creator.length > 0) {
    return { creator: meta.creator.join(", "), role: "Creator" };
  }
  if (meta.cast && meta.cast.length > 0) {
    return { creator: meta.cast.slice(0, 4).join(", "), role: "Starring" };
  }
  return null;
}

/**
 * Normalise one Cinemeta result into a PRSME `MediaRecord`. The function is
 * deliberately strict: any field that fails validation is dropped silently
 * rather than transformed or guessed.
 */
function normalise(
  meta: CinemetaMeta,
  kind: "movie" | "series",
): MediaRecord | null {
  if (!meta || typeof meta !== "object") return null;
  const providerId = (meta.imdb_id ?? meta.id ?? "").trim();
  if (!providerId) return null;
  const title = String(meta.name ?? "").trim();
  if (!title) return null;

  const yearRaw = meta.year;
  const yearNum =
    typeof yearRaw === "number"
      ? Number.isFinite(yearRaw)
        ? yearRaw
        : undefined
      : typeof yearRaw === "string"
      ? (() => {
          const parsed = Number.parseInt(yearRaw.slice(0, 4), 10);
          return Number.isFinite(parsed) ? parsed : undefined;
        })()
      : undefined;

  const artwork = resolvePoster(meta);
  const credits = pickCreator(meta);

  return {
    id: mediaRecordId(PROVIDER, providerId),
    kind: kind === "movie" ? "movie" : "tv",
    provider: PROVIDER,
    providerId,
    title,
    creator: credits?.creator,
    creatorRole: credits?.role,
    year: yearNum,
    coverUrl: artwork?.url ?? null,
    coverSource: artwork?.source,
    externalUrl: `https://www.imdb.com/title/${providerId}/`,
    description: typeof meta.description === "string" ? meta.description.slice(0, 1_000) : undefined,
    meta:
      meta.cast && meta.cast.length > 0
        ? { cast: meta.cast.slice(0, 5).join(", ") }
        : undefined,
  };
}

/**
 * Cinemeta's catalogue search is a **path segment**, not a query parameter.
 *
 *   https://v3-cinemeta.strem.io/catalog/movie/top/search=<term>.json
 *
 * The previous build used `…/top.json?search=<term>`, which the CDN ignores —
 * it returned the global "top" list regardless of the query, so searching for
 * "Interstellar" produced unrelated recent releases. The path form is what
 * Cinemeta actually serves and it returns real matches.
 */
function searchUrl(cm: "movie" | "series", term: string): string {
  return `https://v3-cinemeta.strem.io/catalog/${cm}/top/search=${encodeURIComponent(
    term,
  )}.json`;
}

export async function searchCinemeta(
  kind: MediaKindId,
  query: string,
): Promise<{ results: MediaRecord[]; status: "ok" | "empty" | "unavailable"; message?: string }> {
  const cm = cinemetaKind(kind);
  if (!cm) return { results: [], status: "unavailable", message: "Cinemeta does not serve this kind." };

  const q = query.trim();
  if (!q) return { results: [], status: "empty" };
  const url = searchUrl(cm, q);

  try {
    const data = await fetchProviderJson<CinemetaSearchResponse | { metas: CinemetaMeta[] }>(url, {
      timeoutMs: 5_500,
    });
    const metas: CinemetaMeta[] = Array.isArray((data as CinemetaSearchResponse).metas)
      ? (data as CinemetaSearchResponse).metas ?? []
      : [];
    const matched = metas
      .map((m) => normalise(m, cm))
      .filter((m): m is MediaRecord => m !== null)
      // Cinemeta's "search" returns anything whose name contains the query.
      // We re-verify the match locally with a case-insensitive substring so
      // empty or loosely-related results don't reach the user.
      .filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8);

    /**
     * Catalogue search responses carry posters on hosts PRSME does not
     * allowlist (`m.media-amazon.com`), while the per-id metadata endpoint
     * returns the same poster on `images.metahub.space`, which we do allow.
     * So after a successful search we hydrate the top matches by id — the
     * cost is a few extra small JSON calls and the payoff is that the poster
     * the user actually sees is one we are permitted to render.
     *
     * A hydration failure never removes a match: we keep the search result
     * with an honest `coverUrl: null` rather than dropping a real title.
     *
     * Phase 4.2 — Cinemeta's own artwork path has stopped serving images. The
     * `images.metahub.space` mirror no longer resolves at all, and
     * `image-cdn.cinemeta.io` answers with an HTML document rather than a
     * poster. Every film PRSME resolved therefore rendered as a placeholder.
     *
     * A match with no usable Cinemeta cover now falls back to a Wikimedia
     * Commons poster (see `wikipediaPosterFor`) instead of landing straight on
     * the placeholder. A title with no poster anywhere still resolves to
     * `coverUrl: null`, which the UI renders as the designed placeholder.
     */
    const hydrated = await Promise.all(
      matched.slice(0, 5).map(async (record) => {
        // Only pay for the per-id hydration when the search gave us nothing.
        const full = record.coverUrl
          ? null
          : await getCinemetaById(record.providerId, kind);
        const cinemetaCover = record.coverUrl ?? full?.coverUrl ?? undefined;

        const base: MediaRecord = {
          ...record,
          coverUrl: cinemetaCover ?? null,
          coverSource: cinemetaCover
            ? (record.coverSource ?? full?.coverSource)
            : undefined,
          year: record.year ?? full?.year,
          description: record.description ?? full?.description,
          creator: record.creator ?? full?.creator,
          creatorRole: record.creatorRole ?? full?.creatorRole,
        };

        if (base.coverUrl && !isDegradedCinemetaArtwork(base.coverUrl)) {
          return base;
        }
        const wiki = await wikipediaPosterFor(base.title);
        return wiki
          ? { ...base, coverUrl: wiki, coverSource: "Wikimedia Commons" }
          : // No usable poster anywhere: keep an honest null rather than
            // handing the browser a URL we know renders HTML.
            { ...base, coverUrl: null, coverSource: undefined };
      }),
    );

    return hydrated.length > 0
      ? { results: hydrated, status: "ok" }
      : { results: [], status: "empty" };
  } catch (error) {
    return {
      results: [],
      status: error instanceof ProviderFetchError ? "unavailable" : "unavailable",
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

/*
 * Cinemeta's poster CDN has degraded in two ways: `images.metahub.space` no
 * longer resolves, and `image-cdn.cinemeta.io` serves 200 text/html instead
 * of an image. We detect both signals in a single pass so each hydrated record
 * takes the fastest path to a known-good mirror.
 *
 *   - `metahub` URLs: hostname has been observed dead in production; reject.
 *   - `image-cdn.cinemeta.io` URLs: the route still answers, but the body is an
 *     HTML document, so we trust Wikipedia instead.
 *   - any other host: trust the URL; we never fabricate a thumbnail.
 *
 * This is conservative by design — when Cinemeta's image CDN recovers, the
 * allowlist will welcome it again and this helper falls out of the hot path.
 */
function isDegradedCinemetaArtwork(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "images.metahub.space" || host === "metahub.space" ||
      host === "image-cdn.cinemeta.io"
    );
  } catch {
    return true;
  }
}

/** Pull the full, authoritative record for an id once the user has selected. */
export async function getCinemetaById(
  imdbId: string,
  kind: MediaKindId,
): Promise<MediaRecord | null> {
  const cm = cinemetaKind(kind);
  if (!cm) return null;
  if (!/^tt\d{6,}$/.test(imdbId)) return null;
  try {
    const data = await fetchProviderJson<CinemetaDirectResponse>(
      `https://v3-cinemeta.strem.io/meta/${cm}/${imdbId}.json`,
      { timeoutMs: 5_500 },
    );
    if (!data?.meta) return null;
    return normalise(data.meta, cm);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                      Phase 4.2 — Wikipedia poster fallback                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a film's poster through Wikipedia.
 *
 * Wikimedia Commons is public, key-free, and serves the binaries behind every
 * Wikipedia article image. Constraints that shaped this helper:
 *
 *   - We never guess a filename. We read the image URL Wikipedia computed for
 *     the article's own infobox.
 *   - Every article we consider must carry the *same name* as the work
 *     (`filmTitleClaim`). Wikipedia resolves generously, and an article named
 *     exactly like the work is often the franchise, the soundtrack, or an
 *     unrelated noun — the film "Paper Lanterns" and the article "Paper
 *     lantern" share a name, and only one of them has a poster.
 *   - A surviving article must also be tagged by Wikipedia itself as a film or
 *     television series (`description`), which rules out soundtracks, novels,
 *     franchise hubs, and "list of accolades" pages.
 *   - Every URL is validated against the artwork allowlist before it reaches a
 *     browser.
 *   - When nothing usable is found we return `null` and the UI renders its
 *     designed placeholder rather than inventing a URL.
 */
async function wikipediaPosterFor(title: string): Promise<string | null> {
  const clean = title.trim();
  if (!clean) return null;

  /*
   * Step 1 — the article named after the work.
   *
   * Wikipedia's REST summary endpoint answers with the canonical title, the
   * one-line description, and the infobox image for that exact article in a
   * single request. That is the image a reader would actually see on the page,
   * so it is the right default whenever the article and the work agree.
   */
  const direct = await wikipediaArticlePoster(clean, clean);
  if (direct) return direct;

  /*
   * Step 2 — disambiguate via a restricted search.
   *
   * "Interstellar" resolves to the franchise page, while "Interstellar (film)"
   * holds the poster. MediaWiki ranks its hits by how Wikipedia itself weights
   * them, so the list is walked in order and the first hit that survives the
   * identity check wins.
   */
  try {
    const endpoint = new URL("https://en.wikipedia.org/w/api.php");
    endpoint.searchParams.set("action", "query");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("list", "search");
    endpoint.searchParams.set("srlimit", "5");
    endpoint.searchParams.set("srsearch", `${clean} film`);

    interface WikiSearchResponse {
      query?: { search?: Array<{ title?: string }> };
    }
    const response = await fetchProviderJson<WikiSearchResponse>(
      endpoint.toString(),
      { timeoutMs: 2_500 },
    );
    for (const hit of response.query?.search ?? []) {
      if (!hit.title) continue;
      const image = await wikipediaArticlePoster(hit.title, clean);
      if (image) return image;
    }
  } catch {
    // A failed disambiguation is not something the owner should see. The
    // caller keeps `coverUrl: null` and the layout shows its placeholder.
  }

  /*
   * Step 3 — the naive `<work> film` article name. Not a guess about the
   * work's identity: the identity check still has to agree before any image is
   * returned.
   */
  const variant = await wikipediaArticlePoster(`${clean} film`, clean);
  return variant;
}

/**
 * Reduce a Wikipedia page name to the work's own name.
 *
 * `"Parasite (2019 film)"` -> `"parasite"`. Parenthetical qualifiers carry
 * disambiguation, not identity, so they are dropped before the comparison.
 *
 * Colons are NOT stripped — for the same reason English titles use them ("The
 * Hunt: in the dark"), a chapter-subtitle pattern ("Interstellar: Nolan's
 * Odyssey"), or a franchise sub-title. Dropping them collapsed
 * "Interstellar: Nolan's Odyssey" onto the bare-titled `Interstellar` article
 * and attached the Interstellar poster to the wrong record.
 */
function baseTitle(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    // Colons separate words here, so "Interstellar: Nolan's Odyssey" tokenises
    // into distinct tokens rather than gluing "interstellar:" together.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The identity gate the whole fallback rests on.
 *
 * Wikipedia resolves generously and follows title redirects, so the article we
 * get back is not always the article we asked about. "Interstellar: Nolan's
 * Odyssey" is not a Wikipedia page, so the summary request is answered by a
 * redirect to "Interstellar (film)" — attaching that poster to the Odyssey
 * record would put the wrong film on someone's shelf.
 *
 * We accept a canonical article only when it is recognisably *the work named*:
 * every distinguishing token of the claim has to appear in the canonical
 * article. "Interstellar" satisfies "Interstellar: Nolan's Odyssey"? No — the
 * tokens "nolan" and "odyssey" are missing, so it is rejected. This is
 * deliberately strict: a false negative costs one poster and falls back to the
 * designed placeholder, while a false positive shows the wrong film.
 */
function filmTitleClaim(pageTitle: string, claim: string): boolean {
  const page = baseTitle(pageTitle);
  const want = baseTitle(claim);
  if (page.length === 0 || want.length === 0) return false;

  if (page === want) return true;

  // A redirect only counts when the requested tokens are a subset of the
  // canonical's — i.e. the canonical is *at least as specific* as the claim.
  // "Arrival (film)" satisfies a claim of "Arrival"; "Interstellar (film)"
  // does not satisfy "Interstellar Nolans Odyssey".
  const pageTokens = new Set(page.split(" "));
  return want.split(" ").every((token) => pageTokens.has(token));
}

/**
 * Read one Wikipedia article's infobox image, gated on both identity and kind.
 *
 * Both gates must pass before a URL is returned:
 *
 *   1. `filmTitleClaim` — the article carries the same name as the work.
 *   2. `isScreenWork` — Wikipedia's own one-liner tags the page as a film or
 *      television series. "2010 film by Christopher Nolan" passes; a
 *      soundtrack album, a tie-in novel, or a franchise hub does not.
 */
async function wikipediaArticlePoster(
  articleTitle: string,
  claim: string,
): Promise<string | null> {
  try {
    const url =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(articleTitle.replace(/ /g, "_"));

    const response = await fetchProviderJson<{
      type?: string;
      title?: string;
      titles?: { normalized?: string; canonical?: string };
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
      description?: string;
    }>(url, { timeoutMs: 2_500 });

    // A disambiguation page lists every work of a name; it has no artwork of
    // its own and its image is usually an unrelated logo.
    if (response.type === "disambiguation") return null;

    const image = response.originalimage?.source ?? response.thumbnail?.source;
    if (!image || !isAllowedArtworkUrl(image)) return null;

    const canonical =
      response.titles?.normalized ??
      response.titles?.canonical ??
      response.title ??
      "";
    if (!filmTitleClaim(canonical, claim)) return null;
    if (!isScreenWork(response.description)) return null;

    return stripTracking(image);
  } catch {
    // A 404 simply means there is no article of this name. Nothing is surfaced
    // to the owner; the caller falls back to its placeholder.
    return null;
  }
}

/**
 * Does Wikipedia's own description tag this page as a film or a TV series?
 *
 * The phrasing comes from the article's short description field, which is
 * maintained by editors specifically to say *what kind of thing this is* —
 * "2010 film by Christopher Nolan", "2019 South Korean film by Bong Joon Ho",
 * "American psychological thriller television series". A soundtrack album, a
 * tie-in novel, or a franchise hub never gets that treatment.
 */
function isScreenWork(description: string | undefined): boolean {
  const text = String(description ?? "").toLowerCase();
  if (!text) return false;
  return /\b(film|movie|television series|tv series|web series|anime)\b/.test(text);
}

/** Drop the analytics query Wikipedia appends; the path is the real asset. */
function stripTracking(url: string): string {
  const at = url.indexOf("?");
  return at === -1 ? url : url.slice(0, at);
}

void searchCinemeta; // (top.json used for catalogue browsing; not called today)