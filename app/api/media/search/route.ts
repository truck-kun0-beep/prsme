/**
 * GET /api/media/search?kind={kind}&q={query}
 *
 * The single server-side entry point for PRSME's media search. This is **not**
 * a generic URL-fetching proxy:
 *
 *   - `kind` must be one of the seven known kinds.
 *   - The query string is passed to a fixed set of provider adapters.
 *   - Every outbound host is checked against an allowlist in `lib/media/http`.
 *   - Upstream errors are never echoed to the client.
 *   - `format` is an optional book subtype (`standard` | `light-novel`).
 *     It is a *hint* passed to book providers; it never filters or relabels a
 *     result on its own.
 *
 * Example: /api/media/search?kind=movie&q=inception
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runMediaSearch,
  HANDLED_KINDS,
} from "@/lib/media/search";
import { MEDIA_KIND_IDS, type MediaKindId } from "@/lib/media/types";

/** Provider calls are network-bound; give the route headroom above its own budget. */
export const maxDuration = 15;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawKind = searchParams.get("kind") ?? "";
  const rawQuery = searchParams.get("q") ?? "";

  const kind = MEDIA_KIND_IDS.includes(rawKind as MediaKindId)
    ? (rawKind as MediaKindId)
    : null;
  if (!kind) {
    return NextResponse.json(
      {
        error: "unsupported_kind",
        message: `kind must be one of: ${HANDLED_KINDS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: "query_too_short",
        message: `Type at least ${MIN_QUERY_LENGTH} characters to search.`,
      },
      { status: 400 },
    );
  }

  try {
    const response = await runMediaSearch(kind, query, {
      format: readFormat(searchParams.get("format"), kind),
    });
    return NextResponse.json(response, {
      // Short shared cache so a burst of identical keystrokes doesn't hammer a
      // provider, while a freshly-published cover is never served stale for
      // long. Provider metadata is cached separately (see `lib/media/http`).
      headers: {
        "Cache-Control": "public, max-age=20, stale-while-revalidate=60",
      },
    });
  } catch {
    // We never surface the raw error — could contain upstream URLs/details.
    return NextResponse.json(
      {
        error: "search_failed",
        kind,
        query,
        results: [],
        providers: [],
        degraded: true,
        nextCursor: null,
        message: "The media catalogue could not be reached just now.",
      },
      { status: 503 },
    );
  }
}

/**
 * Phase 4.2 — parse the book-format hint.
 *
 * The hint is only meaningful for `book`. Anything else (a bad value, or the
 * hint on a film search) is ignored rather than rejected, because the hint is
 * advisory and a stricter surface would only break a legitimate query.
 */
function readFormat(
  raw: string | null,
  kind: MediaKindId,
): "standard" | "light-novel" | undefined {
  if (kind !== "book") return undefined;
  if (raw === "light-novel") return "light-novel";
  if (raw === "standard") return "standard";
  return undefined;
}