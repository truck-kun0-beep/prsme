import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import {
  SocialAccountList,
  type SocialAccountEntry,
} from "@/components/social/SocialAccountList";
import {
  getProfileByUsername,
  listFollowers,
  listFollowing,
} from "@/lib/supabase/social";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * /u/[username]/followers and /u/[username]/following
 *
 * The two lists. A clean, accessible list of accounts — no avatars service,
 * no follow suggestions, no "people you might know". Just the accounts on one
 * side of the edge.
 *
 * THERE IS NO FRIENDS LIST. There is no mutual-friends view and no
 * "friends" count anywhere in the application.
 *
 * The route is per-request: a follower list depends on who is asking, and a
 * cached page would show one visitor another visitor's list.
 */
export const dynamic = "force-dynamic";

interface Params {
  username: string;
  list: "followers" | "following";
}

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username, list } = await params;
  const label = list === "followers" ? "Followers" : "Following";
  return {
    title: `${label} · @${username}`,
    description: `The accounts ${username} ${list === "followers" ? "follows" : "is followed by"}.`,
  };
}

export default async function SocialListPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username, list } = await params;
  const key = username.toLowerCase();

  if (!isSupabaseConfigured()) {
    return <Unavailable />;
  }

  const profile = await getProfileByUsername(key);
  if (!profile) notFound();

  const accounts: SocialAccountEntry[] =
    list === "followers"
      ? await listFollowers(key)
      : await listFollowing(key);

  const label = list === "followers" ? "Followers" : "Following";

  return (
    <>
      <SiteNav />
      <main id="main" className="pb-20">
        <div className="profile-canvas pt-10 md:pt-14">
          <Reveal>
            <p className="pf-eyebrow">{profile.displayName}</p>
            <h1 className="pf-display-name mt-2 text-[length:2.5rem] md:text-[length:3.25rem]">
              {label}
            </h1>
            <p className="pf-meta mt-2">prsme.app/{profile.username}</p>
            <p className="pf-body mt-4 max-w-xl text-[14px] leading-relaxed text-muted-200">
              {list === "followers"
                ? "The accounts following this profile."
                : "The accounts this profile follows."}
            </p>
            <p className="pf-meta mt-4">
              <Link
                href={`/u/${profile.username}`}
                className="underline underline-offset-4 hover:text-muted-50"
              >
                Back to profile
              </Link>
            </p>
          </Reveal>
        </div>

        <SocialAccountList accounts={accounts} emptyLabel={`No ${label.toLowerCase()} yet.`} />
      </main>
      <SiteFooter />
    </>
  );
}

function Unavailable() {
  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <main id="main" className="container-page py-16">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-3xl text-muted-50">
            Accounts aren&apos;t set up
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
            No Supabase project is attached to this build, so there are no
            follower lists to show.
          </p>
        </div>
      </main>
    </div>
  );
}
