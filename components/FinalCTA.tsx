import { Reveal } from "./Reveal";
import { PrismSymbol } from "./Wordmark";
import { CtaForm } from "./CtaForm";

export function FinalCTA() {
  return (
    <section
      aria-labelledby="cta-title"
      className="container-page py-24 md:py-32"
    >
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-ink-900 px-6 py-14 text-center md:px-12 md:py-20">
          {/* Background glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, rgba(140,108,255,0.18), transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(140,108,255,0.6), transparent)",
            }}
          />
          <div className="relative">
            <span className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-ink-800/60 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-200">
              <PrismSymbol className="h-4 w-4" aria-hidden />
              Join the first wave
            </span>
            <h2
              id="cta-title"
              className="mt-5 font-display text-display-lg text-muted-50"
            >
              Build the version of you that only you can build.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-200">
              PRSME opens in waves. Drop your email and we&apos;ll send your invite
              when a new cohort opens. No noise, no newsletter.
            </p>
            <CtaForm />
            <p className="mt-4 text-[12px] text-muted-500">
              This form is a Phase 1 placeholder. Submission is wired to a no-op
              handler for now — we&apos;ll hook up the real flow in a later phase.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}