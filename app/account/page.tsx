import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId, getUserRecord } from "@/lib/supabase/session";
import { getProfileForUser } from "@/lib/supabase/profiles";
import { updateVisibilityAction } from "@/lib/supabase/accountActions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AccountSettingsClient } from "@/components/auth/AccountSettingsClient";

/**
 * /account
 *
 * The account area. Deliberately small: current email, profile link and
 * username, visibility, password reset, and sign out. No social connections,
 * no notifications, no friends — those are later phases and the brief rules
 * them out of this one.
 *
 * A Server Component so the unauthenticated redirect happens before any client
 * code loads, and so the email comes from the server rather than being trusted
 * from the browser.
 */
export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return <Unconfigured />;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/sign-in?next=/account");
  }

  const [profile, user] = await Promise.all([
    getProfileForUser(),
    getUserRecord(),
  ]);

  return (
    <AccountSettingsClient
      email={user?.email ?? null}
      username={profile?.username ?? null}
      visibility={profile?.visibility ?? null}
      hasProfile={profile !== null}
      createdAt={profile?.createdAt ?? null}
      onVisibilityChange={updateVisibilityAction}
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
            No Supabase project is attached to this build. See{" "}
            <code className="font-mono text-[13px] text-iris-300">
              .env.example
            </code>{" "}
            for the two variables that switch accounts on.
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
  title: "Account settings",
  description: "Your PRSME account: email, username, and privacy.",
};