/**
 * Supabase configuration.
 *
 * PRSME must build and render with **no** Supabase project configured — the
 * demo profile at `/u/noir`, the Studio, and every existing test depend on
 * that. So configuration is a *runtime value* here, never a module-level
 * `createClient(url, key)` call that would throw or produce a half-built
 * client when the variables are absent.
 *
 * Only the publishable (anon) key is ever referenced. The service-role key is
 * never read in application code: it must not reach a client bundle, and
 * ordinary operations are scoped by RLS policies instead.
 */

/** The two variables the app needs, with the names the Supabase docs use. */
export const SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type SupabaseEnvKey = (typeof SUPABASE_ENV_KEYS)[number];

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

function readEnv(): Record<string, string | undefined> {
  // `process.env` is read through the `NEXT_PUBLIC_` indirection on purpose:
  // Next.js inlines these statically at build time, so a dynamic property
  // access like `process.env[name]` would be `undefined` in the browser
  // bundle. Every key is therefore named literally at the point of use.
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * Read the Supabase environment, returning `null` when it is not usable.
 *
 * A value that is present but empty (or only whitespace) counts as missing:
 * an empty `.env.local` line is a common way to end up with a URL of `""`,
 * which Supabase's client constructor would otherwise accept and then fail on
 * at the first network call with an opaque error.
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return null;

  // A malformed URL produces a client that fails on first use with a message
  // that points at the request rather than at the configuration. Reject it
  // here so the failure is reported as a configuration problem.
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return null;
  }

  return { url, publishableKey };
}

/** True when both variables are set and parseable. */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}

/**
 * A copy-pasteable setup message.
 *
 * Shown by every auth surface when configuration is missing, so a developer
 * who has not connected a project gets instructions rather than a stack
 * trace from a half-initialised client.
 */
export function supabaseSetupMessage(): string {
  return [
    "Supabase is not configured.",
    "",
    "Create a .env.local in the project root with:",
    "",
    "  NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co",
    "  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>",
    "",
    "Then apply the migrations in supabase/migrations/ to your project.",
    "The demo profile at /u/noir works without any of this.",
  ].join("\n");
}

/**
 * Thrown by server-only code paths when Supabase is required but missing.
 *
 * Deliberately a distinct class from a generic Error: callers that can
 * degrade gracefully (rendering the demo) catch it and fall back, while a
 * caller that genuinely needs the database lets it surface.
 */
export class SupabaseNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? supabaseSetupMessage());
    this.name = "SupabaseNotConfiguredError";
  }
}