"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthField, AuthMessage, AuthShell, AuthSubmit } from "./AuthShell";
import { getClient } from "@/lib/supabase/client";

/**
 * Request a password-reset email.
 *
 * The success message is shown whether or not the address has an account. That
 * is not a nicety — Supabase's own `resetPasswordForEmail` is the authority
 * here, and echoing back "no such account" would turn this form into an account
 * enumeration oracle regardless of what the API returns.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEmailInvalid(false);

    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailInvalid(true);
      setError("Enter a valid email address.");
      return;
    }

    const supabase = getClient();
    if (!supabase) {
      setError("Accounts aren't set up on this build.");
      return;
    }

    setPending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        {
          // Fixed, first-party destination. Never a client-supplied URL.
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        },
      );

      if (resetError) {
        const message = resetError.message.toLowerCase();
        if (message.includes("rate") || message.includes("too many")) {
          setError("Too many requests. Wait a moment and try again.");
        } else {
          setError("We couldn't send the reset email. Try again shortly.");
        }
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Check your inbox"
        description="If that address has a PRSME account, a reset link is on its way."
      >
        <div role="status" data-testid="forgot-password-sent" className="space-y-4">
          <AuthMessage kind="success">
            If an account exists for that address, we&apos;ve sent a reset link.
          </AuthMessage>
          <p className="text-[13px] leading-relaxed text-muted-300">
            The link opens a page where you can choose a new password. It
            expires after a short while, so use it soon.
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
      eyebrow="Password reset"
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new one."
      footer={
        <p className="text-[13px] text-muted-400">
          Remembered it?{" "}
          <Link
            href="/sign-in"
            className="text-iris-300 underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4"
        data-testid="forgot-password-form"
      >
        <AuthMessage kind="error">{error}</AuthMessage>

        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          invalid={emailInvalid}
          required
          disabled={pending}
        />

        <AuthSubmit
          pending={pending}
          pendingLabel="Sending…"
          testId="forgot-password-submit"
        >
          Send reset link
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}