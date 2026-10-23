"use client";

/**
 * PublicProfileContent — the single source of truth for the public profile.
 *
 * Both `/u/[username]` (via `PublicProfileOverride`) and the studio's
 * `/studio/preview` iframe render this exact component with the same typed
 * data, so a save → reload cycle can never produce UI drift between the
 * editor and the public page.
 *
 * Everything here consumes the profile-scoped `--pf-*` tokens (see
 * `lib/profileTheme.ts`) rather than hardcoded Tailwind palette classes. That
 * is what makes theme, typography, and global-layout switching visibly
 * change the whole page instead of only its background.
 *
 * Section ordering is driven by `draft.sectionOrder` and visibility by
 * `draft.sectionVisibility`. Hidden sections produce no empty gaps.
 */

import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileSoundtrack } from "@/components/ProfileSoundtrack";
import { Reveal } from "@/components/Reveal";
import { CollectionBlock } from "@/components/CollectionCards";
import { ActivityList } from "@/components/ActivityList";
import { MyClicksGallery } from "@/components/MyClicksGallery";
import { ProfileCustomLinks, CustomLinksSectionHeader } from "@/components/ProfileCustomLinks";
import { ProfileReviews } from "@/components/ProfileReviews";
import type { Review } from "@/lib/supabase/reviews";
import type { ProfileOwner, ProfileCollection } from "@/lib/noirProfile";
import { noirProfile } from "@/lib/noirProfile";
import {
  DEFAULT_SECTION_ORDER,
  SECTION_LABELS,
  type SectionId,
  type ProfileDraft,
} from "@/lib/profileDraft";
import { materializeCollections, buildDemoCollectionLookup } from "@/lib/effectiveProfile";

interface PublicProfileContentProps {
  owner: ProfileOwner;
  /**
   * If provided, used to drive section visibility + ordering + per-section
   * defaults (collections layout, description, visibility flag) without
   * mutating the owner's intrinsic identity.
   */
  draft?: ProfileDraft | null;
  /** When true, only the visible sections are rendered (no hidden gaps). */
  respectSectionVisibility?: boolean;
  /**
   * Phase 6 — the owner's published reviews, read from the shared
   * `media_reviews` table.
   *
   * Optional, because two surfaces render this component and only one of
   * them has database-backed reviews: the demo `/u/noir` and the Studio
   * preview render it from local data, while a registered profile renders it
   * from the database. When the array is absent or empty, the reviews section
   * renders NOTHING — no heading, no empty state, no gap in the page.
   */
  reviews?: Review[];
}

