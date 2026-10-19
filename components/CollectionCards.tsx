import { Artwork } from "./Artwork";
import { RatingBadge } from "./RatingBadge";
import type { ProfileCollection, ProfileMediaItem } from "@/lib/noirProfile";

/**
 * Truncate helper that preserves whole words and adds an ellipsis. Used for
 * review excerpts in compact views.
 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/*                              Poster Grid (default)                          */
/* -------------------------------------------------------------------------- */

export function PosterGridCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-6">
      {collection.items.map((item) => (
        <PosterCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function PosterCard({ item }: { item: ProfileMediaItem }) {
  return (
    <article className="group flex min-w-0 flex-col">
      <div className="relative overflow-hidden rounded-md">
        <Artwork
          palette={item.palette}
          ratio="2/3"
          label={`${item.title} cover artwork`}
          className="transition-transform duration-500 ease-soft group-hover:scale-[1.02]"
        />
        {item.myRating !== undefined && (
          <div className="absolute right-2 top-2">
            <RatingBadge value={item.myRating} size="sm" />
          </div>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <h3 className="truncate font-medium text-muted-50" title={item.title}>
          {item.title}
        </h3>
        {item.byline && (
          <p className="truncate text-[12px] text-muted-300" title={item.byline}>
            {item.byline}
          </p>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Featured                                      */
/* -------------------------------------------------------------------------- */

/**
 * Featured layout: a "hero" artwork on the left with title overlay, then a
 * compact adjacent list of remaining items beneath or beside it.
 */
export function FeaturedCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  const [hero, ...rest] = collection.items;
  if (!hero) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <article className="lg:col-span-7">
        <div className="relative overflow-hidden rounded-lg">
          <Artwork palette={hero.palette} ratio="3/4" label={`${hero.title} cover artwork`} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 via-ink-950/40 to-transparent p-5 md:p-7">
            <h3 className="font-display text-2xl text-muted-50 md:text-3xl">
              {hero.title}
            </h3>
            {hero.byline && (
              <p className="mt-1 text-[13px] text-muted-200">{hero.byline}</p>
            )}
            {hero.myReview && (
              <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-muted-200">
                &ldquo;{hero.myReview}&rdquo;
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              {hero.myRating !== undefined && (
                <RatingBadge value={hero.myRating} size="md" withLabel />
              )}
              <span className="text-[12px] uppercase tracking-[0.18em] text-muted-400">
                My rating
              </span>
            </div>
          </div>
        </div>
      </article>

      <ul className="lg:col-span-5 flex min-w-0 flex-col gap-4">
        {rest.map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 items-start gap-4 rounded-lg border border-[var(--line-soft)] bg-ink-900/60 p-3"
          >
            <div className="hidden h-20 w-16 shrink-0 overflow-hidden rounded-md sm:block">
              <Artwork palette={item.palette} ratio="auto" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h4 className="truncate font-medium text-muted-50">{item.title}</h4>
                {item.myRating !== undefined && (
                  <RatingBadge value={item.myRating} size="sm" />
                )}
              </div>
              {item.byline && (
                <p className="truncate text-[12px] text-muted-300">{item.byline}</p>
              )}
              {item.myReview && (
                <p className="mt-1 text-[13px] leading-relaxed text-muted-300">
                  &ldquo;{truncate(item.myReview, 140)}&rdquo;
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Compact                                       */
/* -------------------------------------------------------------------------- */

/**
 * Compact layout: a horizontal/vertical list of items with their own artwork
 * thumbnail, suited for music and manga where artworks are often square.
 */
export function CompactCollection({
  collection,
}: {
  collection: ProfileCollection;
}) {
  return (
    <ul className="flex min-w-0 flex-col divide-y divide-[var(--line-soft)] border-y border-[var(--line-soft)]">
      {collection.items.map((item, idx) => (
        <li
          key={item.id}
          className="grid grid-cols-[auto,1fr,auto] items-center gap-4 py-4 first:pt-5 last:pb-5"
        >
          <span className="hidden font-mono text-[11px] text-muted-500 sm:block">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md sm:h-16 sm:w-16">
              <Artwork palette={item.palette} ratio="auto" />
            </div>
            <div className="min-w-0">
              <h4 className="truncate font-medium text-muted-50">{item.title}</h4>
              {item.byline && (
                <p className="truncate text-[12px] text-muted-300">{item.byline}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {item.year && (
              <span className="hidden font-mono text-[11px] text-muted-500 sm:inline">
                {item.year}
              </span>
            )}
            {item.myRating !== undefined && (
              <RatingBadge value={item.myRating} size="sm" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Collection router                                */
/* -------------------------------------------------------------------------- */

export function CollectionBlock({
  collection,
}: {
  collection: ProfileCollection;
}) {
  switch (collection.layout) {
    case "featured":
      return <FeaturedCollection collection={collection} />;
    case "compact":
      return <CompactCollection collection={collection} />;
    case "poster-grid":
    default:
      return <PosterGridCollection collection={collection} />;
  }
}
