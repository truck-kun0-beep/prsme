"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthField, AuthMessage, AuthShell, AuthSubmit } from "./AuthShell";
import { getClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Choose a new password.
 *
 * Reached only through `/auth/callback`, which exchanges the emailed token for
 * a session first. The `onAuthStateChange` listener is a second line of
 * defence: Supabase fires `PASSWORD_RECOVERY` when the recovery session is
 * established, and if this page is ever opened directly (no recovery session),
 * we refuse rather than pretending a save would work.
 */
export function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [fieldError, setFieldError] = useState<{
    password?: boolean;
    confirm?: boolean;
  }>({});

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    /*
     * Subscribe FIRST, then check the current state.
     *
     * The callback route navigates here after establishing the session, so by
     * the time this component mounts the event has usually already fired —
     * subscribing after the check would therefore never see it and the page
     * would incorrectly report "no recovery session". Checking the existing
     * session as well as listening covers both orderings.
     */
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || session) {
          setHasRecoverySession(true);
          setReady(true);
        }
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasRecoverySession(true);
      }
      setReady(true);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError({});

    const nextInvalid: typeof fieldError = {};
    if (password.length < MIN_PASSWORD_LENGTH) nextInvalid.password = true;
    if (confirm !== password) nextInvalid.confirm = true;
    setFieldError(nextInvalid);

    if (nextInvalid.password) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (nextInvalid.confirm) {
      setError("Those passwords don't match.");
      return;
    }

    const supabase = getClient();
    if (!supabase) {
      setError("Accounts aren't set up on this build.");
      return;
    }

    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Checking your link…"
        description="One moment while we verify the reset link."
      >
        <div
          role="status"
          aria-live="polite"
          className="text-[13px] text-muted-300"
        >
          Verifying…
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Password updated"
        description="You're signed in with your new password."
      >
        <div role="status" data-testid="reset-password-done" className="space-y-4">
          <AuthMessage kind="success">
            Your password has been changed.
          </AuthMessage>
          <Link
            href="/studio"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-iris-400 px-4 text-sm font-medium text-ink-950 transition-colors hover:bg-iris-300"
          >
            Open your studio
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!hasRecoverySession) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="This link isn't valid"
        description="Reset links expire, and can only be used once."
      >
        <div role="alert" data-testid="reset-password-no-session" className="space-y-4">
          <AuthMessage kind="error">
            We couldn&apos;t verify a reset session from this link.
          </AuthMessage>
          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-iris-400 px-4 text-sm font-medium text-ink-950 transition-colors hover:bg-iris-300"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Choose a new password"
      description="Pick something you haven't used elsewhere."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="reset-password-form">
        <AuthMessage kind="error">{error}</AuthMessage>

        <AuthField
          id="password"
          label="New password"
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
          label="Confirm new password"
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
          pendingLabel="Updating…"
          testId="reset-password-submit"
        >
          Update password
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}