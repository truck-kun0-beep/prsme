import { Reveal } from "@/components/Reveal";
import { THEME_PRESETS } from "@/lib/theme";
import { PROFILE_TOKENS_BY_THEME } from "@/lib/profileTheme";
import { TYPOGRAPHY_LIST } from "@/lib/profileTheme";

/**
 * The curated themes showcase.
 *
 * PRE-PHASE 11 — this is the theme gallery that used to be its own page.
 * It moved into About at `/about#themes`, and the old `/themes` route
 * redirects here.
 *
 * ONE SOURCE OF TRUTH
 *
 * The colours come from `PROFILE_TOKENS_BY_THEME` — the exact token set the
 * Studio writes onto the profile scope and the public profile renders with.
 * There is no second, hand-written palette table anywhere in this component.
 * If a theme's tokens change, this gallery changes with them, and it can
 * never show a colour the profile would not actually paint.
 *
 * Viewing this page does NOT change the viewer's theme. The cards are static
 * previews; selecting one means going to the Studio. (The card is a link to
 * the Studio rather than a control, precisely so that a visitor who merely
 * looks at the showcase cannot accidentally overwrite their own settings.)
 */
export function ThemeShowcase() {
  return (
    <section
      id="themes"
      aria-labelledby="themes-heading"
      className="container-page mt-20 scroll-mt-24 md:mt-28"
      data-testid="about-themes"
    >
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
          Themes
        </p>
        <h2
          id="themes-heading"
          className="mt-3 max-w-2xl font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl"
        >
          Ten palettes, each with its own character.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Every preset is a complete design system — page background,
          elevated surfaces, card fills, four levels of text, an accent
          family, borders, hover and focus states, rating chips, tags, and the
          glass treatment used on the profile. Nothing is inherited from a
          default, so switching theme changes the whole page at once.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {THEME_PRESETS.map((preset, index) => {
          const tokens = PROFILE_TOKENS_BY_THEME[preset.id];

          return (
            <Reveal key={preset.id} delay={Math.min(index, 6) * 60}>
              <article
                className="h-full overflow-hidden rounded-xl border border-[var(--line-soft)]"
                style={{
                  // The card IS the theme: it paints with the preset's own
                  // tokens, so the preview is the real thing and not an
                  // approximation of it.
                  background: tokens["--pf-bg"],
                  ["--pf-bg" as string]: tokens["--pf-bg"],
                  ["--pf-surface-1" as string]: tokens["--pf-surface-1"],
                  ["--pf-surface-2" as string]: tokens["--pf-surface-2"],
                  ["--pf-surface-3" as string]: tokens["--pf-surface-3"],
                  ["--pf-text-strong" as string]: tokens["--pf-text-strong"],
                  ["--pf-text" as string]: tokens["--pf-text"],
                  ["--pf-text-muted" as string]: tokens["--pf-text-muted"],
                  ["--pf-text-faint" as string]: tokens["--pf-text-faint"],
                  ["--pf-border" as string]: tokens["--pf-border"],
                  ["--pf-border-strong" as string]: tokens["--pf-border-strong"],
                  ["--pf-accent" as string]: tokens["--pf-accent"],
                  ["--pf-accent-strong" as string]: tokens["--pf-accent-strong"],
                  ["--pf-accent-soft" as string]: tokens["--pf-accent-soft"],
                  ["--pf-rating" as string]: tokens["--pf-rating"],
                  ["--pf-rating-bg" as string]: tokens["--pf-rating-bg"],
                  ["--pf-rating-border" as string]: tokens["--pf-rating-border"],
                  ["--pf-tag-bg" as string]: tokens["--pf-tag-bg"],
                  ["--pf-tag-text" as string]: tokens["--pf-tag-text"],
                  ["--pf-tag-border" as string]: tokens["--pf-tag-border"],
                  ["--pf-meta" as string]: tokens["--pf-meta"],
                  ["--pf-glass-surface" as string]: tokens["--pf-glass-surface"],
                  ["--pf-glass-border" as string]: tokens["--pf-glass-border"],
                  ["--pf-glass-highlight" as string]: tokens["--pf-glass-highlight"],
                  ["--pf-glass-sheen" as string]: tokens["--pf-glass-sheen"],
                  ["--pf-glass-blur" as string]: tokens["--pf-glass-blur"],
                }}
                data-testid={`about-theme-${preset.id}`}
                data-theme-id={preset.id}
              >
                {/* A miniature of a profile header, painted in the theme. */}
                <div className="theme-card-surface relative px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-11 w-11 shrink-0 rounded-full"
                      style={{
                        background: `linear-gradient(140deg, ${tokens["--pf-accent"]}, ${tokens["--pf-surface-3"]})`,
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className="pf-display truncate text-[15px] font-semibold"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Noir Aldridge
                      </p>
                      <p
                        className="truncate text-[10px] uppercase"
                        style={{
                          color: tokens["--pf-text-faint"],
                          letterSpacing: "0.16em",
                        }}
                      >
                        @noir
                      </p>
                    </div>
                  </div>

                  {/* A rating chip and a tag, so the specialised tokens are
                      visible rather than merely declared. */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: tokens["--pf-rating-bg"],
                        border: `1px solid ${tokens["--pf-rating-border"]}`,
                        color: tokens["--pf-rating"],
                      }}
                    >
                      9.4
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: tokens["--pf-tag-bg"],
                        border: `1px solid ${tokens["--pf-tag-border"]}`,
                        color: tokens["--pf-tag-text"],
                      }}
                    >
                      slow cinema
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: tokens["--pf-tag-bg"],
                        border: `1px solid ${tokens["--pf-tag-border"]}`,
                        color: tokens["--pf-tag-text"],
                      }}
                    >
                      35mm
                    </span>
                  </div>

                  {/* A hairline rule, painted with the theme's own border. */}
                  <div
                    aria-hidden
                    className="mt-4 h-px w-full"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${tokens["--pf-border-strong"]}, transparent)`,
                    }}
                  />

                  <p
                    className="mt-3 text-[11px] leading-relaxed"
                    style={{ color: tokens["--pf-text-muted"] }}
                  >
                    {preset.description}
                  </p>
                </div>

                <div
                  className="border-t px-5 py-3"
                  style={{
                    borderTopColor: tokens["--pf-border"],
                    background: tokens["--pf-surface-1"],
                  }}
                >
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: tokens["--pf-text-strong"] }}
                  >
                    {preset.name}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: tokens["--pf-bg"] }}
                    />
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: tokens["--pf-surface-2"] }}
                    />
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: tokens["--pf-accent"] }}
                    />
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: tokens["--pf-accent-soft"] }}
                    />
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      {/* ---- Typography ---- */}
      <Reveal>
        <div className="mt-16 md:mt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
            Typography
          </p>
          <h3 className="mt-3 max-w-2xl font-display text-3xl leading-tight text-[var(--text-strong)]">
            Twelve voices, one page each.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Each preset assigns a real family to headings, body copy, and
            metadata separately, so the choice changes the shape of the page
            rather than just its label. Every family is loaded at build time
            through Next&apos;s font pipeline — no third-party stylesheet is
            requested at runtime.
          </p>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TYPOGRAPHY_LIST.map((preset, index) => (
          <Reveal key={preset.id} delay={Math.min(index, 6) * 60}>
            <div
              className="glass-surface h-full p-5"
              data-testid={`about-typography-${preset.id}`}
            >
              <p
                className="text-[19px] leading-tight text-[var(--text-strong)]"
                style={{ fontFamily: preset.display }}
              >
                Noir Aldridge
              </p>
              <p
                className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]"
                style={{ fontFamily: preset.body }}
              >
                Quiet films, slower series, late-night records.
              </p>
              <p
                className="mt-3 text-[10px] uppercase"
                style={{
                  fontFamily: preset.meta,
                  letterSpacing: "0.16em",
                  color: "var(--text-faint)",
                }}
              >
                Curated shelves
              </p>
              <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[13px] font-medium text-[var(--text-strong)]">
                {preset.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
                {preset.description}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="mt-8 text-[13px] text-[var(--text-faint)]">
          Themes and typography are set in the{" "}
          <a
            href="/studio"
            className="text-[var(--accent-300)] underline underline-offset-4"
          >
            Customization Studio
          </a>
          . Viewing this page does not change your own settings.
        </p>
      </Reveal>
    </section>
  );
}
