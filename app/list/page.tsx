import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { ListGrid } from "@/components/list/ListGrid";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listOwnList, countOwnList } from "@/lib/supabase/list";
import { normaliseCategory } from "@/lib/media/list";

export const metadata: Metadata = {
  title: "My List",
  description:
    "Your personal PRSME queue — films and series to watch, books and manga to read, records and songs to listen.",
  alternates: { canonical: "/list" },
  robots: { index: false, follow: false },
};

/**
 * /list — the signed-in user's personal media queue.
 *
 * The route is per-request: the list depends on who is asking, so it opts out
 * of static generation and full-route caching. A cached page would show one
 * visitor another visitor's list.
 *
 * A GUEST IS SENT TO SIGN-IN, with the destination preserved so they come
 * back here afterwards. The list is private by default — there is no
 * "browse other people's lists" — so a guest is not shown a broken page or a
 * fake empty state; they are asked to sign in, which is the honest answer.
 */
export const dynamic = "force-dynamic";

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const category = normaliseCategory(filter);

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteNav />
        <main id="main" className="pb-20">
          <div className="container-page py-16 md:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              My List
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-[var(--text-strong)] md:text-5xl">
              Your list needs an account.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
              My List is stored against your PRSME account, so it follows you
              across devices. Connect a Supabase project to use it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-in"
                className="inline-flex h-11 items-center rounded-md bg-[var(--accent-400)] px-5 text-[14px] font-medium text-[var(--surface-0)] transition-colors hover:bg-[var(--accent-500)]"
              >
                Sign in
              </Link>
              <Link
                href="/discover"
                className="inline-flex h-11 items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-5 text-[14px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-3)]"
              >
                Browse Discover
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    /*
     * A guest following the "List" navigation entry lands here.
     *
     * The redirect carries the current filter so the destination is
     * preserved, and `safeRedirectPath`-style validation happens on the
     * other side — the `next` value is a first-party path built here, and
     * the sign-in form resolves it through the shared allowlist.
     */
    const next = category === "all" ? "/list" : `/list?filter=${category}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const [entries, counts] = await Promise.all([
    listOwnList(category),
    countOwnList(),
  ]);

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        <section className="container-page pt-10 md:pt-16">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-300)]">
              My List
            </p>
            <h1
              className="mt-3 font-display text-4xl leading-[1.08] text-[var(--text-strong)] md:text-5xl"
              data-testid="list-page-heading"
            >
              Things worth coming back to.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
              {counts.total === 0
                ? "A single queue for everything you want to come back to — films and series to watch, books and manga to read, records and songs to listen. It is private, and it follows you across devices."
                : `${counts.total} ${counts.total === 1 ? "item" : "items"} saved. Only you can see this list.`}
            </p>
          </Reveal>
        </section>

        <section className="container-page mt-10 md:mt-14">
          <ListGrid entries={entries} category={category} counts={counts} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
