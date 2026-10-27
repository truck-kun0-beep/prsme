"use client";

/**
 * Custom Link Buttons on the public profile (Phase 4.5, redesigned in 4.6).
 *
 * Owner-defined outbound buttons — portfolio, shop, channel, event — rendered as
 * an independent profile section.
 *
 * The rules this component exists to enforce:
 *
 *   - **Only the label is visible.** The destination URL is never printed as
 *     body text or as decorative metadata, so a long tracking query string
 *     cannot leak into the design. `href` is the only place the URL appears.
 *   - **No empty section.** If there is nothing renderable, this returns `null`.
 *     No heading, no empty panel, no dashed outline waiting to be filled.
 *   - **Theme-driven by default.** Every colour derives from a `--pf-*` token
 *     unless the owner deliberately chose a custom accent, so switching theme or
 *     typography changes the buttons with no extra wiring.
 *
 * Phase 4.6 replaces the small inline pills with substantial link-in-bio buttons
 * and adds four presentation options. Each one is resolved here, in one place,
 * so the public page and the studio preview cannot disagree about what a given
 * stored value renders as.
 */

import type { CustomLinkButton, CustomLinksSection } from "@/lib/noirProfile";
import { DEFAULT_CUSTOM_LINKS_SECTION } from "@/lib/noirProfile";
import {
  DEFAULT_CUSTOM_LINK_COLOUR_MODE,
  DEFAULT_CUSTOM_LINK_SHAPE,
  DEFAULT_CUSTOM_LINK_STYLE,
  readableTextOn,
} from "@/lib/validate";

/**
 * A label long enough to need more room than a grid cell can give it without
 * looking broken. Above this, `grid` is abandoned for `stack` — see below.
 */
const LONG_LABEL_CHARS = 22;

/**
 * Phase 4.7 — the eyebrow / heading / description above the buttons.
 *
 * Shared, rather than written twice, because the studio preview and the public
 * profile must never be able to disagree: a preview that drifts from the shipped
 * markup is how a studio ends up promising a design it does not render. The
 * public page wraps this in `<Reveal>`; the studio renders it directly so the
 * words are visible the instant they are typed, with no observer involved.
 *
 * **Empty means absent.** A blank field drops its element *and its margin*, which
 * is why the vertical spacing is conditional instead of a fixed `mt-*` on every
 * line. A description with no heading above it must not inherit the heading's top
 * margin and leave a hole, and a heading with no eyebrow must sit flush.
 *
 * Every colour and every face comes from a `--pf-*` token, so switching theme or
 * typography in the studio moves these three lines with the rest of the profile
 * and no extra wiring is needed.
 */
export function CustomLinksSectionHeader({
  copy,
  className = "",
}: {
  copy: CustomLinksSection | undefined;
  className?: string;
}) {
  const resolved = copy ?? DEFAULT_CUSTOM_LINKS_SECTION;
  const eyebrow = resolved.eyebrow?.trim() ?? "";
  const heading = resolved.heading?.trim() ?? "";
  const description = resolved.description?.trim() ?? "";

  if (!eyebrow && !heading && !description) return null;

  return (
    <header
      className={`pf-links-header mb-6 md:mb-7 ${className}`.trim()}
      data-testid="custom-links-heading-block"
    >
      {eyebrow && <p className="pf-eyebrow">{eyebrow}</p>}
      {heading && (
        <h2
          id="links-heading"
          className={`pf-display ${eyebrow ? "mt-2.5 " : ""}text-[length:2rem] md:text-[length:2.75rem] leading-[1.06]`}
        >
          {heading}
        </h2>
      )}
      {description && (
        <p
          className={`pf-body max-w-2xl text-[14px] text-[var(--pf-text-muted)] ${
            heading ? "mt-2" : eyebrow ? "mt-2.5" : ""
          }`}
        >
          {description}
        </p>
      )}
    </header>
  );
}

export function ProfileCustomLinks({
  links,
}: {
  links: CustomLinkButton[] | undefined;
}) {
  /*
   * Filter again at the point of render. `buildEffectiveOwner` already does
   * this, but the component is also rendered inside the studio's live preview,
   * which can hand it a draft-shaped array mid-edit. A half-typed button must
   * never appear on the public surface, so the check is cheap and local.
   */
  const rendered = (links ?? []).filter(
    (l) =>
      typeof l.label === "string" &&
      l.label.trim().length > 0 &&
      typeof l.url === "string" &&
      l.url.startsWith("https://") &&
      l.url.length > "https://".length,
  );

  if (rendered.length === 0) return null;

  /*
   * Phase 4.6 — the layout is one decision for the whole row, not per button.
   *
   * `grid` is only honoured when it can actually work: at least three buttons to
   * fill it, and no label long enough that a cell would force it onto three
   * lines. A grid of one or two items looks like a mistake, and a grid that
   * breaks a long label across lines is worse than the stack it replaced — so
   * both cases fall back rather than render a compromise.
   */
  const anyLongLabel = rendered.some(
    (l) => l.label.trim().length > LONG_LABEL_CHARS,
  );
  const useGrid =
    rendered.length >= 3 &&
    rendered.every((l) => l.layout === "grid") &&
    !anyLongLabel;

  return (
    <nav
      className={`pf-custom-links ${useGrid ? "pf-custom-links--grid" : ""}`}
      aria-label="Custom links"
      data-testid="custom-links"
      data-layout={useGrid ? "grid" : "stack"}
    >
      <ul className="pf-custom-links-list">
        {rendered.map((link) => {
          const shape = link.shape ?? DEFAULT_CUSTOM_LINK_SHAPE;
          const style = link.style ?? DEFAULT_CUSTOM_LINK_STYLE;
          const colourMode =
            link.colourMode ?? DEFAULT_CUSTOM_LINK_COLOUR_MODE;

          /*
           * A custom accent is honoured only when the owner actually selected
           * custom mode AND supplied a valid colour. `readCustomLinks` already
           * enforces that pairing on load; repeating it here means a mid-edit
           * studio preview can never paint an unfinished colour onto the public
           * surface.
           */
          const customAccent =
            colourMode === "custom" &&
            /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(link.accent ?? "")
              ? link.accent!
              : null;

          return (
            <li key={link.id} className="pf-custom-links-item">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`pf-custom-link pf-custom-link--${shape} pf-custom-link--${style}`}
                data-testid="custom-link"
                data-shape={shape}
                data-style={style}
                data-colour={colourMode}
                /*
                 * Phase 4.6 — the accent family is derived from ONE colour with
                 * `color-mix`, exactly as the profile accent does. That is what
                 * keeps a custom button colour coherent: the hover state, the
                 * focus ring, and the outline variant are all relative shades of
                 * the same base rather than independently chosen values.
                 *
                 * With no custom accent we set nothing, so the stylesheet falls
                 * through to the `--pf-*` theme tokens.
                 */
                style={
                  customAccent
                    ? ({
                        "--pf-link-accent": customAccent,
                        "--pf-link-on-accent": readableTextOn(customAccent),
                      } as React.CSSProperties)
                    : undefined
                }
                aria-label={`${link.label} (opens in a new tab)`}
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}