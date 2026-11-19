import { Reveal } from "@/components/Reveal";
import { noirProfile } from "@/lib/noirProfile";
import { isSafeExternalUrl } from "@/lib/validate";

/**
 * The My Clicks showcase.
 *
 * PRE-PHASE 11 — this fixes the reported problem: the My Clicks section on
 * the marketing/about surface rendered nothing but local SVG placeholders, so
 * a new visitor had no idea what the feature was.
 *
 * The fix is to render the ACTUAL demo photographs — the same externally
 * hosted images the `/u/noir` profile shows. They are loaded by the browser
 * straight from their host (Wikimedia Commons); PRSME stores only the URL and
 * never downloads or copies the file.
 *
 * The same `isSafeExternalUrl` guard the profile renderer uses decides which
 * entries may be shown, so a malformed or unsafe URL cannot be turned into a
 * request by this component.
 *
 * The images are attributed: each one links to its source on Wikimedia
 * Commons, so the work stays credited to the photographer.
 */
export function ClicksShowcase() {
  // Only entries that actually have a usable external image are shown.
  const photos = noirProfile.clicks.filter(
    (photo) =>
      photo.mode !== "post" &&
      isSafeExternalUrl(photo.imageUrl) &&
      photo.imageUrl,
  );

  if (photos.length === 0) return null;

  return (
    <section
      aria-labelledby="clicks-heading"
      className="container-page mt-20 md:mt-28"
      data-testid="about-clicks"
    >
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
          My Clicks
        </p>
        <h2
          id="clicks-heading"
          className="mt-3 max-w-2xl font-display text-3xl leading-tight text-[var(--text-strong)] md:text-4xl"
        >
          A shelf for the photographs you actually chose.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          My Clicks is the part of a PRSME profile that is not about media at
          all. It is your own photography — the frames you picked, arranged as
          an editorial mosaic rather than a chronological feed, because the
          point is the selection, not the timeline.
        </p>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          You paste a direct image URL you have permission to display, and
          PRSME keeps the link — not a copy. Your browser loads each picture
          from its original host. The photographs below are real, and they are
          the ones the demo profile shows.
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
        {photos.map((photo, index) => {
          const href = isSafeExternalUrl(photo.sourceUrl)
            ? photo.sourceUrl
            : isSafeExternalUrl(photo.imageUrl)
              ? photo.imageUrl
              : null;

          const frame = (
            <>
              <img
                src={photo.imageUrl as string}
                alt={photo.altText || photo.title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-500 ease-soft group-hover:scale-[1.03]"
                data-testid="about-clicks-image"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="block text-[12px] font-medium text-white">
                  {photo.title}
                </span>
                {photo.place ? (
                  <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-white/70">
                    {photo.place}
                  </span>
                ) : null}
              </span>
            </>
          );

          const ratios = [
            "aspect-[3/4]",
            "aspect-[4/5]",
            "aspect-square",
            "aspect-[4/3]",
          ];
          const ratio = ratios[index % ratios.length];

          return href ? (
            <a
              key={photo.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative block overflow-hidden rounded-lg border border-[var(--line-soft)] ${ratio}`}
              data-testid="about-clicks-card"
              aria-label={`Open “${photo.title}” in a new tab`}
            >
              {frame}
            </a>
          ) : (
            <div
              key={photo.id}
              className={`group relative block overflow-hidden rounded-lg border border-[var(--line-soft)] ${ratio}`}
              data-testid="about-clicks-card"
            >
              {frame}
            </div>
          );
        })}
      </div>

      <Reveal>
        <p className="mt-6 text-[12px] leading-relaxed text-[var(--text-faint)]">
          Photographs from Wikimedia Commons, each linking to its source page.
          PRSME hosts none of them.
        </p>
      </Reveal>
    </section>
  );
}
