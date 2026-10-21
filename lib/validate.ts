/**
 * Validation helpers for the PRSME profile studio.
 *
 * These return a typed result object so the UI can display explicit inline
 * messages instead of "silently dropping" bad input.
 */

const SOCIALS_HOSTS: Record<string, RegExp[]> = {
  facebook: [/^https?:\/\/(?:[a-z0-9-]+\.)?facebook\.com\/.+/i, /^https?:\/\/(?:[a-z0-9-]+\.)?fb\.com\/.+/i],
  instagram: [/^https?:\/\/(?:[a-z0-9-]+\.)?instagram\.com\/[^/?#]+\/?$/i],
  snapchat: [/^https?:\/\/(?:[a-z0-9-]+\.)?snapchat\.com\/.+/i, /^https?:\/\/(?:[a-z0-9-]+\.)?story\.snapchat\.com\/.+/i],
  linkedin: [/^https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/(?:in|company)\/[^/?#]+\/?$/i],
};

/**
 * Normalize a pasted social URL — strip `?utm=...`, trailing slashes, etc.
 * Returns the *raw* input when it can't be improved; never throws.
 */
export function normalizeSocialUrl(
  platform: "facebook" | "instagram" | "snapchat" | "linkedin",
  input: string,
): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  // Drop tracking query params; keep meaningful ones only for facebook?
  // Conservative choice — drop *all* qs.
  url.search = "";
  // Trim trailing slash (but keep / for root).
  let out = url.toString();
  if (out.length > 8 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export type ValidationResult = { ok: boolean; message?: string };

const MAX_URL = 600;

export function validateSocialUrl(
  platform: "facebook" | "instagram" | "snapchat" | "linkedin",
  input: string,
): ValidationResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: true }; // empty is allowed; the field is optional
  if (trimmed.length > MAX_URL) return { ok: false, message: "URL is too long." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Enter a full URL (https://…)." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Only http(s) URLs are accepted." };
  }
  const patterns = SOCIALS_HOSTS[platform] ?? [];
  if (!patterns.some((re) => re.test(url.toString()))) {
    return {
      ok: false,
      message: `Use a ${platform}.com profile URL.`,
    };
  }
  return { ok: true };
}

/**
 * Derive a handle from a URL. Conservative: takes the last meaningful
 * segment. Returns "" for empty/single-segment hosts.
 */
export function deriveHandle(
  platform: "facebook" | "instagram" | "snapchat" | "linkedin",
  url: string,
): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return "";
  }
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return "";
  // Always use the first non-empty segment. Strip query, fragments.
  const handle = segments[0];
  if (!handle) return "";
  // For LinkedIn, the canonical handle can be /in/<handle> or /company/<name>.
  return `@${handle}`;
}

/* -------------------------------------------------------------------------- */
/*                               Spotify URL                                  */
/* -------------------------------------------------------------------------- */

const SPOTIFY_PATH_REGEX = /^\/(?:track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)(?:\?.*)?$/i;

/**
 * Validate a Spotify URL. We accept any <spotify-domain>/<type>/<id> path
 * where <type> ∈ {track, album, playlist, artist, episode, show} and reject
 * bare homepages.
 */
export function validateSpotifyUrl(raw: string): ValidationResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, message: "Add a Spotify track or album URL." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "That doesn't look like a URL." };
  }
  if (!parsed.hostname.endsWith("spotify.com")) {
    return { ok: false, message: "URL must be on spotify.com." };
  }
  if (parsed.hostname !== "open.spotify.com" && parsed.hostname !== "spotify.com") {
    return { ok: false, message: "Use an open.spotify.com URL." };
  }
  if (!SPOTIFY_PATH_REGEX.test(parsed.pathname)) {
    return { ok: false, message: "Use a track, album, playlist, or show link — not the homepage." };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                                  Tags                                      */
/* -------------------------------------------------------------------------- */

const TAG_INVALID_CHARS = /[^\p{L}\p{N}\s'/&#_.,-]/gu;

export function validateTag(input: string): ValidationResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, message: "Tag can't be empty." };
  if (trimmed.length > 40) return { ok: false, message: "Max 40 characters per tag." };
  if (TAG_INVALID_CHARS.test(trimmed)) {
    return { ok: false, message: "Use letters, numbers, spaces, or - — # &." };
  }
  return { ok: true };
}

export function isDuplicate<T>(items: T[], candidate: T): boolean {
  return items.some((i) =>
    typeof i === "string" ? (i as string).toLowerCase() === (candidate as string).toLowerCase() : i === candidate,
  );
}
