"use client";

/**
 * The safety controls on a profile: block, unblock, and report.
 *
 * A BLOCK IS ONE-DIRECTIONAL AND IT NEVER ANNOUNCISES ITSELF.
 *
 * The blocked account is not told, cannot see that the block exists, and is
 * never shown a "you are blocked" notice. The only place the word appears is
 * the blocker's own view, and only because they are the one who did it.
 *
 * A REPORT is filed against a comment or a profile and stored for a future
 * moderation queue. Nothing happens to the reported account automatically.
 */

import { useState } from "react";
import { REPORT_REASONS } from "@/lib/supabase/socialConstants";

export interface SafetyControlsProps {
  /** The profile's username. */
  username: string;
  /** Whether the signed-in visitor has blocked this account. */
  blocked: boolean;
}

export function SafetyControls({ username, blocked }: SafetyControlsProps) {
  const [isBlocked, setIsBlocked] = useState(blocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);

  async function toggleBlock() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/blocks?username=${encodeURIComponent(username)}`,
        { method: isBlocked ? "DELETE" : "POST" },
      );
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "That could not be saved.");
        return;
      }
      setIsBlocked(!isBlocked);
      setNotice(isBlocked ? "Unblocked." : "Blocked.");
    } catch {
      setError("That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, reason }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "The report could not be filed.");
        return;
      }
      setReporting(false);
      setNotice("Reported. Thank you.");
    } catch {
      setError("The report could not be filed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4" data-testid="safety-controls">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void toggleBlock()}
          disabled={busy}
          data-testid="block-toggle"
          aria-label={isBlocked ? `Unblock ${username}` : `Block ${username}`}
          className="pf-meta underline underline-offset-4 transition-colors hover:text-muted-50 disabled:opacity-50"
        >
          {isBlocked ? "Unblock" : "Block"}
        </button>

        <button
          type="button"
          onClick={() => setReporting((value) => !value)}
          disabled={busy}
          data-testid="report-toggle"
          aria-label={`Report ${username}`}
          className="pf-meta underline underline-offset-4 transition-colors hover:text-muted-50 disabled:opacity-50"
        >
          Report
        </button>
      </div>

      {reporting ? (
        <div className="mt-3" data-testid="report-form">
          <label htmlFor="report-reason" className="pf-meta block">
            What&apos;s wrong with this profile?
          </label>
          <select
            id="report-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            data-testid="report-reason"
            className="pf-body mt-1.5 w-full max-w-xs rounded-md border border-line-strong bg-ink-900/60 px-3 py-2 text-[13px] text-muted-50 focus:border-iris-400/50 focus:outline-none"
          >
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_LABELS[value]}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submitReport()}
              disabled={busy}
              data-testid="report-submit"
              className="pf-btn-primary inline-flex h-8 items-center rounded-md bg-iris-400 px-3 text-[12px] font-medium text-ink-950 disabled:opacity-50"
            >
              Send report
            </button>
            <button
              type="button"
              onClick={() => setReporting(false)}
              data-testid="report-cancel"
              className="pf-meta underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="pf-meta mt-2 text-[#E8A0A4]" data-testid="safety-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="pf-meta mt-2 text-emerald-200" data-testid="safety-notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** The human label for each report reason. */
const REPORT_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate speech",
  sexual: "Unwanted sexual content",
  violence: "Violence or threats",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  other: "Something else",
};
