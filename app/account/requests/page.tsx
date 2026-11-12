import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/supabase/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/supabase/social";
import { FollowRequestsPanel } from "@/components/social/FollowRequestsPanel";

/**
 * /account/requests
 *
 * The follow-request area.
 *
 * THERE IS NO FRIENDS TAB AND NO FRIEND COUNT. This is a queue for one-way
 * follows: the requests other people have sent to you, and the requests you
 * have sent that are still open.
 *
 * A Server Component, so the unauthenticated redirect happens before any
 * client code loads and the request lists come from the server rather than
 * being trusted from the browser.
 */
export const dynamic = "force-dynamic";

export default async function FollowRequestsPage() {
  if (!isSupabaseConfigured()) {
    return <Unconfigured />;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/sign-in?next=/account/requests");
  }

  const [incoming, outgoing] = await Promise.all([
    listIncomingRequests(),
    listOutgoingRequests(),
  ]);

  return (
    <FollowRequestsPanel
      incoming={incoming.map((entry) => ({
        id: entry.id,
        requestedAt: entry.requestedAt,
        account: entry.follower,
      }))}
      outgoing={outgoing.map((entry) => ({
        id: entry.id,
        requestedAt: entry.requestedAt,
        account: entry.following,
      }))}
    />
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
            follow requests to show.
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
  title: "Follow requests",
  description: "Follow requests you have sent and received.",
};
