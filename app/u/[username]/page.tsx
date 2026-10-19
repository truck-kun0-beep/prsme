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
import { isKnownProfile, noirProfile } from "@/lib/noirProfile";

interface Params {
  username: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username } = await params;
  if (username.toLowerCase() !== noirProfile.username) {
    return {
      title: "Profile not found",
      description: "This PRSME profile doesn't exist yet.",
    };
  }
  const owner = noirProfile;
  return {
    title: `${owner.displayName} · @${owner.username}`,
    description: owner.bio,
    alternates: {
      canonical: `/u/${owner.username}`,
    },
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
  if (!isKnownProfile(username)) {
    notFound();
  }
  const owner = noirProfile;

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
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
          aria-labelledby="collections-heading"
          className="container-page py-14 md:py-20"
        >
          <Reveal>
            <header className="mb-8 md:mb-10">
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                Curated shelves
              </p>
              <h2
                id="collections-heading"
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
                    <span className="font-mono text-[12px] text-muted-500">
                      {collection.items.length}{" "}
                      {collection.items.length === 1 ? "item" : "items"} · {collection.visibility}
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
          aria-labelledby="activity-heading"
          className="container-page py-10 md:py-14"
        >
          <Reveal>
            <header className="mb-6 md:mb-8">
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                Recently
              </p>
              <h2
                id="activity-heading"
                className="mt-3 font-display text-display-md text-muted-50"
              >
                What&apos;s been on the shelf.
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] text-muted-300">
                A short ledger of small movements — not a stream, not a feed.
              </p>
            </header>
          </Reveal>
          <Reveal delay={120}>
            <ActivityList entries={owner.recent} />
          </Reveal>
        </section>

        <section
          aria-labelledby="clicks-heading"
          className="container-page py-14 md:py-20"
        >
          <Reveal>
            <header className="mb-8 md:mb-10">
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
                My Clicks
              </p>
              <h2
                id="clicks-heading"
                className="mt-3 font-display text-display-md text-muted-50"
              >
                Moments captured through the lens.
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] text-muted-300">
                Concept artwork for a future PRSME surface — a personal photography
                shelf, never algorithmic.
              </p>
            </header>
          </Reveal>
          <Reveal delay={120}>
            <MyClicksGallery photos={owner.clicks} />
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
