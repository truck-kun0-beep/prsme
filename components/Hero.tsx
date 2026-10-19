import { Button } from "./Button";
import { ProfilePreview } from "./ProfilePreview";
import { Reveal } from "./Reveal";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden vignette grain"
      aria-labelledby="hero-title"
    >
      <div className="container-page relative z-10 pb-20 pt-14 md:pb-28 md:pt-24 lg:pb-32 lg:pt-28">
        <div className="grid grid-cols-1 items-center gap-10 md:gap-14 lg:grid-cols-12 lg:gap-16">
          {/* Copy */}
          <div className="min-w-0 lg:col-span-7">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-ink-800/60 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-200">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-iris-300 animate-iris-pulse"
                />
                PRSME · Phase 1 preview
              </span>
            </Reveal>
            <Reveal delay={120}>
              <h1
                id="hero-title"
                className="mt-6 font-display text-display-xl text-muted-50"
              >
                All the things that make you,{" "}
                <span className="italic text-prismatic">you</span>.
              </h1>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-200 md:text-lg">
                PRSME is a profile you actually want to share — built from your
                taste in film, music, books, photography, and the small things
                that quietly make you, you.
              </p>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button href="#signup" size="lg">
                  Create your profile
                </Button>
                <Button href="#discover" variant="secondary" size="lg">
                  Explore the experience
                </Button>
              </div>
            </Reveal>
            <Reveal delay={420}>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-l border-[var(--line-soft)] pl-6">
                {[
                  ["Themes", "12+" , "designed by artists"],
                  ["Collections", "Unlimited", "yours to curate"],
                  ["Your link", "1 of 1", "distinctly yours"],
                ].map(([label, value, hint]) => (
                  <div key={label}>
                    <dt className="text-[10px] uppercase tracking-[0.22em] text-muted-400">
                      {label}
                    </dt>
                    <dd className="mt-1 font-display text-xl text-muted-50">
                      {value}
                    </dd>
                    <dd className="text-[11px] text-muted-400">{hint}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Profile preview */}
          <div className="min-w-0 lg:col-span-5">
            <Reveal delay={200} className="relative">
              {/* Decorative chrome behind the card */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-3 -z-10 rounded-[24px] bg-gradient-to-br from-iris-700/30 via-transparent to-transparent blur-2xl"
              />
              <div className="mx-auto w-full max-w-[420px]">
                <ProfilePreview />
              </div>
              {/* Floating capsule annotation */}
              <div className="pointer-events-none absolute -left-3 top-20 hidden items-center gap-2 rounded-full border border-[var(--line-soft)] bg-ink-900/80 px-3 py-1.5 text-[11px] text-muted-200 backdrop-blur md:flex">
                <span aria-hidden>●</span> Live theme — Iris After Dark
              </div>
              <div className="pointer-events-none absolute -right-2 bottom-16 hidden items-center gap-2 rounded-full border border-[var(--line-soft)] bg-ink-900/80 px-3 py-1.5 text-[11px] text-muted-200 backdrop-blur md:flex">
                prsme.app/<span className="text-muted-50">noor.k</span>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="container-page">
        <div className="hairline" />
      </div>
    </section>
  );
}