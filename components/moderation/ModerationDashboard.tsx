"use client";

/**
 * The moderation dashboard.
 *
 * A queue of reports, the actions a moderator can take, and the audit trail
 * behind them.
 *
 * EVERY CONSEQUENTIAL ACTION ASKS FIRST
 *
 * A dismissal, a resolution, a comment removal, a restriction — each one asks
 * for a reason, and each one asks for confirmation before it is sent. A
 * moderation system whose actions are one careless click away is a moderation
 * system that will be misused, whether by a moderator in a hurry or by
 * somebody who has found a way to drive the interface.
 *
 * THE REPORTER IS NEVER SHOWN
 *
 * The queue says what was reported and what it is about. It does not say who
 * filed it, and there is no field in the response for it — the reporter's
 * identity is not something this interface can leak, because it never
 * receives it.
 *
 * THE REPORTED ACCOUNT NEVER SEES THIS
 *
 * The page is behind a server-side moderator check, and so is every action.
 * A reported account cannot learn that it was reported from here.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { REPORT_REASONS } from "@/lib/supabase/socialConstants";

/** One report in the queue, as the dashboard renders it. */
export interface QueueReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  commentId: string | null;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedTo: string | null;
  assignedToUsername: string | null;
  moderatorNote: string | null;
  subjectUsername: string | null;
  subjectDisplayName: string | null;
  subjectCommentBody: string | null;
  subjectCommentAuthorUsername: string | null;
  subjectCommentProfileUsername: string | null;
}

/** One action in a report's history. */
export interface HistoryEntry {
  id: string;
  moderatorId: string;
  moderatorUsername: string | null;
  action: string;
  targetUserId: string | null;
  targetCommentId: string | null;
  reason: string | null;
  statusAfter: string | null;
  createdAt: string;
}

/** One audit record. */
export interface AuditEntry {
  id: string;
  moderatorId: string;
  moderatorUsername: string | null;
  action: string;
  reportId: string | null;
  targetUserId: string | null;
  targetCommentId: string | null;
  note: string | null;
  createdAt: string;
}

/** A restriction in force. */
export interface RestrictionEntry {
  id: string;
  userId: string;
  username: string | null;
  reportId: string | null;
  scope: string;
  reason: string;
  appliedBy: string | null;
  appliedAt: string;
  expiresAt: string | null;
}

export interface ModerationDashboardProps {
  initialReports: QueueReport[];
  initialTotal: number;
  initialCounts: Record<string, number>;
  initialNextOffset: number | null;
  initialRestrictions: RestrictionEntry[];
  initialModerators: Array<{
    userId: string;
    username: string | null;
    grantedAt: string;
    note: string | null;
  }>;
}

/* -------------------------------------------------------------------------- */
/*                                   Labels                                    */
/* -------------------------------------------------------------------------- */

/** The dashboard's four tabs, over the database's four statuses. */
const STATUS_TABS: Array<{ id: string; label: string; status: string | null }> = [
  { id: "all", label: "All", status: null },
  { id: "open", label: "Pending", status: "open" },
  { id: "reviewed", label: "Under review", status: "reviewed" },
  { id: "actioned", label: "Resolved", status: "actioned" },
  { id: "dismissed", label: "Dismissed", status: "dismissed" },
];

/** The human label for each report reason. */
const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate speech",
  sexual: "Unwanted sexual content",
  violence: "Violence or threats",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  other: "Something else",
};

/** The human label for each moderation action. */
const ACTION_LABELS: Record<string, string> = {
  claimed: "Claimed",
  under_review: "Moved under review",
  dismissed: "Dismissed",
  resolved: "Resolved",
  comment_removed: "Comment removed",
  account_restricted: "Account restricted",
  restriction_lifted: "Restriction lifted",
  comment_restored: "Comment restored",
};

