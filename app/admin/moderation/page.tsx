import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  isCallerModerator,
  listAuditTrail,
  listLiveRestrictions,
  listModerationReports,
  listModerators,
} from "@/lib/supabase/moderation";
import { SiteNav } from "@/components/SiteNav";
import { ModerationDashboard } from "@/components/moderation/ModerationDashboard";

/**
 * /admin/moderation
 *
 * The private moderation dashboard.
 *
 * A Server Component, so the moderator check happens BEFORE any client code
 * loads. An ordinary account is redirected to the sign-in page — which is the
 * right answer for a page that is not for them: the page is not in the
 * navigation, and its existence is not something an ordinary account is told.
 *
 * THE PAGE IS NOT IN THE NAVIGATION
 *
 * There is no link to it from the site navigation, from the account menu, or
 * from anywhere a visitor can reach. A moderator reaches it by URL. That is a
 * convenience, not the boundary — the boundary is the database's roster, and
 * the page refuses to render for anybody who is not on it.
 *
 * THE REPORTER IS NEVER SHOWN
 *
 * The queue says what was reported, what it is about, and what has been done
 * about it. It does not say who filed it. The reporter's identity is not
 * fetched by the server, so it cannot be disclosed by a mistake here.
 */
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  if (!isSupabaseConfigured()) {
    return <Unconfigured />;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/sign-in?next=/admin/moderation");
  }

  const moderator = await isCallerModerator();
  if (!moderator) {
    /*
     * An ordinary account does not get a page that says "you are not allowed".
     * It gets the sign-in page, which says nothing about the moderation
     * system existing at all.
     */
    redirect("/sign-in?next=/admin/moderation");
  }

  const [queue, restrictions, moderators, trail] = await Promise.all([
    listModerationReports({ limit: 20 }),
    listLiveRestrictions(),
    listModerators(),
    listAuditTrail({ limit: 50 }),
  ]);

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <SiteNav />
      <main id="main" className="container-page py-12 md:py-16">
        <ModerationDashboard
          initialReports={queue.reports}
          initialTotal={queue.total}
          initialCounts={queue.counts}
          initialNextOffset={queue.nextOffset}
          initialRestrictions={restrictions}
          initialModerators={moderators}
        />

        {trail.records.length > 0 ? (
          <section className="mx-auto mt-12 w-full max-w-5xl">
            <h2 className="font-display text-2xl text-muted-50">
              The audit trail
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-400">
              Every moderation action, in order. These records cannot be edited
              or deleted by anybody.
            </p>
            <ul className="mt-4 space-y-1">
              {trail.records.map((entry) => (
                <li key={entry.id} className="text-[12px] text-muted-400">
                  {entry.action}
                  {entry.moderatorUsername
                    ? ` by @${entry.moderatorUsername}`
                    : ""}
                  {entry.note ? ` — ${entry.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Unconfigured() {
  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <main id="main" className="container-page py-16">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-3xl text-muted-50">
            Accounts aren&apos;t set up
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
            No Supabase project is attached to this build, so there is no
            moderation queue to show.
          </p>
          <p className="mt-6">
            <Link
              href="/u/noir"
              className="text-iris-300 underline underline-offset-4"
            >
              Browse the demo profile
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export const metadata = {
  title: "Moderation",
  description: "The moderation queue.",
  robots: { index: false, follow: false },
};
