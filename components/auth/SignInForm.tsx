"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthField, AuthMessage, AuthShell, AuthSubmit } from "./AuthShell";
import { getClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/supabase/redirects";

/**
 * Email + password sign-in.
 *
 * The form talks to Supabase directly from the browser rather than through a
 * server action: `@supabase/ssr`'s browser client already writes the session to
 * cookies, and routing credentials through our own server would add a hop
 * without adding security. Every server read still goes through `getClaims()`.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    email?: boolean;
    password?: boolean;
  }>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError({});

    const nextInvalid: { email?: boolean; password?: boolean } = {};
    if (!email.trim()) nextInvalid.email = true;
    if (!password) nextInvalid.password = true;
    if (Object.keys(nextInvalid).length > 0) {
      setFieldError(nextInvalid);
      setError("Enter your email and password.");
      return;
    }

    const supabase = getClient();
    if (!supabase) {
      setError("Accounts aren't set up on this build.");
      return;
    }

    setPending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        /*
         * One message for every credential failure.
         *
         * "Invalid login credentials" vs "email not confirmed" tells an
         * attacker which addresses have accounts. Supabase already returns a
         * generic message for a wrong password; we collapse the remaining
         * distinguishable cases here rather than surfacing them.
         */
        const message = signInError.message.toLowerCase();

        if (message.includes("confirm")) {
          setError(
            "Check your inbox for the confirmation email, then sign in.",
          );
          setFieldError({ email: true });
        } else if (message.includes("rate") || message.includes("too many")) {
          setError("Too many attempts. Wait a moment and try again.");
        } else {
          setError("That email and password don't match an account.");
          setFieldError({ email: true, password: true });
        }
        return;
      }

      // Full navigation, not a client-side push: the new session cookie must
      // be visible to the server on the very next request.
      window.location.assign(safeRedirectPath(readNext(), "/onboarding"));
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to PRSME"
      description="Pick up your profile exactly where you left it — on any device."
      footer={
        <p className="text-[13px] text-muted-400">
          No account yet?{" "}
          <Link
            href="/sign-up"
            className="text-iris-300 underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="sign-in-form">
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
          autoComplete="current-password"
          invalid={fieldError.password}
          required
          disabled={pending}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[13px] text-muted-300 underline underline-offset-4 hover:text-muted-100"
          >
            Forgot your password?
          </Link>
        </div>

        <AuthSubmit
          pending={pending}
          pendingLabel="Signing in…"
          testId="sign-in-submit"
        >
          Sign in
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}

/** The requested destination, read defensively. */
function readNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("next");
  } catch {
    return null;
  }
}