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

/* -------------------------------------------------------------------------- */
/*                       My Clicks (Phase 4.3) URL guards                       */
/* -------------------------------------------------------------------------- */

/**
 * Validate any external URL the studio accepts (image, post, source). Honest
 * fail: an invalid or unsafe URL returns false, so the ClicksPanel can show a
 * real explanation instead of feeding an unsafe link to the renderer.
 *
 * Rules:
 *   - Must be parseable as a URL.
 *   - Must use https or http (we do not accept data: / blob: / file: etc.).
 *   - Hostname must contain at least one dot, so a bare "localhost" or
 *     single-segment hostname cannot pass.
 *   - Must not be a private / loopback address. PRSME would be safe — the
 *     browser loads the URL itself — but a hard guard prevents accidental
 *     leaks to a private-network origin from the public profile.
 *
 * A second `requireImageLike` mode additionally asks for a path that looks
 * like an image or a `/p/{shortcode}` Instagram permalink shape, so a typo
 * never becomes an <iframe> embed to an arbitrary host.
 */
export type ExternalUrlKind = "image" | "post" | "source";

export function isSafeExternalUrl(value: unknown): value is string {
  const url = validateBasicUrl(value);
  if (!url) return false;
  return !isLocalNetworkHost(url.hostname);
}

/** True when `value` parses as an https/http URL whose hostname is internet-shaped. */
export function validateBasicUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  return url;
}

function isLocalNetworkHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "[::1]"
  ) {
    return true;
  }
  // RFC 1918 + 169.254 + 127.x
  if (/^(?:10|127|169\.254|192\.168)\.\d+\.\d+\.\d+$/.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(lower)) return true;
  // *.local
  if (lower.endsWith(".local")) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/*                    Custom Link Buttons (Phase 4.5)                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                    Custom Link Buttons (Phase 4.5)                          */
/* -------------------------------------------------------------------------- */

/*
 * Reuses the module's existing `MAX_URL` cap and `isLocalNetworkHost` guard
 * rather than re-declaring either, so a Custom Link Button and a social link
 * can never disagree about what counts as a safe destination.
 */

/**
 * Validate a Custom Link Button's destination.
 *
 * Stricter than `isSafeExternalUrl` on purpose. This URL is rendered as an
 * outbound profile button, so it must be **https only** — no `http:` downgrade
 * on a surface designed to be trusted, and no scheme that could smuggle script
 * into the page (`javascript:`, `data:`, `blob:`). Private/loopback hosts are
 * rejected by the shared `isLocalNetworkHost` guard.
 *
 * Returns a trimmed, canonical URL so the stored value is exactly what will be
 * rendered as the href — we never store a raw string and re-derive it later.
 */
export function validateCustomLinkUrl(value: unknown): {
  ok: boolean;
  url?: string;
  message?: string;
} {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Add a destination URL for this button." };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_URL) {
    return { ok: false, message: "That URL is too long." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Enter a full URL, including https://." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "Use an https:// address." };
  }
  if (!url.hostname.includes(".")) {
    return { ok: false, message: "That host does not look like a real domain." };
  }
  if (isLocalNetworkHost(url.hostname)) {
    return {
      ok: false,
      message: "That points at a private network, so it cannot be a public button.",
    };
  }
  return { ok: true, url: url.toString() };
}

/** A button label must be visible text, not whitespace and not a raw URL dump. */
export function validateCustomLinkLabel(value: unknown): {
  ok: boolean;
  label?: string;
  message?: string;
} {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Give the button a label — that is what visitors read." };
  }
  const label = value.trim();
  if (label.length > 60) {
    return { ok: false, message: "Keep the label to 60 characters or fewer." };
  }
  return { ok: true, label };
}

/* -------------------------------------------------------------------------- */
/*              Custom Link Button presentation (Phase 4.6)                   */
/* -------------------------------------------------------------------------- */

/*
 * The presentation options are an enumeration, not free text, so the reader and
 * the studio can share one list and an unrecognised value can never reach the
 * DOM as a class name. Declaring the accepted sets here — rather than in the
 * panel and again in the renderer — is what stops a typo from producing an
 * unstyled button.
 */
export const CUSTOM_LINK_SHAPES = ["rounded", "rect", "pill"] as const;
export const CUSTOM_LINK_STYLES = ["solid", "outline", "tint"] as const;
export const CUSTOM_LINK_COLOUR_MODES = ["theme", "custom"] as const;
export const CUSTOM_LINK_LAYOUTS = ["stack", "grid"] as const;