export function PublicProfileContent({
  owner,
  draft = null,
  respectSectionVisibility = true,
  reviews = [],
}: PublicProfileContentProps) {
  const visibleSections: Set<SectionId> =
    respectSectionVisibility && draft
      ? new Set(
          (Object.entries(draft.sectionVisibility) as Array<[SectionId, boolean]>)
            .filter(([, on]) => Boolean(on))
            .map(([id]) => id),
        )
      : new Set<SectionId>(DEFAULT_SECTION_ORDER);
  const order: SectionId[] =
    respectSectionVisibility && draft
      ? draft.sectionOrder
      : DEFAULT_SECTION_ORDER;

  /*
   * Collections. `owner` already carries materialized demo item content (see
   * `buildEffectiveOwner`), and `materializeCollections` re-attaches the same
   * pristine demo items by stable collection id — so a saved customization can
   * rename, reorder, re-layout, or re-scope a collection without ever emptying
   * its shelf. Collections whose id is not in the demo (studio-created) keep
   * whatever items they carry, which is currently none by design.
   */
  const collections: ProfileCollection[] = draft
    ? materializeCollections(draft, buildDemoCollectionLookup(noirProfile)).filter(
        (c) => Boolean(c.name?.trim()),
      )
    : owner.collections;

  const firstName = owner.displayName.split(" ")[0];

  return (
    <div className="pf-document">
      <SiteNav />
      <main id="main" className="pb-16">
        <ProfileHeader owner={owner} />

        {order.map((id) => {
          if (!visibleSections.has(id)) return null;

          if (id === "soundtrack") {
            // No soundtrack configured → omit the surface entirely. No
            // empty panel. (Phase 2.5: there are no fake controls.)
            const soundtrack = draft?.soundtrack ?? owner.soundtrack;
            if (!soundtrack?.trackUrl) return null;
            return (
              <section
                aria-label={SECTION_LABELS[id]}
                key={id}
                className="profile-canvas mt-8 md:mt-10"
                data-testid="soundtrack-section"
              >
                <Reveal>
                  <ProfileSoundtrack soundtrack={soundtrack} />
                </Reveal>
              </section>
            );
          }

          if (id === "collections") {
            return (
              <section
                aria-labelledby="collections-heading"
                key={id}
                className="profile-canvas pf-section"
                data-testid="collections-section"
              >
                <Reveal>
                  <header className="mb-7 md:mb-9">
                    <p className="pf-eyebrow">Curated shelves</p>
                    <h2
                      id="collections-heading"
                      className="pf-display mt-2.5 text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]"
                    >
                      What {firstName} collects.
                    </h2>
                  </header>
                </Reveal>

                {collections.length === 0 ? (
                  <div className="pf-empty">
                    <p className="pf-body text-[14px]">
                      No collections yet. Add one in the customization studio.
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex flex-col"
                    style={{ gap: "var(--pf-section-gap)" }}
                  >
                    {collections.map((collection) => (
                      <article
                        key={collection.id}
                        aria-labelledby={`col-${collection.id}`}
                        data-collection-layout={collection.layout}
                        data-collection-id={collection.id}
                      >
                        <Reveal>
                          <CollectionHeader collection={collection} />
                        </Reveal>
                        <Reveal delay={120}>
                          <CollectionBlock collection={collection} />
                        </Reveal>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          }

          if (id === "activity") {
            return (
              <section
                aria-labelledby="activity-heading"
                key={id}
                className="profile-canvas pf-section"
                data-testid="activity-section"
              >
                <Reveal>
                  <header className="mb-6 md:mb-7">
                    <p className="pf-eyebrow">Recently</p>
                    <h2
                      id="activity-heading"
                      className="pf-display mt-2.5 text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]"
                    >
                      What&apos;s been on the shelf.
                    </h2>
                    <p className="pf-body mt-2 max-w-2xl text-[14px] text-[var(--pf-text-muted)]">
                      A short ledger of small movements — not a stream, not a feed.
                    </p>
                  </header>
                </Reveal>
                <Reveal delay={120}>
                  <ActivityList entries={owner.recent} />
                </Reveal>
              </section>
            );
          }

          /*
           * Phase 4.6 — Custom Link Buttons are their own section, between the
           * collections and the activity ledger.
           *
           * In Phase 4.5 this markup lived *inside* the `clicks` section,
           * immediately above the gallery. That is the whole of the reported
           * problem: the buttons inherited My Clicks' heading, spacing and
           * position, so they read as part of the gallery instead of as a
           * profile section in their own right.
           *
           * `ProfileCustomLinks` returns `null` when nothing is renderable, but
           * the guard below matters more: returning early means an owner with no
           * valid buttons gets no `<section>` at all, so there is no heading, no
           * border, and — critically — no `.pf-section` padding leaving a blank
           * gap where the buttons would have been.
           */
          if (id === "reviews") {
            /*
             * The reviews section is driven by the DATABASE, not by the
             * section-order list — but it still honours the owner's choice
             * about whether to show it.
             *
             * `ProfileReviews` returns `null` when there is nothing to show,
             * so an owner with no published reviews gets no heading and no
             * gap — just the profile they had.
             */
            if (respectSectionVisibility && draft && !draft.sectionVisibility.reviews) {
              return null;
            }
            return <ProfileReviews key="reviews" reviews={reviews} />;
          }

          if (id === "links") {
            const links = owner.customLinks;
            if (!links || links.length === 0) return null;
            return (
              <section
                aria-labelledby="links-heading"
                key={id}
                className="profile-canvas pf-section"
                data-testid="links-section"
              >
                {/*
                 * Phase 4.7 — the eyebrow / heading / description were hardcoded
                 * literals in this file until now. They are owner data, rendered
                 * by the same component the studio preview uses, so the two can
                 * never disagree.
                 *
                 * The heading is NOT derived from `firstName`. "Where to find
                 * Noir." was only ever the demo's default copy; the owner types
                 * whatever they want, including a heading with no relationship to
                 * their display name.
                 *
                 * The `<header>` is wrapped in `Reveal` only when there is copy to
                 * show — `CustomLinksSectionHeader` returns `null` for an
                 * all-blank section, and a `Reveal` around a `null` would leave an
                 * empty `.reveal` div contributing its own height.
                 */}
                {owner.customLinksSection?.eyebrow ||
                owner.customLinksSection?.heading ||
                owner.customLinksSection?.description ? (
                  <Reveal>
                    <CustomLinksSectionHeader copy={owner.customLinksSection} />
                  </Reveal>
                ) : null}
                <Reveal delay={120}>
                  <ProfileCustomLinks links={links} />
                </Reveal>
              </section>
            );
          }

          if (id === "clicks") {
            return (
              <section
                aria-labelledby="clicks-heading"
                key={id}
                className="profile-canvas pf-section"
                data-testid="clicks-section"
              >
                <Reveal>
                  <header className="mb-7 md:mb-9">
                    <p className="pf-eyebrow">My Clicks</p>
                    <h2
                      id="clicks-heading"
                      className="pf-display mt-2.5 text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]"
                    >
                      Moments captured through the lens.
                    </h2>
                    <p className="pf-body mt-2 max-w-2xl text-[14px] text-[var(--pf-text-muted)]">
                      Concept artwork for a future PRSME surface — a personal
                      photography shelf, never algorithmic.
                    </p>
                  </header>
                </Reveal>
                <Reveal delay={120}>
                  <MyClicksGallery photos={owner.clicks} />
                </Reveal>
              </section>
            );
          }

          return null;
        })}

        {respectSectionVisibility && draft && draft.visibility === "private" && (
          <DemoPrivateBanner displayName={owner.displayName} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Collection heading. The name + description keep the full width, and the
 * item-count metadata sits *below* on narrow screens instead of squeezing
 * the heading into a narrow column (Phase 3 defect #7).
 */
function CollectionHeader({ collection }: { collection: ProfileCollection }) {
  return (
    <header className="mb-4 md:mb-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h3
          id={`col-${collection.id}`}
          className="pf-display min-w-0 text-[1.35rem] md:text-[1.65rem] leading-tight"
        >
          {collection.name}
        </h3>
        {/*
         * Phase 4.7 — the item count only.
         *
         * This line used to read "4 items · public". The visibility word was
         * leaking owner-facing chrome into the public profile: a visitor cannot
         * act on it, and on a collection that *is* public it is stating the
         * obvious. Per-collection visibility is still editable in the studio's
         * Collections panel, where it belongs — it just no longer prints itself
         * on the card.
         */}
        <span className="pf-collection-meta shrink-0">
          {collection.items.length}{" "}
          {collection.items.length === 1 ? "item" : "items"}
        </span>
      </div>
      {collection.description && (
        <p className="pf-body mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[var(--pf-text-muted)]">
          {collection.description}
        </p>
      )}
    </header>
  );
}

function DemoPrivateBanner({ displayName }: { displayName: string }) {
  return (
    <aside
      role="status"
      aria-live="polite"
      className="profile-canvas mt-10 mb-4"
    >
      <div className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface-2)] px-5 py-4">
        <p className="pf-eyebrow">Local preview only</p>
        <p className="pf-body mt-2 text-[13px] leading-relaxed text-[var(--pf-text-muted)]">
          {displayName}&apos;s profile is shown as a private-style preview here for
          the customization studio demo. Real private-profile enforcement requires
          an authenticated backend.
        </p>
      </div>
    </aside>
  );
}