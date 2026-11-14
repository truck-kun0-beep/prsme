import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listNotifications } from "@/lib/supabase/notifications";
import { SiteNav } from "@/components/SiteNav";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

/**
 * /account/notifications
 *
 * The notification centre.
 *
 * A Server Component, so the unauthenticated redirect happens before any
 * client code loads, and so the first page of notifications comes from the
 * server rather than being fetched by the browser after the page appears.
 *
 * THE LIST IS PAGED, AND THE COUNT IS NOT DERIVED FROM IT
 *
 * The list shows the newest twenty notifications and then loads more on
 * request. That means the list alone cannot answer "how many are unread" —
 * it can only see the twenty in front of it — so the unread count is the
 * database's number, not the list's.
 *
 * THE NAVIGATION IS ON THIS PAGE
 *
 * The bell's badge is how the reader knows the list has anything in it, and
 * reading a notification has to make that badge visibly fall. Both of those
 * happen HERE, on the centre — so the navigation is here too, and there is
 * still exactly one bell on the page.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!isSupabaseConfigured()) {
    return <Unconfigured />;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/sign-in?next=/account/notifications");
  }

  const page = await listNotifications();

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <SiteNav />
      <main id="main" className="container-page py-12 md:py-16">
        <NotificationCenter
          initialNotifications={page.notifications}
          initialNextOffset={page.nextOffset}
        />
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
            No Supabase project is attached to this build, so there are no
            notifications to show.
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
  title: "Notifications",
  description: "What has happened to your account.",
};
