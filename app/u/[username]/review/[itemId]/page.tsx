"use client";

/**
 * Full review reader — `/u/[username]/review/[itemId]`.
 *
 * Honest architecture boundary (Phase 4 §11): the review lives in the
 * browser draft, not on a shared server. This page reads the *same* draft the
 * public profile reads (`loadDraft()` from localStorage) and says so on screen.
 * When the authenticated backend lands, only `resolveItem` needs to change —
 * it becomes a fetch against a reviews table.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Artwork } from "@/components/Artwork";
import { RatingBadge } from "@/components/RatingBadge";
import { ThemeScope } from "@/components/ThemeScope";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { loadDraft } from "@/lib/profileDraft";
import { noirProfile } from "@/lib/noirProfile";
import { materializeCollections, buildDemoCollectionLookup } from "@/lib/effectiveProfile";
import type { ProfileMediaItem } from "@/lib/noirProfile";
import { MEDIA_PROVIDER_LABELS, type MediaProviderId } from "@/lib/media/types";

/** Find the reviewed item and the collection it belongs to. */
function resolveItem(
  collections: readonly { name: string; items: ProfileMediaItem[] }[],
  itemId: string,
): { item: ProfileMediaItem; collectionName: string } | null {
  for (const collection of collections) {
    const item = collection.items.find((i) => i.id === itemId);
    if (item) return { item, collectionName: collection.name };
  }
  return null;
}

export default function ReviewPage() {
  const params = useParams<{ username: string; itemId: string }>();
  const username = typeof params?.username === "string" ? params.username : "noir";
  const itemId = typeof params?.itemId === "string" ? params.itemId : "";

  // The draft only exists in the browser, so the first paint has to wait.
  const [state, setState] = useState<
    { item: ProfileMediaItem; collectionName: string } | null | undefined
  >(undefined);

  useEffect(() => {
    const draft = loadDraft();
    /*
     * Phase 4.2 — resolve against the *same* collection list the profile
     * rendered.
     *
     * Previously this read `draft.collections` directly, which meant a link
     * to a demo item (`film-pastel-city`) resolved to "Review not found" even
     * though that item was visibly on the page: the public profile merges the
     * demo shelf back into the draft via `materializeCollections`, and the
     * review reader did not. Running the same materialisation here makes the
     * link and its destination agree by construction.
     */
    const collections = draft
      ? materializeCollections(draft, buildDemoCollectionLookup(noirProfile))
      : noirProfile.collections;
    setState(resolveItem(collections, itemId));
  }, [itemId]);

  if (state === undefined) {
    return (
      <ThemeScope draftSource="storage">
        <SiteNav />
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
          <p className="text-[13px] text-[var(--text-muted)]">Loading review…</p>
        </main>
        <SiteFooter />
      </ThemeScope>
    );
  }

  if (!state) {
    return (
      <ThemeScope draftSource="storage">
        <SiteNav />
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="font-display text-2xl text-[var(--text-strong)]">
            Review not found
          </h1>
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
            No item with that id exists in the draft saved on this device.
          </p>
          <Link
            href={`/u/${username}`}
            className="mt-4 inline-block rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-default)]"
          >
            Back to profile
          </Link>
        </main>
        <SiteFooter />
      </ThemeScope>
    );
  }

  const { item, collectionName } = state;
  const providerLabel = item.provider
    ? MEDIA_PROVIDER_LABELS[item.provider as MediaProviderId]
    : null;

  return (
    <ThemeScope draftSource="storage">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href={`/u/${username}`}
          className="pf-meta inline-flex items-center gap-1 text-[var(--pf-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--pf-text-strong)]"
        >
          ← Back to @{username}
        </Link>

        <article className="mt-4 overflow-hidden rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface-1)]">
          <header className="flex gap-4 border-b border-[var(--pf-border)] p-5 sm:p-6">
            <div className="h-32 w-24 shrink-0 overflow-hidden rounded-lg sm:h-40 sm:w-32">
              <Artwork
                palette={item.palette}
                src={item.coverUrl}
                alt={`${item.title} cover`}
                ratio="auto"
                className="!rounded-none"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="pf-meta">{collectionName}</p>
              <h1
                className="pf-display mt-1 text-[1.375rem] leading-tight text-[var(--pf-text-strong)] sm:text-2xl"
                data-testid="review-page-title"
              >
                {item.title}
              </h1>
              {item.byline && (
                <p className="pf-body mt-1 text-[14px] text-[var(--pf-text-muted)]">
                  {item.byline}
                </p>
              )}
              <p className="pf-meta mt-1.5">
                {[item.year, providerLabel].filter(Boolean).join(" · ")}
              </p>
              {item.myRating !== undefined && (
                <div className="mt-3">
                  <RatingBadge value={item.myRating} size="md" withLabel />
                </div>
              )}
            </div>
          </header>

          <div className="p-5 sm:p-6">
            <p className="pf-meta">Reviewed by @{username}</p>
            {item.myReviewTitle && (
              <h2
                className="pf-display mt-1.5 text-xl text-[var(--pf-text-strong)]"
                data-testid="review-page-headline"
              >
                {item.myReviewTitle}
              </h2>
            )}
            {item.myReview ? (
              item.myReviewSpoiler ? (
                <details
                  className="mt-4 rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface-2)] p-4"
                  data-testid="review-page-spoiler"
                >
                  <summary className="pf-body cursor-pointer text-[14px] font-medium text-[var(--pf-text-strong)]">
                    Contains spoilers — click to reveal
                  </summary>
                  <p className="pf-body mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[color:var(--pf-text)]">
                    {item.myReview}
                  </p>
                </details>
              ) : (
                <p
                  className="pf-body mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[color:var(--pf-text)]"
                  data-testid="review-page-body"
                >
                  {item.myReview}
                </p>
              )
            ) : (
              <p className="pf-body mt-4 text-[14px] text-[var(--pf-text-muted)]">
                No written notes for this item — only a rating.
              </p>
            )}

            {item.myReviewUpdatedAt && (
              <p className="pf-meta mt-6">Last edited {formatDate(item.myReviewUpdatedAt)}</p>
            )}

            {/* Honest limitation notice — Phase 4 §11. */}
            <p
              className="pf-meta mt-6 rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface-2)] p-3"
              data-testid="review-local-only-notice"
            >
              Prototype note: this review is stored in your own browser draft only. It is
              not published to a shared database, and no other visitor or device can see it
              until PRSME ships authentication and server-side persistence.
            </p>

            {item.externalUrl && (
              <p className="pf-meta mt-3">
                Catalogue entry:{" "}
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2"
                >
                  {providerLabel ?? "source"}
                </a>
              </p>
            )}
          </div>
        </article>
      </main>
      <SiteFooter />
    </ThemeScope>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}