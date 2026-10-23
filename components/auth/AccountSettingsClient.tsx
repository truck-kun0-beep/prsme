"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useAccount } from "./AccountProvider";
import { clearStoredDraft } from "@/lib/profileDraft";

/**
 * The interactive half of /account.
 *
 * Visibility is the only value on this page that persists, and it is saved
 * through a server action so the RLS policy is what authorises it. The state
 * shown is the value from the database, not an optimistic guess — the brief
 * requires that we not claim a change took effect before it did.
 */
export function AccountSettingsClient({
  email,
  username,
  visibility,
  hasProfile,
  createdAt,
  onVisibilityChange,
}: {
  email: string | null;
  username: string | null;
  visibility: "public" | "private" | null;
  hasProfile: boolean;
  createdAt: string | null;
  onVisibilityChange: (
    v: "public" | "private",
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { signOut } = useAccount();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<"public" | "private" | null>(
    visibility,
  );
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function change(next: "public" | "private") {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await onVisibilityChange(next);
      if (result.ok) {
        // Only adopt the new value once the database confirmed it.
        setCurrent(next);
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2500);
      } else {
        setError(result.message ?? "Could not change visibility.");
      }
    });
  }

  async function onSignOut() {
    await signOut();
    clearStoredDraft();
    window.location.assign("/");
  }

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <main id="main" className="container-page py-12 md:py-16">
        <div className="mx-auto w-full max-w-lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
            Account
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50">
            Settings
          </h1>

          <div className="mt-8 space-y-5">
            {/* Email */}
            <section className="rounded-lg border border-line-soft bg-ink-800/40 p-4">
              <h2 className="text-[13px] font-medium text-muted-50">
                Email address
              </h2>
              <p className="mt-1.5 text-[14px] text-muted-200">
                {email ?? "Not available"}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-400">
                This is the address you sign in with. Changing it is handled in
                the Supabase dashboard for now.
              </p>
            </section>

            {/* Profile */}
            <section className="rounded-lg border border-line-soft bg-ink-800/40 p-4">
              <h2 className="text-[13px] font-medium text-muted-50">Profile</h2>
              {hasProfile && username ? (
                <>
                  <p className="mt-1.5 text-[14px] text-muted-200">
                    prsme.app/u/{username}
                  </p>
                  {createdAt ? (
                    <p className="mt-1 text-[12px] text-muted-400">
                      Created {new Date(createdAt).toLocaleDateString()}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={`/u/${username}`}
                      className="text-[13px] text-iris-300 underline underline-offset-4"
                    >
                      View public profile
                    </Link>
                    <Link
                      href="/studio"
                      className="text-[13px] text-iris-300 underline underline-offset-4"
                    >
                      Edit profile
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-[14px] text-muted-300">
                    You haven&apos;t created a profile yet.
                  </p>
                  <Link
                    href="/onboarding"
                    className="mt-3 inline-block text-[13px] text-iris-300 underline underline-offset-4"
                  >
                    Create your profile
                  </Link>
                </>
              )}
            </section>

            {/* Visibility */}
            {hasProfile ? (
              <section className="rounded-lg border border-line-soft bg-ink-800/40 p-4">
                <h2 className="text-[13px] font-medium text-muted-50">
                  Profile privacy
                </h2>

                {error ? (
                  <p
                    role="alert"
                    className="mt-2 text-[12px] text-[#E8A0A4]"
                    data-testid="account-visibility-error"
                  >
                    {error}
                  </p>
                ) : null}
                {justSaved ? (
                  <p
                    role="status"
                    className="mt-2 text-[12px] text-emerald-200"
                    data-testid="account-visibility-saved"
                  >
                    Saved.
                  </p>
                ) : null}

                <div className="mt-3 space-y-2">
                  {(
                    [
                      {
                        value: "public",
                        label: "Public",
                        help: "Anyone with the link can view your profile.",
                      },
                      {
                        value: "private",
                        label: "Private",
                        help: "Only you can view it. Enforced by database policy, not just hidden in the browser.",
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-line-soft bg-ink-900/50 px-3 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <input
                        type="radio"
                        name="account-visibility"
                        value={option.value}
                        checked={current === option.value}
                        onChange={() => change(option.value)}
                        disabled={pending}
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-400)]"
                        data-testid={`account-visibility-${option.value}`}
                      />
                      <span>
                        <span className="block text-[13px] text-muted-100">
                          {option.label}
                        </span>
                        <span className="block text-[12px] text-muted-400">
                          {option.help}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Password */}
            <section className="rounded-lg border border-line-soft bg-ink-800/40 p-4">
              <h2 className="text-[13px] font-medium text-muted-50">
                Password
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-300">
                Forgotten it? We email a reset link — it opens a page where you
                choose a new password.
              </p>
              <Link
                href="/forgot-password"
                className="mt-3 inline-block text-[13px] text-iris-300 underline underline-offset-4"
              >
                Send a reset link
              </Link>
            </section>

            {/* Sign out */}
            <section className="rounded-lg border border-line-soft bg-ink-800/40 p-4">
              <h2 className="text-[13px] font-medium text-muted-50">
                Sign out
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-300">
                Ends this session on this device. Your saved profile stays
                exactly as it is.
              </p>
              <button
                type="button"
                onClick={onSignOut}
                disabled={pending}
                data-testid="account-signout"
                className="mt-3 rounded-md border border-line-strong bg-ink-700/70 px-3 py-2 text-[13px] font-medium text-muted-50 transition-colors hover:bg-ink-600 disabled:opacity-50"
              >
                Sign out
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}