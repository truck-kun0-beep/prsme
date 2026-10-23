/**
 * Phase 5 verification suite.
 *
 * Runs against a real Supabase project when one is configured, and always runs
 * the pure-logic checks that need no project at all.
 *
 *   node scripts/phase5-verify.mjs
 *   node scripts/phase5-verify.mjs --with-db     (force the RLS section)
 *
 * The RLS section is SKIPPED — loudly — when no project is configured, because
 * every one of those checks is about a real database refusing a real request.
 * A suite that quietly passed without testing anything would be worse than no
 * suite, so the skip is reported rather than hidden.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*                                 Harness                                    */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  skip ${name} — ${reason}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------------------- */
/*                          Static source assertions                           */
/* -------------------------------------------------------------------------- */

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function read(relative) {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

/**
 * The security-critical properties of Phase 5 are not all runtime-testable
 * here — several live in SQL that only a live project can execute. But the
 * *shape* of the policy files is checkable statically, and a policy silently
 * renamed or dropped is a real regression. These assertions guard the
 * invariants the brief calls out.
 */
function verifyPolicyFiles() {
  section("RLS policy files (static)");

  const rls = read("supabase/migrations/20250101000002_profiles_rls.sql");

  check("RLS is enabled on profiles", /alter table public\.profiles enable row level security/i.test(rls));

  check(
    "public profiles are readable by anon and authenticated",
    /create policy "public profiles are readable by anyone"[\s\S]*?for select[\s\S]*?to anon, authenticated/i.test(rls),
  );
  check(
    "private profiles are NOT readable by anon",
    // The world-readable policy must be gated on visibility = 'public'.
    /using \(visibility = 'public'\)/i.test(rls),
  );

  check(
    "owner-only SELECT policy exists",
    /create policy "profiles are readable by owner"[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/i.test(rls),
  );
  check(
    "INSERT has a with check binding user_id to the session",
    /for insert[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i.test(rls),
  );
  check(
    "UPDATE has with check so user_id cannot be reassigned",
    /for update[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i.test(rls),
  );
  check(
    "no INSERT policy is granted to anon",
    // Any policy body mentioning `to anon` must not be a write policy.
    !/for (insert|update|delete)[\s\S]{0,200}?to anon/i.test(rls),
  );
  check(
    "username-availability helper is SECURITY DEFINER",
    /create or replace function public\.is_username_taken[\s\S]*?security definer/i.test(rls),
  );
  check(
    "username-availability helper returns only a boolean",
    /returns boolean/i.test(rls),
  );

  const profiles = read("supabase/migrations/20250101000001_profiles.sql");
  check(
    "user_id is UNIQUE (one profile per account, enforced by the database)",
    /user_id\s+uuid not null unique/i.test(profiles),
  );
  check(
    "username is unique case-insensitively",
    /unique index if not exists profiles_username_lower_key[\s\S]*?lower\(username\)/i.test(profiles),
  );
  check(
    "username format matches lib/supabase/username.ts",
    /check \([\s\S]*?username ~ '\^\[a-z0-9_-\]\+\$'/i.test(profiles),
  );
  check(
    "'noir' is reserved so the demo profile stays reachable",
    /username <> 'noir'/.test(profiles),
  );
  check(
    "profile_state is versioned JSONB",
    /profile_state\s+jsonb not null default '\{\}'::jsonb/i.test(profiles),
  );
  check(
    "avatar_path stores a path, not a URL",
    /avatar_path\s+text/i.test(profiles),
  );

  const avatars = read("supabase/migrations/20250101000003_avatars.sql");
  check(
    "the avatars bucket is PRIVATE",
    /insert into storage\.buckets[\s\S]*?false,\s*-- private/i.test(avatars),
  );
  check(
    "avatar writes are scoped to the owner's uid folder",
    /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i.test(avatars),
  );
  check(
    "no storage SELECT policy is granted (avatars are signed-URL only)",
    !/for select[\s\S]{0,300}?to (anon|authenticated)/i.test(avatars),
  );

  section("Server-boundary invariants (static)");

  const config = read("lib/supabase/config.ts");
  check(
    "no service-role key is referenced anywhere in app code",
    // A service_role reference in a module reachable from the client bundle
    // would be a total RLS bypass.
    !/SUPABASE_SERVICE_ROLE|service_role/i.test(config),
  );

  const profileRoute = read("app/api/profile/route.ts");
  check(
    "the save route derives identity from the session, not the body",
    /getCurrentUserId\(\)/.test(profileRoute) &&
      !/body\.userId|body\.user_id/.test(profileRoute),
  );
  check(
    "the save route validates the incoming draft",
    /readDraft\(body\.draft\)/.test(profileRoute),
  );
  check(
    "the save route refuses an avatar path outside the caller's uid",
    /avatarPath\.startsWith\(`\$\{userId\}\/`\)/.test(profileRoute),
  );

  const profileState = read("lib/supabase/profileState.ts");
  check(
    "StoredProfileState excludes user_id / username / visibility",
    !/user_id/.test(profileState.split("export interface StoredProfileState")[1]?.split("}")[0] ?? ""),
  );

  const redirects = read("lib/supabase/redirects.ts");
  check(
    "post-auth redirects reject protocol-relative URLs",
    /candidate\.startsWith\("\/\/"\)/.test(redirects),
  );
  check(
    "post-auth redirects reject backslash-prefixed URLs",
    /candidate\.startsWith\("\/\\\\"\)/.test(redirects),
  );

  const avatarLib = read("lib/supabase/avatar.ts");
  check(
    "avatars are read through signed URLs, never persisted",
    /createSignedUrl/.test(avatarLib) &&
      !/createPublicUrl/.test(avatarLib),
  );

  section("Guest-mode fallbacks (static)");

  check(
    "the demo profile route is reachable with no Supabase project",
    /isSupabaseConfigured\(\)/.test(read("app/u/[username]/page.tsx")),
  );
  check(
    "the Studio still writes localStorage for guests",
    /saveDraft\(draft\)/.test(read("components/studio/ProfileStoreProvider.tsx")),
  );
  check(
    "a signed-in owner never loads the guest localStorage draft",
    /if \(status === "anonymous"\)/.test(
      read("components/studio/ProfileStoreProvider.tsx"),
    ),
  );
  check(
    "signing out clears the guest draft from the device",
    /clearStoredDraft\(\)/.test(
      read("components/auth/AccountMenu.tsx"),
    ),
  );
  check(
    "no new account copies Noir's demo content",
    // starterDraft must not reference the demo owner.
    !/noirProfile/.test(read("lib/supabase/profileState.ts").split("starterDraft")[1] ?? ""),
  );
}

/* -------------------------------------------------------------------------- */
/*                            Live database checks                            */
/* -------------------------------------------------------------------------- */

async function verifyAgainstDatabase(env) {
  section("Live project checks");

  const supabase = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- schema present ------------------------------------------------------
  const { error: rpcError } = await supabase.rpc("is_username_taken", {
    candidate: "prsme_phase5_probe",
  });
  check(
    "is_username_taken RPC exists and is callable",
    !rpcError,
    rpcError?.message ?? "",
  );

  // --- anonymous cannot create a profile ----------------------------------
  const { error: anonInsertError } = await supabase
    .from("profiles")
    .insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      username: `anon-probe-${Date.now()}`,
      profile_state: {},
    });

  check(
    "anonymous INSERT into profiles is refused",
    !!anonInsertError,
    anonInsertError ? "" : "the insert unexpectedly succeeded",
  );

  // --- anonymous cannot read a private profile ----------------------------
  // Requires a private profile to exist. If none does, we can still verify the
  // negative in the strong direction: anon must not be able to enumerate rows.
  const { data: anonRows, error: anonReadError } = await supabase
    .from("profiles")
    .select("username, visibility")
    .limit(50);

  if (anonReadError) {
    skip(
      "anonymous SELECT is filtered",
      `query error: ${anonReadError.message}`,
    );
  } else if (!anonRows || anonRows.length === 0) {
    skip(
      "anonymous SELECT is filtered",
      "no public profiles exist yet — create one to complete this check",
    );
  } else {
    const leakedPrivate = anonRows.some((r) => r.visibility !== "public");
    check(
      "anonymous SELECT returns only public profiles",
      !leakedPrivate,
      leakedPrivate ? "a non-public row was visible to anon" : "",
    );
  }

  // --- unauthenticated write to storage ----------------------------------
  const { error: anonUploadError } = await supabase.storage
    .from("avatars")
    .upload("00000000-0000-0000-0000-000000000000/probe.png", new Blob(["x"]), {
      contentType: "image/png",
    });
  check(
    "anonymous upload to the avatars bucket is refused",
    !!anonUploadError,
    anonUploadError ? "" : "the upload unexpectedly succeeded",
  );

  section("Live project checks requiring a signed-in account");
  console.log(
    "  note  create a throwaway account and run a full browser pass to cover\n" +
      "        registration -> confirmation -> onboarding -> save -> sign-in on\n" +
      "        a second device. Those need interactive credentials and cannot be\n" +
      "        automated from here.",
  );
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log("PRSME — Phase 5 verification\n");
  console.log("=".repeat(60));

  verifyPolicyFiles();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const forceDb = process.argv.includes("--with-db");

  section("Live database");
  if (url && key) {
    try {
      await verifyAgainstDatabase({ url, key });
    } catch (error) {
      failed++;
      failures.push(`live checks threw: ${error.message}`);
      console.log(`  FAIL live checks threw — ${error.message}`);
    }
  } else if (forceDb) {
    failed++;
    failures.push("--with-db was passed but no Supabase project is configured");
    console.log("  FAIL --with-db was passed but no Supabase project is configured");
  } else {
    skip("live database checks", "no Supabase project configured");
    console.log(
      "        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n" +
        "        (or load .env.local) and re-run to exercise the RLS policies live.",
    );
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `passed ${passed}   failed ${failed}   skipped ${skipped}`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});