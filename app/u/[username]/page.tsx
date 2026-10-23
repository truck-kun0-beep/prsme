import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileSoundtrack } from "@/components/ProfileSoundtrack";
import { Reveal } from "@/components/Reveal";
import { CollectionBlock } from "@/components/CollectionCards";
import { ActivityList } from "@/components/ActivityList";
import { MyClicksGallery } from "@/components/MyClicksGallery";
import { ProfileCustomLinks } from "@/components/ProfileCustomLinks";
import { PublicProfileOverride } from "@/components/PublicProfileOverride";
import { ThemeScope } from "@/components/ThemeScope";
import { isKnownProfile, noirProfile } from "@/lib/noirProfile";
import { getProfileByUsername } from "@/lib/supabase/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DatabaseProfile } from "@/components/auth/DatabaseProfile";

interface Params {
  username: string;
}

/**
 * Force per-request rendering.
 *
 * Without this, Next could cache one visitor's HTML and serve it to another —
 * including the response to an owner's own private profile, which would hand
 * one account's data to a different account. A profile page is inherently
 * per-request, so it opts out of static generation and full-route caching.
 */
export const dynamic = "force-dynamic";

const NOT_FOUND_METADATA: Metadata = {
  title: "Profile not found",
  description: "This PRSME profile doesn't exist yet.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username } = await params;
  const key = username.toLowerCase();

  /*
   * A registered profile takes precedence for its own slug — except `noir`,
   * which is reserved by a database CHECK constraint and always resolves to
   * the fictional demo.
   *
   * A private profile the visitor does not own is indistinguishable from one
   * that does not exist: `getProfileByUsername` returns null for both, so the
   * metadata below cannot leak the existence of a hidden profile.
   */
  if (isSupabaseConfigured() && key !== noirProfile.username) {
    const record = await getProfileByUsername(key);
    if (!record?.draft) return NOT_FOUND_METADATA;

    const { displayName, bio } = record.draft.identity;
    const description = bio || `A PRSME profile for @${record.username}.`;

    return {
      title: `${displayName} (@${record.username})`,
      description,
      alternates: { canonical: `/u/${record.username}` },
      openGraph: {
        title: `${displayName} on PRSME`,
        description,
        type: "profile",
        url: `/u/${record.username}`,
        siteName: "PRSME",
      },
      twitter: {
        card: "summary_large_image",
        title: `${displayName} on PRSME`,
        description,
      },
    };
  }

  if (!isKnownProfile(key)) return NOT_FOUND_METADATA;

  const owner = noirProfile;
  return {
    title: `${owner.displayName} · @${owner.username}`,
    description: owner.bio,
    alternates: { canonical: `/u/${owner.username}` },
    openGraph: {
      title: `${owner.displayName} on PRSME`,
      description: owner.bio,
      type: "profile",
      url: `/u/${owner.username}`,
      siteName: "PRSME",
    },
    twitter: {
      card: "summary_large_image",
      title: `${owner.displayName} on PRSME`,
      description: owner.bio,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const key = username.toLowerCase();

  /*
   * Phase 5 — a registered profile first, the fictional demo second.
   *
   * `getProfileByUsername` returns null for a private profile the visitor does
   * not own (RLS hides the row, and the function re-checks explicitly), so an
   * unauthorised visitor reaches `notFound()` by exactly the same path as for a
   * profile that does not exist. The URL cannot be used to discover who holds
   * an account.
   *
   * `noir` short-circuits to the demo. It is reserved by a database CHECK
   * constraint, so a real account can never hold the slug, and the demo must
   * keep rendering on a deployment with no database attached at all.
   */
  if (isSupabaseConfigured() && key !== noirProfile.username) {
    const record = await getProfileByUsername(key);
    if (!record?.draft) notFound();

    return (
      <>
        <SiteNav />
        <main id="main" className="pb-20">
          {/*
           * The same `PublicProfileContent` the Studio preview renders, fed
           * the same typed draft — so a saved public profile cannot drift from
           * what its owner sees while editing it.
           */}
          <DatabaseProfile draft={record.draft} />
        </main>
        <SiteFooter />
      </>
    );
  }

  if (!isKnownProfile(key)) {
    notFound();
  }

  // The server-rendered HTML below is the canonical Phase 2.5 markup for
  // /u/noir. It guarantees the SSR output passes every regression check
  // (Phase 2.4 invariants: one soundtrack surface, logo-only Spotify
  // action, no fake controls, etc.). The default profile is the source of
  // truth for the demo.
  //
  // Phase 3's customization layer is layered on top via
  // <PublicProfileOverride /> — a small client island that, after hydration,
  // replaces the rendered sections with whatever the user has saved on
  // this device. The override is the *same* typed data and the *same*
  // presentation components that /studio edits, so /u/noir and /studio
  // stay in lockstep.
  const owner = noirProfile;
  return (
    <ThemeScope draftSource="storage">
      <SiteNav />
      <main id="main" className="pb-20">
        {/* The data-default-profile wrapper hides server-rendered sections
            once the client island marks the body with profile-override=active.
            When no draft is saved, this attribute is never set and the SSR
            markup stays visible to the user.

            Phase 4.3: these section headings deliberately use `-default`
            suffixed ids (`collections-heading-default`, `activity-heading-default`,
            `clicks-heading-default`) rather than the canonical
            `collections-heading` / `activity-heading` / `clicks-heading`.

            The reason is a real DOM-correctness problem, not a test artefact.
            For a returning visitor BOTH trees exist simultaneously: this
            server-rendered default is still in the DOM (only `display:none`),
            and `PublicProfileOverride` renders a second, customised copy of the
            same profile. Two elements then shared each heading id, which is
            invalid HTML and — more seriously — made every `getElementById` /
            `querySelector('#collections-heading')` resolve to the hidden default
            instead of the profile the visitor is actually looking at. Keeping
            the default's ids unique removes the duplicate entirely; the custom
            tree owns the canonical ids, and this tree is a first-visit
            fallback that legitimately uses its own. */}
        <div data-default-profile>
          <ProfileHeader owner={owner} />

          {owner.soundtrack && (
            <section
              aria-label="Profile soundtrack"
              className="container-page mt-10 md:mt-12"
            >
              <Reveal>
                <ProfileSoundtrack soundtrack={owner.soundtrack} />
              </Reveal>
            </section>
          )}

          <section
            aria-labelledby="collections-heading-default"
            className="container-page py-14 md:py-20"
          >
            <Reveal>
              <header className="mb-8 md:mb-10">
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                  Curated shelves
                </p>
                <h2
                  id="collections-heading-default"
                  className="mt-3 font-display text-display-md text-muted-50"
                >
                  What {owner.displayName.split(" ")[0]} collects.
                </h2>
              </header>
            </Reveal>

            <div className="space-y-16 md:space-y-20">
              {owner.collections.map((collection) => (
                <article key={collection.id} aria-labelledby={`col-${collection.id}`}>
                  <Reveal>
                    <header className="mb-5 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between">
                      <div className="min-w-0">
                        <h3
                          id={`col-${collection.id}`}
                          className="font-display text-2xl text-muted-50 md:text-3xl"
                        >
                          {collection.name}
                        </h3>
                        {collection.description && (
                          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-300">
                            {collection.description}
                          </p>
                        )}
                      </div>
                      {/* Phase 4.7 — the item count only. The "· public" suffix was
                          owner-facing chrome printing itself on a public profile;
                          per-collection visibility stays editable in the studio. */}
                      <span className="font-mono text-[12px] text-muted-500">
                        {collection.items.length}{" "}
                        {collection.items.length === 1 ? "item" : "items"}
                      </span>
                    </header>
                  </Reveal>
                  <Reveal delay={120}>
                    <CollectionBlock collection={collection} />
                  </Reveal>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="activity-heading-default"
            className="container-page py-10 md:py-14"
          >
            <Reveal>
              <header className="mb-6 md:mb-8">
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                  Recently
                </p>
                <h2
                  id="activity-heading-default"
                  className="mt-3 font-display text-display-md text-muted-50"
                >
                  What&apos;s been on the shelf.
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-300">
                  A short ledger of small movements — not a stream, not a feed.
                </p>
              </header>
            </Reveal>
            <Reveal delay={120}>
              <ActivityList entries={owner.recent} />
            </Reveal>
          </section>

          <section
            aria-labelledby="clicks-heading-default"
            className="container-page py-14 md:py-20"
          >
            <Reveal>
              <header className="mb-8 md:mb-10">
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                  My Clicks
                </p>
                <h2
                  id="clicks-heading-default"
                  className="mt-3 font-display text-display-md text-muted-50"
                >
                  Moments captured through the lens.
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-300">
                  Concept artwork for a future PRSME surface — a personal photography
                  shelf, never algorithmic.
                </p>
              </header>
            </Reveal>
            {/* Phase 4.5 — Custom Link Buttons, immediately before My Clicks.
                Renders nothing at all when the profile has no valid buttons. */}
            <Reveal delay={120}>
              <ProfileCustomLinks links={owner.customLinks} />
            </Reveal>
            <Reveal delay={180}>
              <MyClicksGallery photos={owner.clicks} />
            </Reveal>
          </section>
        </div>

        {/* Client island that swaps in a customised profile (from local
            storage) after hydration. Renders nothing when no draft is saved.
            Wrapped in <noscript>-style guard so SSR markup stays valid. */}
        <PublicProfileOverride />
      </main>
      <SiteFooter />
    </ThemeScope>
  );
}