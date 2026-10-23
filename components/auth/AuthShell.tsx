"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { supabaseSetupMessage, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Shared chrome for every auth screen.
 *
 * The unconfigured state is handled HERE, once, rather than in each of the six
 * auth pages. That is what makes the brief's "must build and render with no
 * Supabase project" requirement true by construction: there is no path where an
 * auth page can call `createClient()` and throw, because the shell shows setup
 * instructions before the form is ever mounted.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <SiteNav />
      <main id="main" className="container-page py-12 md:py-20">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50 md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
              {description}
            </p>
          </header>

          {configured ? (
            children
          ) : (
            <NotConfigured />
          )}

          {configured && footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * The "no project configured" state.
 *
 * This is a first-class UI state, not an error page: the app is fully usable,
 * and only the account features are unavailable. The demo profile link is
 * offered so the visitor is never left at a dead end.
 */
function NotConfigured() {
  const lines = supabaseSetupMessage().split("\n");

  return (
    <div
      role="status"
      data-testid="auth-not-configured"
      className="rounded-lg border border-line-soft bg-ink-800/60 p-5"
    >
      <h2 className="text-[15px] font-medium text-muted-50">
        Accounts aren&apos;t set up yet
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-300">
        This build has no Supabase project attached, so signing in is turned
        off. The rest of PRSME works without it.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md border border-line-soft bg-ink-950/80 p-3 font-mono text-[11px] leading-relaxed text-muted-400">
        {lines.join("\n")}
      </pre>
      <p className="mt-4 text-[13px] text-muted-300">
        You can still{" "}
        <Link href="/u/noir" className="text-iris-300 underline underline-offset-4">
          browse the demo profile
        </Link>{" "}
        or{" "}
        <Link href="/" className="text-iris-300 underline underline-offset-4">
          return home
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * A form field with a persistent label, hint, and error slot.
 *
 * The error is wired through `aria-describedby` and `aria-invalid` by the
 * caller, because this component renders the visual layer only and the form
 * owns the validation state.
 */
export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  invalid,
  required,
  disabled,
  minLength,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[12px] font-medium tracking-wide text-muted-200"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        minLength={minLength}
        aria-describedby={hintId}
        aria-invalid={invalid ? true : undefined}
        data-testid={`auth-field-${id}`}
        className={`mt-1.5 w-full rounded-md border bg-ink-900/70 px-3 py-2.5 text-[14px] text-muted-50 placeholder:text-muted-500 transition-colors focus:outline-none focus:border-iris-400/60 disabled:opacity-50 ${
          invalid ? "border-[#D6757B]/70" : "border-line-soft"
        }`}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-[12px] text-muted-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A form-level status message. Errors and successes share one live region. */
export function AuthMessage({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  if (!children) return null;
  const styles = {
    error: "border-[#D6757B]/40 bg-[#D6757B]/10 text-[#E8A0A4]",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    info: "border-line-soft bg-ink-800/60 text-muted-300",
  }[kind];

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live="polite"
      data-testid={`auth-message-${kind}`}
      className={`rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${styles}`}
    >
      {children}
    </div>
  );
}

/** A submit button that shows a pending label and blocks double-submit. */
export function AuthSubmit({
  pending,
  pendingLabel,
  children,
  testId,
}: {
  pending: boolean;
  pendingLabel: string;
  children: string;
  testId?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid={testId}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-iris-400 px-4 py-2.5 text-sm font-medium text-ink-950 transition-transform duration-200 ease-soft hover:-translate-y-0.5 hover:bg-iris-300 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}