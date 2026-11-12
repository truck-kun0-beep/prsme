/**
 * The CLIENT-SAFE constants of the social layer.
 *
 * WHY THIS FILE EXISTS
 *
 * `reports.ts` and `comments.ts` are server modules: they read the session and
 * they talk to the database, so they import `getServerClient` — and that
 * imports `next/headers`. A client component that imports ANY value from
 * those modules drags `next/headers` into the browser bundle, and the build
 * fails with:
 *
 *   You're importing a component that needs "next/headers". That only works
 *   in a Server Component which is not supported in the pages/ directory.
 *
 * The constants below are the part the browser legitimately needs — the
 * report reasons, the comment length cap — and they carry no server
 * dependency at all. They live here, and the two server modules re-export
 * them, so there is exactly ONE definition of each and the client imports a
 * module that cannot reach the server.
 */

/* -------------------------------------------------------------------------- */
/*                                   Reports                                   */
/* -------------------------------------------------------------------------- */

/** The reasons a report may be filed for. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "misinformation",
  "impersonation",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** The maximum length of the free-text details. */
export const REPORT_DETAILS_MAX = 1_000;

/**
 * Is this a reason a report may be filed for?
 *
 * The database has the same CHECK constraint, so this is a courtesy that
 * turns a constraint violation into a sentence.
 */
export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Comments                                   */
/* -------------------------------------------------------------------------- */

/** The maximum length of a comment body. */
export const COMMENT_MAX = 1_000;

/** The page size used by the comment list. */
export const COMMENT_PAGE_SIZE = 20;
