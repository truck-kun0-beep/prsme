"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  createProfileAction,
  type CreateProfileFormState,
} from "@/lib/supabase/actions";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/supabase/username";
import { loadDraft } from "@/lib/profileDraft";

/**
 * First-run profile setup.
 *
 * Reached after a successful sign-in when the account does not yet own a
 * profile. Three behaviours the brief calls out specifically:
 *
 *   - **No implicit demo copy.** A new account starts from a neutral profile.
 *     Noir is only ever offered through an explicit import of the visitor's own
 *     guest draft.
 *   - **Second-profile prevention.** The server action redirects to /studio if
 *     a profile already exists, and the UNIQUE constraint makes a race
 *     impossible. This page never renders a "create" affordance in that case.
 *   - **Username conflicts are database-backed.** The availability hint below
 *     is a convenience; the real decision is the unique index at insert time.
 */
export function OnboardingForm() {
  const [state, setState] = useState<CreateProfileFormState | null>(null);
  const [pending, startTransition] = useTransition();
  const [importDraft, setImportDraft] = useState(false);
  const [hasGuestDraft, setHasGuestDraft] = useState(false);
  const [draftJson, setDraftJson] = useState("");

  /*
   * The server cannot read localStorage, so the guest draft is serialised here
   * and submitted as a form field. It is only attached when the visitor has
   * explicitly ticked the import box.
   */
  useEffect(() => {
    const stored = loadDraft();
    if (!stored) return;

    const hasWork =
      stored.tags.length > 0 ||
      stored.socials.length > 0 ||
      stored.collections.length > 0 ||
      stored.clicks.length > 0 ||
      stored.customLinks.length > 0 ||
      stored.soundtrack !== null ||
      stored.identity.bio.trim().length > 0;

    if (!hasWork) return;

    setHasGuestDraft(true);
    try {
      setDraftJson(JSON.stringify(stored));
    } catch {
      // Unserialisable draft: leave the import option hidden rather than
      // offering something that would submit a broken payload.
      setHasGuestDraft(false);
    }
  }, []);

  function onSubmit(formData: FormData) {
    if (!importDraft) formData.delete("guestDraft");
    startTransition(async () => {
      const next = await createProfileAction(
        state ?? { ok: false },
        formData,
      );
      setState(next);
    });
  }

  const values = state?.values;

  return (
    <div className="min-h-dvh bg-ink-950 text-muted-100">
      <main id="main" className="container-page py-12 md:py-20">
        <div className="mx-auto w-full max-w-lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
            One more step
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50 md:text-4xl">
            Create your profile
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-300">
            One account gets one profile. You can change any of this later in
            the Studio.
          </p>

          <form action={onSubmit} className="mt-8 space-y-5" data-testid="onboarding-form">
            {state?.message ? (
              <div
                role="alert"
                data-testid="onboarding-error"
                className="rounded-md border border-[#D6757B]/40 bg-[#D6757B]/10 px-3 py-2.5 text-[13px] text-[#E8A0A4]"
              >
                {state.message}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="displayName"
                className="block text-[12px] font-medium tracking-wide text-muted-200"
              >
                Display name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                defaultValue={values?.displayName}
                required
                maxLength={60}
                autoComplete="nickname"
                placeholder="How your name appears"
                aria-invalid={state?.field === "displayName" ? true : undefined}
                data-testid="onboarding-displayName"
                className="mt-1.5 w-full rounded-md border border-line-soft bg-ink-900/70 px-3 py-2.5 text-[14px] text-muted-50 placeholder:text-muted-500 focus:border-iris-400/60 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="block text-[12px] font-medium tracking-wide text-muted-200"
              >
                Username
              </label>
              <div className="mt-1.5 flex items-center rounded-md border border-line-soft bg-ink-900/70 focus-within:border-iris-400/60">
                <span
                  aria-hidden
                  className="pl-3 font-mono text-[13px] text-muted-500"
                >
                  prsme.app/u/
                </span>
                <input
                  id="username"
                  name="username"
                  type="text"
                  defaultValue={values?.username}
                  required
                  minLength={USERNAME_MIN}
                  maxLength={USERNAME_MAX}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  pattern="[a-z0-9_-]+"
                  placeholder="yourname"
                  aria-invalid={state?.field === "username" ? true : undefined}
                  aria-describedby="username-hint"
                  data-testid="onboarding-username"
                  className="w-full bg-transparent px-1 py-2.5 text-[14px] text-muted-50 placeholder:text-muted-500 focus:outline-none"
                />
              </div>
              <p id="username-hint" className="mt-1.5 text-[12px] text-muted-400">
                {USERNAME_MIN}–{USERNAME_MAX} characters. Lowercase letters,
                numbers, underscore, and hyphen.
              </p>
            </div>

            <div>
              <label
                htmlFor="bio"
                className="block text-[12px] font-medium tracking-wide text-muted-200"
              >
                Bio <span className="text-muted-500">(optional)</span>
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                defaultValue={values?.bio}
                maxLength={400}
                placeholder="A line or two about you"
                data-testid="onboarding-bio"
                className="mt-1.5 w-full resize-y rounded-md border border-line-soft bg-ink-900/70 px-3 py-2.5 text-[14px] text-muted-50 placeholder:text-muted-500 focus:border-iris-400/60 focus:outline-none"
              />
            </div>

            <fieldset>
              <legend className="text-[12px] font-medium tracking-wide text-muted-200">
                Who can see it?
              </legend>
              <div className="mt-2 space-y-2">
                {(
                  [
                    {
                      value: "private",
                      label: "Private",
                      help: "Only you. You can publish later from the Studio.",
                    },
                    {
                      value: "public",
                      label: "Public",
                      help: "Anyone with the link can view your profile.",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-line-soft bg-ink-900/50 px-3 py-2.5 transition-colors hover:border-line-strong"
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={option.value}
                      defaultChecked={option.value === "private"}
                      className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-400)]"
                      data-testid={`onboarding-visibility-${option.value}`}
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
            </fieldset>

            {hasGuestDraft ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-iris-400/30 bg-iris-400/8 px-3 py-3">
                <input
                  type="checkbox"
                  checked={importDraft}
                  onChange={(e) => setImportDraft(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-400)]"
                  data-testid="onboarding-import-draft"
                />
                <span>
                  <span className="block text-[13px] text-muted-100">
                    Use the profile I already customized as a guest
                  </span>
                  <span className="block text-[12px] leading-relaxed text-muted-400">
                    Copies the shelves, links, and appearance you built in the
                    Studio on this device. Leave this off for a blank profile —
                    nothing of Noir&apos;s demo content is ever copied.
                  </span>
                </span>
              </label>
            ) : null}

            {importDraft && draftJson ? (
              // Carried as a hidden field so the server receives it with the
              // form. Validated server-side by `readDraft` before use.
              <input type="hidden" name="guestDraft" value={draftJson} readOnly />
            ) : null}

            <OnboardingSubmit pending={pending} />

            <p className="text-[12px] leading-relaxed text-muted-400">
              Already have a profile?{" "}
              <Link
                href="/studio"
                className="text-iris-300 underline underline-offset-4"
              >
                Open your studio
              </Link>
              .
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

/**
 * Submit button wired to the enclosing form's pending state.
 *
 * `useFormStatus` must live in a CHILD of the `<form>` — reading it in the
 * same component that renders the form returns the parent's status, which is
 * never pending, so the button would never disable and a double-click could
 * submit twice.
 */
function OnboardingSubmit({ pending }: { pending: boolean }) {
  const { pending: formPending } = useFormStatus();
  const busy = pending || formPending;

  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      data-testid="onboarding-submit"
      className="inline-flex h-11 w-full items-center justify-center rounded-md bg-iris-400 px-4 text-sm font-medium text-ink-950 transition-transform duration-200 ease-soft hover:-translate-y-0.5 hover:bg-iris-300 disabled:pointer-events-none disabled:opacity-50"
    >
      {busy ? "Creating profile…" : "Create my profile"}
    </button>
  );
}