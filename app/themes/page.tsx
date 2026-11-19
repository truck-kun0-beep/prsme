import { redirect } from "next/navigation";

/**
 * /themes → /about#themes
 *
 * PRE-PHASE 11 — Themes is no longer a destination of its own; it is a
 * section of the About page. The route stays so that every old link keeps
 * working: a bookmark, a shared link, or an internal reference from an
 * earlier version of the site.
 *
 * The redirect is permanent because the consolidation is permanent — this
 * route will never host a page again.
 */
export default function ThemesRedirect() {
  redirect("/about#themes");
}

export const metadata = {
  title: "Themes",
  description: "The curated PRSME themes, now part of the About page.",
  robots: { index: false, follow: true },
};
