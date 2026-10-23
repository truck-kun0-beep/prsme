"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthField, AuthMessage, AuthShell, AuthSubmit } from "./AuthShell";
import { getClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Email + password registration.
 *
 * Two behaviours matter here:
 *
 *   1. **No profile is created on this page.** The brief requires that a
 *      profile only ever follow a *valid authenticated session*, and the
 *      session does not exist until the confirmation link is clicked. Creating
 *      the row here would leave an orphan profile for every signup that was
 *      never confirmed. Onboarding runs after sign-in instead.
 *
 *   2. **Confirmation-required is a real branch, not an error.** Supabase
 *      projects differ on whether email confirmation is enabled, so we inspect
 *      the returned session rather than assuming either way.
 */
export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    email?: boolean;
    password?: boolean;
    confirm?: boolean;
  }>({});

  function validate(): boolean {
    const nextInvalid: typeof fieldError = {};

    const trimmed = email.trim();
    if (!trimmed) nextInvalid.email = true;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      nextInvalid.email = true;
    }

    if (password.length < MIN_PASSWORD_LENGTH) nextInvalid.password = true;
    if (confirm !== password) nextInvalid.confirm = true;

    setFieldError(nextInvalid);

    if (nextInvalid.email) setError("Enter a valid email address.");
    else if (nextInvalid.password) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    } else if (nextInvalid.confirm) {
      setError("Those passwords don't match.");
    }

    return Object.keys(nextInvalid).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSentTo(null);

    if (!validate()) return;

    const supabase = getClient();
    if (!supabase) {
      setError("Accounts aren't set up on this build.");
      return;
    }

    setPending(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Sends the user back into the app after confirming. The Supabase
        // Dashboard needs this exact URL added to "Redirect URLs" (or a
        // wildcard) — see README "Email confirmation".
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });

      if (signUpError) {
        const message = signUpError.message.toLowerCase();

        if (message.includes("already") || message.includes("registered")) {
          // Do not confirm whether the address exists; direct to sign-in.
          setError(
            "That address can't be registered. Try signing in, or reset the password.",
          );
          setFieldError({ email: true });
        } else if (message.includes("rate") || message.includes("too many")) {
          setError("Too many attempts. Wait a moment and try again.");
        } else {
          setError(signUpError.message);
        }
        return;
      }

      /*
       * A session in the response means confirmation is disabled on this
       * project and the user is already authenticated. Otherwise they must
       * click the emailed link first.
       */
      if (data?.session) {
        window.location.assign("/onboarding");
        return;
      }

      setSentTo(email.trim());
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        eyebrow="Almost there"
        title="Check your inbox"
        description="We sent a confirmation link. Open it to finish creating your account."
      >
        <div
          role="status"
          data-testid="sign-up-confirmation-sent"
          className="space-y-4"
        >
          <AuthMessage kind="success">
            Confirmation sent to <strong>{sentTo}</strong>.
          </AuthMessage>
          <p className="text-[13px] leading-relaxed text-muted-300">
            The link signs you in and takes you to profile setup. If it
            doesn&apos;t arrive within a few minutes, check your spam folder.
          </p>
          <Link
            href="/sign-in"
            className="inline-block text-[13px] text-iris-300 underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Join PRSME"
      title="Create your account"
      description="One account, one profile, and it follows you across every device."
      footer={
        <p className="text-[13px] text-muted-400">
          Already registered?{" "}
          <Link
            href="/sign-in"
            className="text-iris-300 underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="sign-up-form">
        <AuthMessage kind="error">{error}</AuthMessage>

        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          invalid={fieldError.email}
          required
          disabled={pending}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          invalid={fieldError.password}
          required
          disabled={pending}
        />

        <AuthField
          id="confirm"
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          invalid={fieldError.confirm}
          required
          disabled={pending}
        />

        <AuthSubmit
          pending={pending}
          pendingLabel="Creating account…"
          testId="sign-up-submit"
        >
          Create account
        </AuthSubmit>

        <p className="text-[12px] leading-relaxed text-muted-400">
          We never store your password — Supabase&apos;s auth service handles
          it.
        </p>
      </form>
    </AuthShell>
  );
}