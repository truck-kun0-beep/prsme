import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured, supabaseSetupMessage } from "@/lib/supabase/config";
import { resolveMediaItem } from "@/lib/supabase/media";
import {
  MEDIA_KIND_IDS,
  MEDIA_PROVIDER_LABELS,
  type MediaKindId,
  type MediaProviderId,
} from "@/lib/media/types";

/**
 * POST /api/media/resolve — turn a picked catalogue item into a canonical
 * PRSME media record.
 *
 * The browser sends the provider coordinates of the item the owner selected in
 * the picker. The server resolves (or creates) the shared `media_items` row and
 * returns its internal id — the one a review attaches to.
 *
 * Why the server does the resolution rather than the browser:
 *
 *   - **The catalogue row is shared.** Creating it is a write that must obey
 *     the database's uniqueness constraint, and it is exactly the write that
 *     two simultaneous reviews of the same new film can race on. The
 *     constraint resolves that race, and the server is the only place that
 *     can both write and re-read the winner's row.
 *
 *   - **The payload is validated here.** The provider id, provider item id,
 *     and kind are checked against the known sets before anything is stored.
 *     A crafted request cannot introduce a new provider or a new media kind.
 *
 *   - **Artwork is vetted here.** The artwork allowlist is applied server-side
 *     (`lib/supabase/media.ts`), so an unlisted host never reaches a public
 *     catalogue row.
 *
 * Requires a signed-in owner: creating a catalogue record is an authenticated
 * action, and an anonymous visitor has nothing to attach a review to.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured.", setup: supabaseSetupMessage() },
      { status: 503 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "You need to be signed in to add media." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request body." },
      { status: 400 },
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { ok: false, error: "Malformed request body." },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;

  const provider = typeof body.provider === "string" ? body.provider : "";
  const providerId = typeof body.providerId === "string" ? body.providerId : "";
  const kind = typeof body.kind === "string" ? body.kind : "";

  if (
    !Object.prototype.hasOwnProperty.call(MEDIA_PROVIDER_LABELS, provider) ||
    !MEDIA_KIND_IDS.includes(kind as MediaKindId) ||
    !providerId.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "That catalogue item isn't recognised." },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "That catalogue item has no title." },
      { status: 400 },
    );
  }

  const media = await resolveMediaItem({
    id: `${provider}:${providerId}`,
    kind: kind as MediaKindId,
    provider: provider as MediaProviderId,
    providerId,
    title,
    alternateTitle:
      typeof body.alternateTitle === "string" ? body.alternateTitle : undefined,
    creator: typeof body.creator === "string" ? body.creator : undefined,
    creatorRole:
      typeof body.creatorRole === "string" ? body.creatorRole : undefined,
    year: typeof body.year === "number" ? body.year : undefined,
    coverUrl: typeof body.coverUrl === "string" ? body.coverUrl : null,
    coverSource:
      typeof body.coverSource === "string" ? body.coverSource : undefined,
    externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
  });

  if (!media) {
    return NextResponse.json(
      { ok: false, error: "That media item could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      media: {
        id: media.id,
        provider: media.provider,
        providerId: media.providerId,
        kind: media.kind,
        title: media.title,
        year: media.year ?? null,
        artworkUrl: media.artworkUrl ?? null,
        artworkSource: media.artworkSource ?? null,
        externalUrl: media.externalUrl ?? null,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
