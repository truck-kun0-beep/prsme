import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/Button";

/**
 * The homepage.
 *
 * PRE-PHASE 11 — the homepage is now session-aware:
 *
 *   - a GUEST sees the About experience: what PRSME is, a prominent way to
 *     sign up or log in, and links onward to Discover and About. A visitor
 *     should understand the product before being asked for an account.
 *   - a SIGNED-IN visitor is sent to Discover, which is where their work is.
 *
 * WHY THE DECISION IS SERVER-SIDE
 *
 * The brief asks for no visible flash. A client-side check would render the
 * About landing page first and then swap it for Discover once the session
 * resolved — which is exactly the flash the brief rules out, and it would
 * also make the page's content depend on a client request that a bot or a
 * scraper never completes.
 *
 * So the session is read on the server, before anything is sent. The signed-in
 * visitor never receives the About markup at all, and there is nothing to
 * swap.
 *
 * NO REDIRECT LOOP
 *
 * The redirect target is `/discover`, which is a normal page — it does not
 * redirect back. And `/discover` itself is reachable directly, so a signed-in
 * visitor can always get there by typing the URL.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isSupabaseConfigured()) {
    const userId = await getCurrentUserId();
    if (userId) {
      redirect("/discover");
    }
  }

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        {/* ---- Hero ---- */}
        <section className="container-page pt-12 md:pt-20">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              Welcome to PRSME
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] text-[var(--text-strong)] md:text-6xl">
              All the things that make you,{" "}
              <span className="italic text-prismatic">you</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--text-muted)] md:text-[18px]">
              PRSME is a profile you actually want to share — built from your
              taste in film, music, books, photography, and the small things
              that quietly make you, you.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button href="/sign-up" size="lg">
                Create your profile
              </Button>
              <Button href="/sign-in" variant="secondary" size="lg">
                Sign in
              </Button>
              <Button href="/discover" variant="ghost" size="lg">
                Browse Discover
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

        {/* ---- The four pillars ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              How it works
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl">
              Four things, done properly.
            </h2>

            <div className="mt-10 grid gap-6 md:grid-cols-2 md:gap-8">
              <article className="glass-surface p-6">
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

              <article className="glass-surface p-6">
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

              <article className="glass-surface p-6">
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

              <article className="glass-surface p-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  04
                </span>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  My List
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  One personal queue for everything worth coming back to —
                  films and series to watch, books and manga to read, records
                  and songs to listen. It is private, it follows you across
                  devices, and it sorts itself into those three groups.
                </p>
              </article>
            </div>
          </Reveal>
        </section>

        {/* ---- Where to go next ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="grid gap-6 md:grid-cols-3 md:gap-8">
              <Link
                href="/discover"
                className="glass-surface block p-6 transition-colors hover:border-[var(--line-strong)]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-300)]">
                  Read
                </p>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  Discover
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  Films, series, records, manga, and books — rated and
                  reviewed by people who signed up to say what they thought.
                </p>
              </Link>

              <Link
                href="/about"
                className="glass-surface block p-6 transition-colors hover:border-[var(--line-strong)]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-300)]">
                  Understand
                </p>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  About PRSME
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  How profiles, collections, reviews, and your personal list
                  fit together — plus every theme and typography voice.
                </p>
              </Link>

              <Link
                href="/u/noir"
                className="glass-surface block p-6 transition-colors hover:border-[var(--line-strong)]"
                data-testid="home-example-profile"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-300)]">
                  Look
                </p>
                <h3 className="mt-3 font-display text-xl text-[var(--text-strong)]">
                  View Example Profile
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  A complete, working profile — collections, ratings, a
                  soundtrack, custom links, and My Clicks — with nothing
                  behind a sign-up wall.
                </p>
              </Link>
            </div>
          </Reveal>
        </section>

        {/* ---- Closing ---- */}
        <section className="container-page mt-20 md:mt-28">
          <Reveal>
            <div className="glass-surface flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
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
                <Button href="/sign-in" variant="secondary" size="lg">
                  Sign in
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
