"use client";

import { Button } from "./Button";
import { useState } from "react";

/**
 * Phase 1 placeholder waitlist form. Submission is intentionally a no-op so
 * the page never claims to integrate with a real backend.
 */
export function CtaForm() {
  const [email, setEmail] = useState("");
  return (
    <form
      className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        // Phase 1 placeholder only — no network call yet.
        setEmail("");
      }}
      aria-label="Join the PRSME waitlist"
    >
      <label htmlFor="cta-email" className="sr-only">
        Email address
      </label>
      <input
        id="cta-email"
        type="email"
        required
        placeholder="you@somewhere.cool"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12 grow border border-[var(--line-soft)] bg-ink-800/80 px-4 text-sm text-muted-50 placeholder:text-muted-400 focus:border-iris-400/60 focus:outline-none"
      />
      <Button type="submit" size="lg">
        Reserve a spot
      </Button>
    </form>
  );
}