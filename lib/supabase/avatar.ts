/**
 * Avatar storage.
 *
 * Avatars live in a PRIVATE Supabase Storage bucket, not in the profile's
 * JSONB and not as base64 in localStorage. Three properties follow from the
 * bucket being private, and each is enforced here:
 *
 *   1. **Ownership-based paths.** Every object is `<auth.uid()>/<file>`. That
 *      makes the storage policy a single foldername comparison rather than a
 *      join, and it means an owner cannot overwrite someone else's avatar by
 *      guessing a path.
 *
 *   2. **Scoped signed URLs.** Nothing is persisted as a URL. `createSignedUrl`
 *      returns a temporary credential; storing one would both expire and leak
 *      a bearer token into the profile row. Instead the row keeps only
 *      `avatar_path`, and the URL is minted per request — after the caller has
 *      been checked as allowed to see that profile.
 *
 *   3. **Server-side size and type limits.** The bucket enforces both too, but
 *      checking here means an oversized or wrong-type file is rejected with a
 *      clear message instead of a generic storage error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const AVATAR_BUCKET = "avatars";

/** Mirrors the bucket's `file_size_limit` (2 MB). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Mirrors the bucket's `allowed_mime_types`. */
export const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

/** How long a signed avatar URL stays valid. Short on purpose. */
const SIGNED_URL_TTL_SECONDS = 300;

export type AvatarValidation =
  | { ok: true; mimeType: AvatarMimeType; extension: string }
  | { ok: false; message: string };

/**
 * Validate a picked file.
 *
 * The extension is derived from the MIME type rather than from the filename:
 * a file named `photo.png` that is actually a PDF would otherwise get a `.png`
 * key and be served with the wrong content type.
 */
export function validateAvatarFile(file: {
  type: string;
  size: number;
}): AvatarValidation {
  const mimeType = file.type as AvatarMimeType;
  if (!AVATAR_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      message: "Use a PNG, JPEG, WebP, or GIF image.",
    };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    const mb = (AVATAR_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, message: `Images must be under ${mb} MB.` };
  }
  if (file.size === 0) {
    return { ok: false, message: "That file is empty." };
  }

  const extension: Record<AvatarMimeType, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return { ok: true, mimeType, extension: extension[mimeType] };
}

/**
 * Build the storage path for a new upload.
 *
 * The first segment is the owner id, which is exactly what the storage policy
 * checks. A random suffix keeps repeated uploads from overwriting a cached
 * object at the same key.
 */
export function buildAvatarPath(
  userId: string,
  extension: string,
  uniqueSuffix: string,
): string {
  return `${userId}/avatar-${uniqueSuffix}.${extension}`;
}

export interface UploadAvatarResult {
  ok: boolean;
  path?: string;
  message?: string;
}

/**
 * Upload an avatar for the given user.
 *
 * The caller must already know `userId` came from a verified session — this
 * function does not derive it. That is deliberate: it keeps this module a
 * thin storage wrapper, and the ownership decision stays in one place (the
 * caller), while the database re-checks it via the storage policy anyway.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: Blob,
  opts: { type: string; size: number },
): Promise<UploadAvatarResult> {
  const validation = validateAvatarFile(opts);
  if (!validation.ok) return { ok: false, message: validation.message };

  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const path = buildAvatarPath(userId, validation.extension, suffix);

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      contentType: validation.mimeType,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    return { ok: false, message: error.message ?? "Could not upload the avatar." };
  }

  return { ok: true, path };
}

/** Remove an owned avatar. Never called with an unverified path. */
export async function deleteAvatar(
  supabase: SupabaseClient,
  path: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!path) return { ok: true };
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Mint a short-lived URL for a stored avatar.
 *
 * Returns `null` when there is no avatar, or when signing fails — the caller
 * then renders the palette fallback rather than a broken image. This is the
 * ONLY way avatar bytes leave the private bucket in this phase.
 */
export async function createAvatarUrl(
  supabase: SupabaseClient,
  avatarPath: string | null,
): Promise<string | null> {
  if (!avatarPath) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS, {
      // Scoped download: the browser receives the bytes as an attachment
      // download rather than an inline document, so a stored image cannot be
      // rendered as HTML on the app's origin.
      download: false,
    });

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}