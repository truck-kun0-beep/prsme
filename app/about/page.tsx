import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/Button";

export const metadata: Metadata = {
  title: "About",
  description:
    "PRSME is a place to express who you are through the films, series, records, manga, and books you care about — with your own ratings, reviews, and a profile that looks like you.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About PRSME",
    description:
      "Your taste, your collections, your reviews — expressed as a page that looks like you.",
    url: "/about",
    siteName: "PRSME",
  },
};

/**
 * The About page.
 *
 * Concise, and honest about what PRSME actually is. In particular it makes
 * NO claims about user counts, review volumes, media coverage, partnerships,
 * or integrations — none of those are verified, and an About page that
 * invents them is worse than one that says what is true.
 *
 * The artwork section is explicit that covers and catalogue details come
 * from external providers and stay on their servers. PRSME stores a
 * reference, never a copy.
 */
export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        {/* ---- Hero ---- */}
        <section className="container-page pt-12 md:pt-20">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              About PRSME
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] text-[var(--text-strong)] md:text-6xl">
              The things you love are already a language.
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--text-muted)]">
              PRSME gives that language a home. Build a profile around the
              films, series, records, manga, and books that shaped you — rate
              them, write about them, and arrange them the way you actually
              think about them.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="/sign-up" size="lg">
                Create your profile
              </Button>
              <Button href="/discover" variant="secondary" size="lg">
                Explore reviews
              </Button>
            </div>
          </Reveal>
        </section>

        {/* ---- What it is ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="grid gap-10 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                  What PRSME is
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl">
                  A profile that is also a point of view.
                </h2>
              </div>
              <div className="space-y-5 md:col-span-7">
                <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                  Most places let you list what you have watched. PRSME is
                  built around the idea that the <em>how</em> matters as much
                  as the what: which shelf a film lives on, whether it belongs
                  beside the album you were listening to that week, how you
                  scored it out of ten, and what you actually want to say
                  about it.
                </p>
                <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                  So a PRSME profile is a designed page you arrange yourself —
                  typography, colour, layout, section order, the works — and
                  the content behind it is genuinely yours: real ratings, real
                  reviews written in your own words.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---- How it works ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              How it works
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl">
              Three things, done properly.
            </h2>

            <div className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
              <article className="surface-card p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  01
                </span>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  Collections
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  Group what you love into shelves, then choose how each one
                  reads — a poster rail, a featured pick, a dense list, a
                  review journal, a wall, an album grid. Your shelves are
                  yours; nothing is sorted behind your back.
                </p>
              </article>

              <article className="surface-card p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  02
                </span>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  Ratings &amp; reviews
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  Score anything on your own 0–10 scale — never an outside
                  score — and write longer notes when you have something to
                  say. Save a draft while you are thinking, and publish only
                  when it is ready.
                </p>
              </article>

              <article className="surface-card p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  03
                </span>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  Discover
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  Every published review lands in one shared catalogue, so the
                  same film collects every opinion written about it. Browse
                  by category, search the catalogue, and read what other
                  people actually said.
                </p>
              </article>
            </div>
          </Reveal>
        </section>

        {/* ---- Privacy ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="surface-card p-6 md:p-10">
              <div className="grid gap-8 md:grid-cols-12 md:gap-12">
                <div className="md:col-span-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                    Visibility
                  </p>
                  <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--text-strong)]">
                    You decide who reads what.
                  </h2>
                </div>
                <div className="space-y-5 md:col-span-7">
                  <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                    Every profile starts private. When you publish, your
                    reviews become part of the shared catalogue — and they
                    follow your profile&apos;s visibility from that moment on.
                  </p>
                  <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                    If you make your profile private again, your published
                    reviews stop appearing in Discover and on media pages.
                    That is enforced in the database, not just hidden in the
                    interface: a private profile&apos;s reviews are not
                    returned to anyone else, and the counts on a media page
                    exclude them too.
                  </p>
                  <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                    Drafts are yours alone, always. Nobody else can edit or
                    remove a review you wrote.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---- Artwork & sources ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="grid gap-10 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
                  Artwork &amp; catalogue sources
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl">
                  We link to the art. We do not keep a copy.
                </h2>
              </div>
              <div className="space-y-5 md:col-span-7">
                <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                  Covers, descriptions, and catalogue details come from public
                  media catalogues — Cinemeta, TVMaze, TMDB, Apple Music,
                  MusicBrainz, MangaDex, Open Library, and Google Books, with
                  Wikimedia Commons used for some film artwork.
                </p>
                <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                  PRSME stores a link to that artwork and names whose it is.
                  The images themselves stay on the provider&apos;s servers and
                  are never copied into PRSME&apos;s own storage. The only
                  files PRSME hosts are profile avatars.
                </p>
                <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
                  Every media page links back to the original catalogue entry,
                  so you can always see the source yourself.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---- Closing ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="surface-card flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl leading-tight text-[var(--text-strong)]">
                  Start with one shelf.
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
                  You do not need a complete taste to start. Add the five
                  films you cannot stop recommending, rate them, and see what
                  the page looks like.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button href="/sign-up" size="lg">
                  Create your profile
                </Button>
                <Link
                  href="/u/noir"
                  className="inline-flex h-12 items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-6 text-[15px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
                >
                  See an example
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