/** The human label for each status. */
const STATUS_LABELS: Record<string, string> = {
  open: "Pending",
  reviewed: "Under review",
  actioned: "Resolved",
  dismissed: "Dismissed",
};

/**
 * A relative time, in the compact form a queue wants.
 *
 * The same shape the notification centre uses, so the two read alike.
 */
function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/*                                 The dashboard                               */
/* -------------------------------------------------------------------------- */

export function ModerationDashboard({
  initialReports,
  initialTotal,
  initialCounts,
  initialNextOffset,
  initialRestrictions,
  initialModerators,
}: ModerationDashboardProps) {
  const [reports, setReports] = useState<QueueReport[]>(initialReports);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState(initialCounts);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [restrictions, setRestrictions] = useState<RestrictionEntry[]>(
    initialRestrictions,
  );

  const [tab, setTab] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState<string>("");

  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /*
   * The pending action, and the reason for it.
   *
   * The confirmation dialog is not a browser `confirm()`: it is a panel with a
   * reason field, because the reason is REQUIRED by the database and a
   * browser dialog cannot collect one.
   */
  const [pendingAction, setPendingAction] = useState<{
    kind: string;
    label: string;
    reportId?: string;
    commentId?: string;
    username?: string;
    restrictionId?: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState<string>("");
  const [actionDays, setActionDays] = useState<string>("");

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selected) ?? null,
    [reports, selected],
  );

  /* ---------------------------------------------------------------------- */
  /*                              Loading                                    */
  /* ---------------------------------------------------------------------- */

  const loadQueue = useCallback(
    async (options: { append?: boolean } = {}) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      const status = STATUS_TABS.find((entry) => entry.id === tab)?.status;
      if (status) params.append("status", status);
      if (reasonFilter) params.append("reason", reasonFilter);
      if (appliedSearch) params.append("search", appliedSearch);
      if (options.append && nextOffset !== null) {
        params.append("offset", String(nextOffset));
      }

      try {
        const response = await fetch(`/api/moderation?${params.toString()}`);
        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          reports?: QueueReport[];
          total?: number;
          counts?: Record<string, number>;
          nextOffset?: number | null;
        };

        if (!payload.ok) {
          setError(payload.error ?? "The queue could not be loaded.");
          return;
        }

        const loaded = payload.reports ?? [];

        setReports((current) =>
          options.append ? [...current, ...loaded] : loaded,
        );
        setTotal(payload.total ?? loaded.length);
        if (payload.counts) setCounts(payload.counts);
        setNextOffset(payload.nextOffset ?? null);
      } catch {
        setError("The queue could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [tab, reasonFilter, appliedSearch, nextOffset],
  );

  /* ---------------------------------------------------------------------- */
  /*                              The history                                */
  /* ---------------------------------------------------------------------- */

  const openReport = useCallback(async (reportId: string) => {
    setSelected(reportId);
    setError(null);

    try {
      const response = await fetch(`/api/moderation/report?id=${reportId}`);
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        actions?: HistoryEntry[];
        audit?: AuditEntry[];
        restrictions?: RestrictionEntry[];
      };

      if (!payload.ok) {
        setError(payload.error ?? "The history could not be loaded.");
        return;
      }

      setHistory(payload.actions ?? []);
      setAudit(payload.audit ?? []);
      if (payload.restrictions) setRestrictions(payload.restrictions);
    } catch {
      setError("The history could not be loaded.");
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /*                              The actions                                */
  /* ---------------------------------------------------------------------- */

  async function performAction() {
    if (!pendingAction) return;

    if (!actionReason.trim()) {
      setError("A reason is required.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const body: Record<string, unknown> = {
      action: pendingAction.kind,
      reason: actionReason.trim(),
    };

    if (pendingAction.reportId) body.reportId = pendingAction.reportId;
    if (pendingAction.commentId) body.commentId = pendingAction.commentId;
    if (pendingAction.username) body.username = pendingAction.username;
    if (pendingAction.restrictionId) {
      body.restrictionId = pendingAction.restrictionId;
    }
    if (pendingAction.kind === "restrict" && actionDays.trim()) {
      body.days = Number.parseInt(actionDays.trim(), 10);
    }

    try {
      const response = await fetch("/api/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (!payload.ok) {
        setError(payload.error ?? "That action could not be completed.");
        return;
      }

      setNotice(`${pendingAction.label} — done.`);
      setPendingAction(null);
      setActionReason("");
      setActionDays("");

      await loadQueue();

      if (selected) await openReport(selected);
    } catch {
      setError("That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * Prepare an action for confirmation.
   *
   * The subject of an action is named by the action itself: a report id for
   * the report actions, a comment id for the comment actions, a username for
   * a restriction, and a restriction id for lifting one. The subject travels
   * with the pending action, so the confirmation panel knows what it is
   * confirming and the request carries the right id.
   */
  function ask(
    kind: string,
    label: string,
    subject?: {
      reportId?: string;
      commentId?: string;
      username?: string;
      restrictionId?: string;
    },
  ) {
    setError(null);
    setNotice(null);
    setActionReason("");
    setActionDays("");
    setPendingAction({
      kind,
      label,
      reportId: subject?.reportId,
      commentId: subject?.commentId,
      username: subject?.username,
      restrictionId: subject?.restrictionId,
    });
  }

  /* ---------------------------------------------------------------------- */
  /*                               The render                                */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="moderation-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-iris-300">
            Moderation
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight text-muted-50">
            The queue
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-300">
            Reports filed by people. A report is an allegation, not a finding —
            nothing happens to an account because a report exists, only because
            a moderator decided it should.
          </p>
        </div>
      </div>

      {/* The counts. */}
      <dl
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="moderation-counts"
      >
        {STATUS_TABS.filter((entry) => entry.status).map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-line-soft bg-ink-800/30 px-4 py-3"
          >
            <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
              {entry.label}
            </dt>
            <dd className="mt-1 font-display text-2xl text-muted-50">
              {counts[entry.status as string] ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      {/* The filters. */}
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Report status" className="flex flex-wrap gap-2">
          {STATUS_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => {
                setTab(entry.id);
                setNextOffset(null);
              }}
              data-testid={`moderation-tab-${entry.id}`}
              className={
                tab === entry.id
                  ? "rounded-md border border-iris-400/50 bg-iris-400/10 px-3 py-1.5 text-[12px] font-medium text-muted-50"
                  : "rounded-md border border-line-soft px-3 py-1.5 text-[12px] text-muted-400 transition-colors hover:text-muted-50"
              }
            >
              {entry.label}
              {entry.status ? ` (${counts[entry.status] ?? 0})` : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-end gap-3">
          <div className="min-w-0">
            <label
              htmlFor="moderation-reason-filter"
              className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400"
            >
              Reason
            </label>
            <select
              id="moderation-reason-filter"
              value={reasonFilter}
              onChange={(event) => {
                setReasonFilter(event.target.value);
                setNextOffset(null);
              }}
              data-testid="moderation-reason-filter"
              className="mt-1.5 rounded-md border border-line-strong bg-ink-900/60 px-3 py-2 text-[13px] text-muted-50 focus:border-iris-400/50 focus:outline-none"
            >
              <option value="">Every reason</option>
              {REPORT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <form
            className="flex min-w-0 flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
              setNextOffset(null);
            }}
          >
            <div className="min-w-0 flex-1">
              <label
                htmlFor="moderation-search"
                className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400"
              >
                Report id or username
              </label>
              <input
                id="moderation-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. 3f2a… or noir"
                data-testid="moderation-search"
                className="mt-1.5 w-full min-w-0 rounded-md border border-line-strong bg-ink-900/60 px-3 py-2 text-[13px] text-muted-50 placeholder:text-muted-400 focus:border-iris-400/50 focus:outline-none sm:w-56 sm:flex-none"
              />
            </div>
            <button
              type="submit"
              data-testid="moderation-search-submit"
              className="rounded-md border border-line-strong px-3 py-2 text-[13px] text-muted-100 transition-colors hover:border-iris-400/40"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 text-[13px] text-[#E8A0A4]"
          data-testid="moderation-error"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-5 text-[13px] text-emerald-200"
          data-testid="moderation-notice"
        >
          {notice}
        </p>
      ) : null}

      {/* The queue. */}
      {reports.length === 0 ? (
        <div
          className="mt-8 rounded-lg border border-line-soft bg-ink-800/40 p-8 text-center"
          data-testid="moderation-empty"
        >
          <p className="font-display text-xl text-muted-50">Nothing here.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-400">
            No report matches these filters.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2" data-testid="moderation-queue">
          {reports.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                onClick={() => void openReport(report.id)}
                data-testid="moderation-report-row"
                className="w-full rounded-lg border border-line-soft bg-ink-800/25 p-4 text-left transition-colors hover:border-iris-400/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-muted-100">
                    {REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <span className="text-[12px] text-muted-400">
                    {STATUS_LABELS[report.status] ?? report.status}
                  </span>
                  <span className="text-[12px] text-muted-400">
                    · {formatTime(report.createdAt)}
                  </span>
                  {report.assignedToUsername ? (
                    <span className="text-[12px] text-muted-400">
                      · @{report.assignedToUsername}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-[14px] text-muted-50">
                  {report.subjectUsername
                    ? `@${report.subjectUsername}`
                    : report.subjectCommentProfileUsername
                      ? `comment on @${report.subjectCommentProfileUsername}`
                      : "an unknown subject"}
                </p>

                {report.subjectCommentBody ? (
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-300">
                    &ldquo;{report.subjectCommentBody}&rdquo;
                  </p>
                ) : null}

                {report.details ? (
                  <p className="mt-1 text-[13px] text-muted-400">
                    {report.details}
                  </p>
                ) : null}

                <p className="mt-2 font-mono text-[11px] text-muted-400">
                  {report.id}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nextOffset !== null ? (
        <button
          type="button"
          onClick={() => void loadQueue({ append: true })}
          disabled={loading}
          data-testid="moderation-load-more"
          className="mt-6 text-[13px] text-iris-300 underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more reports"}
        </button>
      ) : null}

      <p className="mt-6 text-[12px] text-muted-400">
        Showing {reports.length} of {total} reports.
      </p>

      {/* The report's details. */}
      {selectedReport ? (
        <section
          className="mt-12 rounded-lg border border-line-soft bg-ink-800/25 p-5"
          aria-labelledby="moderation-detail-heading"
          data-testid="moderation-detail"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="moderation-detail-heading"
                className="font-display text-2xl text-muted-50"
              >
                Report {selectedReport.id.slice(0, 8)}
              </h2>
              <p className="mt-1 text-[13px] text-muted-400">
                {REASON_LABELS[selectedReport.reason] ?? selectedReport.reason} ·
                filed {formatTime(selectedReport.createdAt)} ·{" "}
                {STATUS_LABELS[selectedReport.status] ?? selectedReport.status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              data-testid="moderation-detail-close"
              className="text-[12px] text-muted-400 underline underline-offset-4"
            >
              Close
            </button>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
                Reported profile
              </dt>
              <dd className="mt-1 text-[13px] text-muted-50">
                {selectedReport.subjectUsername
                  ? `@${selectedReport.subjectUsername}`
                  : "—"}
                {selectedReport.subjectDisplayName
                  ? ` · ${selectedReport.subjectDisplayName}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
                Reported comment
              </dt>
              <dd className="mt-1 text-[13px] text-muted-50">
                {selectedReport.subjectCommentBody ? (
                  <>
                    &ldquo;{selectedReport.subjectCommentBody}&rdquo;
                    {selectedReport.subjectCommentAuthorUsername
                      ? ` — @${selectedReport.subjectCommentAuthorUsername}`
                      : ""}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
                Reporter&apos;s note
              </dt>
              <dd className="mt-1 text-[13px] text-muted-50">
                {selectedReport.details ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
                Assigned to
              </dt>
              <dd className="mt-1 text-[13px] text-muted-50">
                {selectedReport.assignedToUsername
                  ? `@${selectedReport.assignedToUsername}`
                  : "nobody"}
              </dd>
            </div>
          </dl>

          {selectedReport.moderatorNote ? (
            <p className="mt-4 text-[13px] text-muted-300">
              Moderator note: {selectedReport.moderatorNote}
            </p>
          ) : null}

          {/* The actions. */}
          <div
            className="mt-6 flex flex-wrap gap-2"
            data-testid="moderation-actions"
          >
            <button
              type="button"
              onClick={() =>
                ask("claim", "Claimed", {
                  reportId: selectedReport.id,
                })
              }
              data-testid="moderation-claim"
              className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
            >
              Claim
            </button>
            <button
              type="button"
              onClick={() =>
                ask("under_review", "Moved under review", {
                  reportId: selectedReport.id,
                })
              }
              data-testid="moderation-under-review"
              className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
            >
              Under review
            </button>
            <button
              type="button"
              onClick={() =>
                ask("dismiss", "Dismissed", {
                  reportId: selectedReport.id,
                })
              }
              data-testid="moderation-dismiss"
              className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() =>
                ask("resolve", "Resolved", {
                  reportId: selectedReport.id,
                })
              }
              data-testid="moderation-resolve"
              className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
            >
              Resolve
            </button>
            {selectedReport.commentId ? (
              <button
                type="button"
                onClick={() =>
                  ask("remove_comment", "Comment removed", {
                    reportId: selectedReport.id,
                    commentId: selectedReport.commentId ?? undefined,
                  })
                }
                data-testid="moderation-remove-comment"
                className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
              >
                Remove comment
              </button>
            ) : null}
            {selectedReport.subjectUsername ? (
              <button
                type="button"
                onClick={() =>
                  ask("restrict", "Account restricted", {
                    reportId: selectedReport.id,
                    username: selectedReport.subjectUsername ?? undefined,
                  })
                }
                data-testid="moderation-restrict"
                className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
              >
                Restrict account
              </button>
            ) : null}
          </div>

          {/* The confirmation panel. */}
          {pendingAction ? (
            <div
              className="mt-5 rounded-md border border-iris-400/30 bg-ink-900/60 p-4"
              role="dialog"
              aria-labelledby="moderation-confirm-heading"
              data-testid="moderation-confirm"
            >
              <h3
                id="moderation-confirm-heading"
                className="text-[14px] font-medium text-muted-50"
              >
                {pendingAction.label}?
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-400">
                This is recorded in the audit log with your name and this
                reason. It cannot be edited afterwards.
              </p>

              <label
                htmlFor="moderation-action-reason"
                className="mt-4 block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400"
              >
                Reason (required)
              </label>
              <textarea
                id="moderation-action-reason"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                rows={3}
                data-testid="moderation-action-reason"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-ink-950/60 px-3 py-2 text-[13px] text-muted-50 focus:border-iris-400/50 focus:outline-none"
              />

              {pendingAction.kind === "restrict" ? (
                <>
                  <label
                    htmlFor="moderation-action-days"
                    className="mt-3 block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400"
                  >
                    Days (blank means no expiry)
                  </label>
                  <input
                    id="moderation-action-days"
                    type="number"
                    min={1}
                    max={3650}
                    value={actionDays}
                    onChange={(event) => setActionDays(event.target.value)}
                    data-testid="moderation-action-days"
                    className="mt-1.5 w-40 rounded-md border border-line-strong bg-ink-950/60 px-3 py-2 text-[13px] text-muted-50 focus:border-iris-400/50 focus:outline-none"
                  />
                </>
              ) : null}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void performAction()}
                  disabled={busy}
                  data-testid="moderation-confirm-submit"
                  className="rounded-md bg-iris-400 px-4 py-2 text-[13px] font-medium text-ink-950 transition-opacity disabled:opacity-50"
                >
                  {busy ? "Working…" : `Yes, ${pendingAction.label.toLowerCase()}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction(null);
                    setActionReason("");
                  }}
                  data-testid="moderation-confirm-cancel"
                  className="text-[13px] text-muted-300 underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* The history. */}
          <div className="mt-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
              Moderation history
            </h3>
            {history.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-400">
                Nothing has been done about this report yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2" data-testid="moderation-history">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-line-soft px-3 py-2"
                  >
                    <p className="text-[13px] text-muted-50">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {entry.moderatorUsername
                        ? ` by @${entry.moderatorUsername}`
                        : ""}
                    </p>
                    {entry.reason ? (
                      <p className="mt-1 text-[13px] text-muted-300">
                        {entry.reason}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-muted-400">
                      {formatTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The audit trail. */}
          <div className="mt-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-400">
              Audit trail
            </h3>
            {audit.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-400">
                No audit records yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1" data-testid="moderation-audit">
                {audit.map((entry) => (
                  <li key={entry.id} className="text-[12px] text-muted-400">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {entry.moderatorUsername
                      ? ` by @${entry.moderatorUsername}`
                      : ""}
                    {entry.note ? ` — ${entry.note}` : ""} ·{" "}
                    {formatTime(entry.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {/* The restrictions in force. */}
      <section className="mt-12" aria-labelledby="moderation-restrictions-heading">
        <h2
          id="moderation-restrictions-heading"
          className="font-display text-2xl text-muted-50"
        >
          Restrictions in force
        </h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-400">
          A restriction limits an account from commenting on other people&apos;s
          profiles. It is not a ban: the account keeps its profile, its
          followers and its content.
        </p>

        {restrictions.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted-400">
            No account is restricted.
          </p>
        ) : (
          <ul className="mt-4 space-y-2" data-testid="moderation-restrictions">
            {restrictions.map((restriction) => (
              <li
                key={restriction.id}
                className="rounded-lg border border-line-soft bg-ink-800/25 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] text-muted-50">
                      {restriction.username
                        ? `@${restriction.username}`
                        : "an account"}
                    </p>
                    <p className="mt-1 text-[13px] text-muted-300">
                      {restriction.reason}
                    </p>
                    <p className="mt-1 text-[12px] text-muted-400">
                      Applied by {restriction.appliedBy ?? "a moderator"} ·{" "}
                      {formatTime(restriction.appliedAt)}
                      {restriction.expiresAt
                        ? ` · expires ${formatTime(restriction.expiresAt)}`
                        : " · no expiry"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      ask("lift_restriction", "Restriction lifted", {
                        restrictionId: restriction.id,
                      })
                    }
                    data-testid="moderation-lift-restriction"
                    className="rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-muted-100 transition-colors hover:border-iris-400/40"
                  >
                    Lift
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The roster. */}
      <section className="mt-12" aria-labelledby="moderation-roster-heading">
        <h2
          id="moderation-roster-heading"
          className="font-display text-2xl text-muted-50"
        >
          Moderators
        </h2>
        <ul className="mt-4 space-y-1" data-testid="moderation-roster">
          {initialModerators.map((moderator) => (
            <li key={moderator.userId} className="text-[13px] text-muted-300">
              {moderator.username ? `@${moderator.username}` : "an account"}
              {moderator.note ? ` — ${moderator.note}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12">
        <Link
          href="/account"
          className="text-[13px] text-iris-300 underline underline-offset-4"
        >
          Back to account settings
        </Link>
      </p>
    </div>
  );
}
