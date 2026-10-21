import { Artwork } from "./Artwork";
import { ThemePicker } from "./ThemePicker";
import { ProfilePreview } from "./ProfilePreview";
import { Reveal } from "./Reveal";
import { demoCollections, demoReviews, demoRecentlyWatched, demoClicks } from "@/lib/demoProfile";

function SectionShell({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="container-page py-20 md:py-28"
    >
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-iris-300">
            {eyebrow}
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h2
            id={`${id}-title`}
            className="mt-3 font-display text-display-lg text-muted-50"
          >
            {title}
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-200">
            {intro}
          </p>
        </Reveal>
      </div>
      <div className="mt-12 md:mt-16">{children}</div>
    </section>
  );
}

/* ------------ 1. Your profile, your aesthetic ------------ */
export function AestheticSection() {
  return (
    <SectionShell
      id="themes"
      eyebrow="Themes & aesthetic"
      title="Your profile, your aesthetic."
      intro="Twelve-plus designed themes. Custom typography. Backgrounds that breathe. Animations that don't get in the way. PRSME feels like a magazine you produced yourself — never a template."
    >
      <Reveal>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <ul className="grid grid-cols-2 gap-3">
              {[
                { label: "Themes", value: "12 designed" },
                { label: "Typography", value: "Serif + sans" },
                { label: "Backgrounds", value: "Gradient · grain" },
                { label: "Motion", value: "Restraint always" },
              ].map((it) => (
                <li
                  key={it.label}
                  className="surface-card flex items-start justify-between gap-3 px-4 py-4"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-400">
                      {it.label}
                    </p>
                    <p className="mt-1 text-[15px] font-medium text-muted-50">
                      {it.value}
                    </p>
                  </div>
                  <span aria-hidden className="text-muted-500">
                    ◇
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] leading-relaxed text-muted-300">
              Every surface is tunable. Set the rules once — PRSME keeps the
              animations refined, the typography readable, and the contrast
              honest.
            </p>
          </div>
          <div>
            <ThemePicker />
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}

/* ------------ 2. Everything you're into ------------ */
export function CollectionsSection() {
  const kinds = [
    { key: "film", label: "Films", pal: "iris", note: "Editors' cuts & first watches" },
    { key: "show", label: "TV series", pal: "cyan", note: "Series from anywhere — dramas, docus, late-night" },
    { key: "music", label: "Music", pal: "amber", note: "Albums, EP, playlists, deep cuts" },
    { key: "manga", label: "Manga", pal: "violet", note: "Track volumes and ongoing series" },
    { key: "book", label: "Books", pal: "forest", note: "Margin notes for later you" },
  ] as const;

  return (
    <SectionShell
      id="discover"
      eyebrow="Collections"
      title="Everything you're into — catalogued."
      intro="Build collections that earn their place. PRSME helps you group films, TV series, albums, manga, and books into shelves that reflect how you actually experience them."
    >
      <Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map((k) => (
            <article
              key={k.key}
              className="surface-card group flex flex-col overflow-hidden transition-all duration-300 ease-soft hover:border-iris-400/40 hover:-translate-y-0.5"
            >
              <div className="relative h-40 overflow-hidden">
                <Artwork palette={k.pal} ratio="auto" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-transparent to-transparent" />
                <div className="absolute left-4 top-4">
                  <span className="rounded-full bg-ink-950/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-100 backdrop-blur">
                    {k.label}
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[15px] font-medium text-muted-50">
                  {demoCollections.find((c) => c.name.toLowerCase().includes(k.key.slice(0, 3)))?.name ??
                    `A shelf of ${k.label.toLowerCase()}`}
                </p>
                <p className="mt-1 text-[12px] text-muted-300">{k.note}</p>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--line-soft)] pt-3 text-[11px] text-muted-400">
                  <span>Open shelf →</span>
                  <span className="font-mono">{demoCollections[0]?.count ?? 0}+ items</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Reveal>
    </SectionShell>
  );
}

/* ------------ 3. Your taste, in your own words ------------ */
export function TasteSection() {
  return (
    <SectionShell
      id="taste"
      eyebrow="Taste & reviews"
      title="Your taste, in your own words."
      intro="A space for the things you actually want to write about — not a five-star grid. PRSME supports longer-form reviews, a recently-watched shelf, and personal ratings that feel like you."
    >
      <Reveal>
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Reviews */}
          <div className="min-w-0 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-400">
                Recent notes
              </h3>
              <span className="text-[11px] text-muted-500">Fictional samples</span>
            </div>
            <ul className="space-y-4">
              {demoReviews.map((r) => (
                <li
                  key={r.title}
                  className="surface-card p-5 transition-colors hover:border-iris-400/30"
                >
                  <div className="flex items-start gap-4">
                    <div className="hidden h-16 w-12 shrink-0 overflow-hidden rounded-md sm:block">
                      <Artwork palette={r.palette} ratio="auto" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-muted-50">{r.title}</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink-700/60 px-2 py-0.5 font-mono text-[11px] text-iris-300">
                          ★ {r.rating}/10
                        </span>
                      </div>
                      <p className="mt-2 text-[14px] leading-relaxed text-muted-200">
                        &ldquo;{r.excerpt}&rdquo;
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Recently */}
          <div className="min-w-0 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-400">
                Recently
              </h3>
              <span className="font-mono text-[11px] text-muted-500">
                {demoRecentlyWatched.length * 6}+ total
              </span>
            </div>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              {demoRecentlyWatched.map((i) => (
                <li key={i.id} className="min-w-0">
                  <Artwork
                    palette={i.palette}
                    ratio="2/3"
                    label={`${i.title} — ${i.kind}`}
                  />
                  <p className="mt-1.5 truncate text-[12px] text-muted-100">
                    {i.title}
                  </p>
                  {i.rating !== undefined && (
                    <p className="font-mono text-[11px] text-muted-400">
                      {i.rating.toFixed(1)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}

/* ------------ 4. Your world, shareable ------------ */
export function ShareSection() {
  return (
    <SectionShell
      id="share"
      eyebrow="Profile link"
      title="Your world, shareable."
      intro="Every profile gets one URL that's cleanly designed across devices. Share it on a text thread, an email signature, or a streamer bio — it lands as PRSME, not a third-party widget."
    >
      <Reveal>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="order-2 min-w-0 lg:order-1">
            <ProfilePreview />
          </div>
          <div className="order-1 min-w-0 space-y-6 lg:order-2">
            <ul className="space-y-4">
              {[
                {
                  head: "One URL per profile",
                  body: "Always-on. Clean, ad-free, fast across the world.",
                },
                {
                  head: "Open-graph, designed",
                  body: "Previews on iMessage, Discord, Slack and X feel of a piece with the profile itself.",
                },
                {
                  head: "Quiet share panel",
                  body: "Copy link, generate a card, or hand-pick a shelf to share first.",
                },
              ].map((it) => (
                <li
                  key={it.head}
                  className="grid grid-cols-[auto,1fr] items-start gap-4 rounded-lg border border-[var(--line-soft)] bg-ink-900/60 p-4"
                >
                  <span
                    aria-hidden
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-iris-300"
                  />
                  <div>
                    <p className="text-[15px] font-medium text-muted-50">
                      {it.head}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-300">
                      {it.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-ink-800/80 px-3 py-2.5">
              <span className="font-mono text-[12px] text-muted-300">
                prsme.app/
              </span>
              <span className="font-mono text-[13px] text-muted-50">noor.k</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-iris-400/15 px-2 py-1 text-[11px] text-iris-200">
                <span aria-hidden>🔗</span> available
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}

/* ------------ 5. My Clicks (preview only) ------------ */
export function ClicksSection() {
  return (
    <SectionShell
      id="clicks"
      eyebrow="Coming up"
      title="My Clicks — your photo memory."
      intro="A restrained preview of a future PRSME surface: a personal photography shelf pulling in only the work you choose to highlight. Editor-curated, never algorithmic. No integrations are live yet — what you see here is concept art."
    >
      <Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 md:grid-cols-12">
          {[...demoClicks, ...demoClicks.slice(0, 2)].map((c, idx) => {
            // vary column spans for an editorial mosaic feel — mobile uses 2-col grid (spans of 1), tablet 6-col (spans of 3), desktop 12-col (mixed spans)
            const layout = [
              "col-span-1 sm:col-span-6 md:col-span-8 row-span-2",
              "col-span-1 sm:col-span-3 md:col-span-4",
              "col-span-1 sm:col-span-3 md:col-span-4",
              "col-span-1 sm:col-span-3 md:col-span-4",
              "col-span-1 sm:col-span-3 md:col-span-4",
              "col-span-1 sm:col-span-3 md:col-span-7",
              "col-span-1 sm:col-span-3 md:col-span-5",
              "col-span-2 sm:col-span-6 md:col-span-12",
            ];
            const span = layout[idx % layout.length] ?? "col-span-1";
            const tall = idx === 0 || idx === 7;
            return (
              <div key={`${c.id}-${idx}`} className={span}>
                <Artwork
                  palette={c.palette}
                  ratio={tall ? "4/5" : "3/4"}
                  className="transition-transform duration-500 ease-soft hover:scale-[1.01]"
                  label={`${c.title} — sample`}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[12px] text-muted-500">
          Concept artwork only — My Clicks is not yet connected to any gallery
          or external service.
        </p>
      </Reveal>
    </SectionShell>
  );
}