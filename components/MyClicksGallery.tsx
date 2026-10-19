import { Artwork } from "./Artwork";
import type { ClicksPhoto } from "@/lib/noirProfile";

const ratioClass: Record<ClicksPhoto["ratio"], string> = {
  tall: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
};

/**
 * My Clicks gallery.
 *  - On desktop (>= md), renders an editorial mosaic of varying ratios.
 *  - On mobile (< md), renders a horizontal scroller with snap points.
 *  - In both cases the gallery is contained inside its parent so the page
 *    width never grows past the viewport.
 *
 *  The viewer's Instagram link lives in the profile's social-links area;
 *  this gallery intentionally does not surface its own Instagram CTA.
 */
export function MyClicksGallery({ photos }: { photos: ClicksPhoto[] }) {
  return (
    <div className="relative">
      {/* Mobile horizontal scroller */}
      <div className="-mx-5 px-3 md:hidden">
        <ul
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [-ms-overflow-style:none]"
          style={{ WebkitOverflowScrolling: "touch" }}
          aria-label="My Clicks — photograph gallery"
        >
          {photos.map((p) => (
            <li
              key={p.id}
              className={`relative shrink-0 snap-start overflow-hidden rounded-lg ${ratioClass[p.ratio]}`}
              style={{ width: "68vw", maxWidth: "300px" }}
            >
              <ClickPhoto photo={p} />
            </li>
          ))}
        </ul>
        <style>{`
          ul::-webkit-scrollbar { display: none; }
        `}</style>
      </div>

      {/* Desktop mosaic */}
      <ul
        className="hidden md:grid grid-cols-12 gap-3 lg:gap-4"
        aria-label="My Clicks — photograph gallery"
      >
        {photos.map((p, idx) => {
          // Distribute into an asymmetric editorial layout.
          // Each row is 12 columns wide; total 8 photos.
          const layout =
            [
              "col-span-5 row-span-2",
              "col-span-4 row-span-1",
              "col-span-3 row-span-1",
              "col-span-4 row-span-1",
              "col-span-4 row-span-1",
              "col-span-4 row-span-2",
              "col-span-3 row-span-1",
              "col-span-5 row-span-1",
            ][idx] ?? "col-span-6 row-span-1";
          const ratio =
            idx % 5 === 0 ? "tall" : idx % 4 === 0 ? "wide" : idx % 3 === 0 ? "portrait" : "square";
          return (
            <li key={p.id} className={`relative overflow-hidden rounded-lg ${layout}`}>
              <div className={`${ratioClass[ratio]} w-full`}>
                <ClickPhoto photo={p} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClickPhoto({ photo }: { photo: ClicksPhoto }) {
  return (
    <Artwork palette={photo.palette} ratio="auto" label={`${photo.title} photograph`}>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 via-ink-950/10 to-transparent p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-200">
          {photo.place ?? "Untitled"}
        </p>
        <p className="truncate font-medium text-muted-50">{photo.title}</p>
      </div>
    </Artwork>
  );
}
