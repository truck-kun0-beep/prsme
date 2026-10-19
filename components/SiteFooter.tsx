import { Wordmark } from "./Wordmark";

const groups = [
  {
    label: "Product",
    links: [
      { href: "#discover", label: "Discover" },
      { href: "#themes", label: "Themes" },
      { href: "#taste", label: "Taste & reviews" },
      { href: "#share", label: "Share" },
      { href: "#clicks", label: "My Clicks" },
    ],
  },
  {
    label: "Company",
    links: [
      { href: "#about", label: "About" },
      { href: "#manifesto", label: "Manifesto" },
      { href: "#press", label: "Press kit" },
      { href: "#careers", label: "Careers" },
    ],
  },
  {
    label: "Resources",
    links: [
      { href: "#help", label: "Help center" },
      { href: "#changelog", label: "Changelog" },
      { href: "#brand", label: "Brand assets" },
      { href: "#status", label: "Status" },
    ],
  },
  {
    label: "Legal",
    links: [
      { href: "#terms", label: "Terms" },
      { href: "#privacy", label: "Privacy" },
      { href: "#cookies", label: "Cookies" },
      { href: "#licenses", label: "Licenses" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="container-page pb-12 pt-4">
      <div className="hairline mb-10" />
      <div className="grid gap-10 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-5">
          <Wordmark size="sm" asLink={false} />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-300">
            PRSME is an independent design-led identity platform. Phase 1 ships
            the landing experience and design system. Profile authoring arrives
            next.
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted-500">
            Phase 1 · landing & design system
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:col-span-7"
        >
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-400">
                {g.label}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="text-[13px] text-muted-200 transition-colors hover:text-muted-50"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-6 text-[12px] text-muted-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} PRSME Labs. All things that make you,
          you — fictional previews shown.
        </p>
        <p className="font-mono text-muted-500">
          v0.1.0 · phase 1
        </p>
      </div>
    </footer>
  );
}