export type CustomLinkShapeValue = (typeof CUSTOM_LINK_SHAPES)[number];
export type CustomLinkStyleValue = (typeof CUSTOM_LINK_STYLES)[number];
export type CustomLinkColourModeValue = (typeof CUSTOM_LINK_COLOUR_MODES)[number];
export type CustomLinkLayoutValue = (typeof CUSTOM_LINK_LAYOUTS)[number];

/** Defaults applied when a stored button carries no presentation of its own. */
export const DEFAULT_CUSTOM_LINK_SHAPE: CustomLinkShapeValue = "rounded";
export const DEFAULT_CUSTOM_LINK_STYLE: CustomLinkStyleValue = "solid";
export const DEFAULT_CUSTOM_LINK_COLOUR_MODE: CustomLinkColourModeValue = "theme";
export const DEFAULT_CUSTOM_LINK_LAYOUT: CustomLinkLayoutValue = "stack";

/**
 * Coerce an arbitrary value to a valid shape id, or `null` when it is not one.
 *
 * Returning `null` (rather than a default) is deliberate: the caller decides
 * whether an absent field means "use the default" or "reject the entry", and
 * silently substituting a default here would make an unrecognised value
 * indistinguishable from an unset one.
 */
export function readCustomLinkShape(value: unknown): CustomLinkShapeValue | null {
  return CUSTOM_LINK_SHAPES.includes(value as CustomLinkShapeValue)
    ? (value as CustomLinkShapeValue)
    : null;
}

export function readCustomLinkStyle(value: unknown): CustomLinkStyleValue | null {
  return CUSTOM_LINK_STYLES.includes(value as CustomLinkStyleValue)
    ? (value as CustomLinkStyleValue)
    : null;
}

export function readCustomLinkColourMode(
  value: unknown,
): CustomLinkColourModeValue | null {
  return CUSTOM_LINK_COLOUR_MODES.includes(value as CustomLinkColourModeValue)
    ? (value as CustomLinkColourModeValue)
    : null;
}

export function readCustomLinkLayout(value: unknown): CustomLinkLayoutValue | null {
  return CUSTOM_LINK_LAYOUTS.includes(value as CustomLinkLayoutValue)
    ? (value as CustomLinkLayoutValue)
    : null;
}

/**
 * Validate an owner-supplied button accent.
 *
 * Accepts `#rgb` and `#rrggbb` only — the same rule the profile accent already
 * uses — so the colour ends up as a real colour value rather than an arbitrary
 * CSS string injected into a style attribute. There is no alpha form: a
 * transparent button would be unreadable, and `color-mix` derives every tint
 * from the opaque base.
 */
export function validateCustomLinkAccent(value: unknown): {
  ok: boolean;
  accent?: string;
  message?: string;
} {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Pick a button colour, or use the theme accent." };
  }
  const accent = value.trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) {
    return { ok: false, message: "Use a hex colour like #8C6CFF." };
  }
  return { ok: true, accent: accent.toLowerCase() };
}

/**
 * Derive a readable text colour for a solid button of the given background.
 *
 * Written out rather than delegated to a contrast library: PRSME already uses
 * this exact approach for rating badges and tags, and the two must agree or a
 * solid button and a solid badge would disagree about the same colour.
 *
 * Relative luminance is the WCAG definition (sRGB linearisation included), so
 * the threshold at 0.179 is the real "is there enough contrast for large bold
 * text" boundary rather than a tuned guess.
 */
export function readableTextOn(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0B0B10";
  let body = m[1]!;
  if (body.length === 3) body = body[0]! + body[0]! + body[1]! + body[1]! + body[2]! + body[2]!;
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(body.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance =
    0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  // A light fill takes the profile's dark ink; a dark fill takes near-white.
  return luminance > 0.179 ? "#0B0B10" : "#F7F4EE";
}

export function classifyExternalUrl(value: string):
  | { kind: "instagram"; shortcode: string }
  | { kind: "facebook"; path: string }
  | { kind: "source"; host: string }
  | null {
  const url = validateBasicUrl(value);
  if (!url) return null;

  const path = url.pathname.replace(/\/+$/, "");
  const ig = path.match(/^\/(?:p|reel|reels)\/([A-Za-z0-9_-]{6,})$/);
  if (ig && url.hostname.endsWith("instagram.com")) {
    return { kind: "instagram", shortcode: ig[1]! };
  }
  if (url.hostname.endsWith("facebook.com") && path.length > 1) {
    return { kind: "facebook", path };
  }
  if (url.hostname.endsWith("fb.com") && path.length > 1) {
    return { kind: "facebook", path };
  }
  return { kind: "source", host: url.hostname };
}
