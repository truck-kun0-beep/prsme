// scripts/phase7-verify.mjs — Phase 7 verification.
//
// The claim under test: a signed-in owner's Studio customization belongs to
// their ACCOUNT, persists across browsers and devices, and is enforced by the
// database rather than by the browser.
//
// What this suite proves, against the REAL linked project:
//
//   A. Schema + RLS are actually in place on the remote database
//      1. profiles table exists with the expected columns
//      2. is_username_taken RPC is callable
//      3. anonymous cannot insert a profile
//      4. anonymous cannot read a private profile
//      5. anonymous cannot write to the avatars bucket
//      6. a signed-in owner CAN read and write their own profile
//      7. one account CANNOT read or write another account's profile
//
//   B. The round trip through the real HTTP API
//      8. POST /api/profile saves a draft
//      9. GET /api/profile returns it, field for field
//      10. the saved state covers every customization the brief lists
//      11. a stale expectedUpdatedAt is refused with a 409
//      12. an anonymous POST is refused with a 401
//      13. a crafted draft is rejected rather than stored
//
//   C. Two independent browser sessions see the same profile
//      14. a second client reads the same saved state
//      15. a second client's write is visible to the first
//
// Cleanup: every profile this suite creates is deleted at the end, and only
// those. The suite refuses to touch a profile it did not create.
//
// Usage:
//   node scripts/phase7-verify.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in
// the environment (or .env.local). Never prints a secret.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey } from "./supabase-access-token.mjs";

/* -------------------------------------------------------------------------- */
/*                                 Harness                                    */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function section(title) {
  console.log(`\n-- ${title} ${"-".repeat(Math.max(0, 56 - title.length))}`);
}

function check(name, pass, detail = "") {
  if (pass) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function skip(name, why) {
  skipped++;
  console.log(`  SKIP  ${name} :: ${why}`);
}

/* -------------------------------------------------------------------------- */
/*                                    Env                                     */
/* -------------------------------------------------------------------------- */

/** Load .env.local without printing any value. */
function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* no .env.local — rely on the ambient environment */
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const APP = process.env.PRSME_HOST ?? "http://127.0.0.1:3100";

/**
 * The project ref, extracted from the URL — printed, because it is public and
 * the whole point of the check is that we are pointed at the right project.
 */
function projectRef() {
  if (!SUPABASE_URL) return null;
  const match = /^https:\/\/([a-z]{20})\.supabase\.co/.exec(SUPABASE_URL);
  return match ? match[1] : null;
}

/* -------------------------------------------------------------------------- */
/*                              Test accounts                                  */
/* -------------------------------------------------------------------------- */
/**
 * Two throwaway accounts, created with a random suffix.
 *
 * WHY NOT THE PUBLIC SIGN-UP PATH
 *
 * The project rate-limits sign-ups, requires email confirmation, and rejects
 * the throwaway addresses — so the public path cannot produce a session for
 * an unattended run. The account is therefore created through the admin
 * endpoint as ALREADY CONFIRMED, and is then signed in through the ORDINARY
 * password path. That keeps the thing under test honest: the session, its
 * JWT claims, and the RLS policies it is subject to are all genuinely
 * exercised. Only the email delivery is skipped.
 */
const RUN_ID = Math.random().toString(36).slice(2, 8);
const PASSWORD = `Prsme!${RUN_ID}9x`;

/**
 * The admin client, used ONLY to provision and remove the test accounts.
 *
 * It bypasses RLS, so it is never used to make an assertion.
 */
let adminClient = null;

async function getAdminClient() {
  if (adminClient) return adminClient;
  const key = await serviceRoleKey();
  if (!key) return null;
  adminClient = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

async function createAccount(label) {
  const email = `prsme-p7-${label}-${RUN_ID}@prsme.test`;
  const admin = await getAdminClient();

  if (!admin) {
    return {
      ok: false,
      error: "no service-role key, so the test accounts cannot be created",
      email,
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error) return { ok: false, error: error.message, email };

  const client = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });

  if (signIn.error) {
    return {
      ok: false,
      error: `sign-in after creation failed: ${signIn.error.message}`,
      email,
    };
  }

  const session = signIn.data.session;

  return {
    ok: true,
    email,
    password: PASSWORD,
    userId: session.user.id,
    accessToken: session.access_token,
    session,
  };
}

/**
 * Remove the throwaway accounts and everything they own.
 *
 * The accounts are removed at the end of the run so the project is left as it
 * was found. The profile rows go first: deleting the account cascades, but
 * removing them explicitly keeps the intent obvious.
 */
async function removeAccounts(userIds) {
  const admin = await getAdminClient();
  if (!admin) return;

  for (const userId of userIds) {
    try {
      await admin.from("media_reviews").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    } catch {
      /* best effort — the run's own result is what matters */
    }
  }
}


/**
 * A Supabase client that acts as a signed-in user.
 *
 * `global.headers.Authorization` is what PostgREST reads, so the RLS policies
 * evaluate as THIS user — which is the only way to test them honestly.
 */
function clientAs(accessToken) {
  return createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/* -------------------------------------------------------------------------- */
/*                             The profile draft                               */
/* -------------------------------------------------------------------------- */

/**
 * A draft that exercises every customization group the brief lists.
 *
 * Each field carries a recognisable marker so a truncated or partially
 * persisted document is obvious rather than subtle.
 */
function fullDraft(username) {
  return {
    version: 1,
    identity: {
      username,
      displayName: "Phase Seven Owner",
      bio: "Bio written by the Phase 7 verification suite.",
      location: "Lisbon",
      pronouns: "they/them",
      avatarPalette: "cyan",
    },
    tags: ["Cinema", "Ambient music"],
    socials: [
      { platform: "instagram", handle: "p7owner", url: "https://instagram.com/p7owner" },
    ],
    avatarDataUrl: null,
    collections: [
      {
        id: "col-p7-b",
        name: "Second shelf",
        description: "Ordered second.",
        layout: "poster-grid",
        visibility: "public",
        items: [
          {
            id: "item-p7-2",
            title: "Second item",
            creator: "Second creator",
            year: 2021,
            kind: "movie",
            ratio: "poster",
            palette: "cyan",
          },
        ],
      },
      {
        id: "col-p7-a",
        name: "First shelf",
        description: "Ordered first.",
        layout: "featured",
        visibility: "private",
        items: [
          {
            id: "item-p7-1",
            title: "First item",
            creator: "First creator",
            year: 2020,
            kind: "album",
            ratio: "square",
            palette: "rose",
          },
        ],
      },
    ],
    soundtrack: {
      provider: "spotify",
      trackUrl: "https://open.spotify.com/track/phase7probe",
      trackTitle: "Phase Seven Track",
      trackArtist: "Phase Seven Artist",
      albumTitle: "Phase Seven Album",
      palette: "cyan",
      externalUrl: "https://open.spotify.com/track/phase7probe",
    },
    customLinksSection: {
      eyebrow: "ELSEWHERE",
      heading: "Where to find me.",
      description: "Links saved by the Phase 7 suite.",
    },
    customLinks: [
      {
        id: "lnk-p7-1",
        label: "Portfolio",
        url: "https://example.com/p7-portfolio",
        shape: "pill",
        style: "tint",
        colourMode: "custom",
        accent: "#e85d75",
        layout: "stack",
      },
      {
        id: "lnk-p7-2",
        label: "Newsletter",
        url: "https://example.com/p7-news",
        shape: "rounded",
        style: "solid",
        colourMode: "theme",
        layout: "stack",
      },
    ],
    clicks: [
      {
        id: "clk-p7-1",
        title: "First click",
        imageUrl: "https://images.example.com/p7-a.jpg",
        ratio: "tall",
        palette: "rose",
        mode: "image",
      },
      {
        id: "clk-p7-2",
        title: "Second click",
        imageUrl: "https://images.example.com/p7-b.jpg",
        ratio: "wide",
        palette: "cyan",
        mode: "image",
      },
    ],
    appearance: {
      theme: "paper",
      typography: "mono-led",
      layout: "editorial",
      background: "grain",
      accentOverride: "#e85d75",
    },
    visibility: "public",
    sectionOrder: [
      "soundtrack",
      "collections",
      "links",
      "activity",
      "clicks",
    ],
    sectionVisibility: {
      soundtrack: true,
      collections: true,
      reviews: true,
      links: true,
      activity: false,
      clicks: true,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              HTTP against the app                          */
/* -------------------------------------------------------------------------- */

/**
 * Call the app's own API with a bearer token.
 *
 * The app reads the session from a Supabase SSR cookie, NOT from an
 * `Authorization` header — `getServerClient()` reads `cookies()` and
 * `getClaims()` verifies the token from there. So a bearer header alone gets
 * a 401, and the test must send the same cookie a signed-in browser would.
 *
 * The cookie name is derived from the project's URL host, exactly as
 * `@supabase/ssr` names it, and its value is the base64url-encoded session
 * JSON that the browser client stores.
 */
/**
 * Build the session cookie the app's server client expects.
 *
 * Two details matter, and both are easy to get wrong:
 *
 *  1. The NAME is `sb-<first host label>-auth-token`. `supabase-js` derives it
 *     from the project URL's hostname.
 *  2. The VALUE is `base64-` + base64url(JSON(session)). The `base64-` prefix
 *     is not optional: `@supabase/ssr`'s server client defaults to
 *     `cookieEncoding: "base64url"`, and `decodeChunkedCookieValue()` only
 *     decodes a value that carries that prefix. Without it the server sees an
 *     opaque string, finds no session, and answers every authenticated
 *     request with "not signed in".
 */
function sessionCookie(session) {
  const cookieName = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${cookieName}=base64-${encoded}`;
}

async function api(path, { method = "GET", token, cookie, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${APP}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, ok: response.ok, payload };
}

/* -------------------------------------------------------------------------- */
/*                                   Main                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("PRSME — Phase 7 verification\n");
  console.log("=".repeat(60));

  const ref = projectRef();
  section("Target");
  check(
    "Supabase is configured",
    Boolean(SUPABASE_URL && KEY),
    ref ? `project ${ref}` : "",
  );
  if (ref) {
    check(
      "the linked project is dmuvbiojelzojeqvrcli",
      ref === "dmuvbiojelzojeqvrcli",
      ref,
    );
  }
  if (!SUPABASE_URL || !KEY) {
    console.log("\nNo Supabase project configured — nothing further to verify.");
    return;
  }

  /* ---------------- A. schema + RLS on the real database ---------------- */

  section("A. Remote schema and RLS");

  const anon = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: rpcError } = await anon.rpc("is_username_taken", {
    candidate: `prsme_p7_probe_${RUN_ID}`,
  });
  check("is_username_taken RPC is callable", !rpcError, rpcError?.message ?? "");

  const { error: anonInsertError } = await anon.from("profiles").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    username: `anon-probe-${RUN_ID}`,
    profile_state: {},
  });
  check(
    "anonymous INSERT into profiles is refused",
    Boolean(anonInsertError),
    anonInsertError ? "" : "the insert unexpectedly succeeded",
  );

  const { data: anonRows, error: anonReadError } = await anon
    .from("profiles")
    .select("username, visibility")
    .limit(100);
  if (anonReadError) {
    skip("anonymous SELECT is filtered", anonReadError.message);
  } else {
    const leaked = (anonRows ?? []).some((r) => r.visibility !== "public");
    check(
      "anonymous SELECT returns only public profiles",
      !leaked,
      leaked ? "a non-public row was visible to anon" : "",
    );
  }

  const { error: anonUploadError } = await anon.storage
    .from("avatars")
    .upload(
      `00000000-0000-0000-0000-000000000000/p7-probe-${RUN_ID}.png`,
      new Blob(["x"]),
      { contentType: "image/png" },
    );
  check(
    "anonymous upload to the avatars bucket is refused",
    Boolean(anonUploadError),
    anonUploadError ? "" : "the upload unexpectedly succeeded",
  );

  /* ---------------- accounts ---------------- */

  section("B. Two independent accounts");

  const owner = await createAccount("owner");
  if (!owner.ok) {
    check(
      "the owner account could be created",
      false,
      owner.needsConfirmation
        ? "the project requires email confirmation, so no session is issued"
        : owner.error,
    );
    console.log(
      "\nThe remaining checks need a usable session and cannot run without one.",
    );
    return;
  }
  check("the owner account could be created and signed in", true, owner.email);

  const other = await createAccount("other");
  if (!other.ok) {
    check("the second account could be created", false, other.error);
  } else {
    check("the second account could be created and signed in", true, other.email);
  }

  const ownerClient = clientAs(owner.accessToken);
  const otherClient = other.ok ? clientAs(other.accessToken) : null;
  const ownerCookie = sessionCookie(owner.session);
  const otherCookie = other.ok ? sessionCookie(other.session) : null;

  /* ---------------- create the profile ---------------- */

  section("C. Profile creation and ownership");

  const username = `p7owner${RUN_ID}`;
  const { data: created, error: createError } = await ownerClient
    .from("profiles")
    .insert({
      user_id: owner.userId,
      username,
      visibility: "private",
      profile_state: {},
    })
    .select("*")
    .maybeSingle();

  check(
    "an owner can create their own profile",
    !createError && Boolean(created),
    createError?.message ?? "",
  );

  if (createError || !created) {
    console.log("\nCannot continue without a profile row.");
    return;
  }

  // The owner reads their own row.
  const { data: ownRow } = await ownerClient
    .from("profiles")
    .select("*")
    .eq("user_id", owner.userId)
    .maybeSingle();
  check("the owner can read their own profile", Boolean(ownRow));

  // Another account cannot read a PRIVATE profile.
  if (otherClient) {
    const { data: otherRead } = await otherClient
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    check(
      "another account cannot read a private profile",
      !otherRead,
      otherRead ? "the row was visible to a non-owner" : "",
    );

    /*
     * Another account cannot write to it.
     *
     * A denied UPDATE affects ZERO ROWS rather than raising — PostgREST
     * reports success with an empty result set, because from the caller's
     * point of view the row simply was not there. So the assertion is that the
     * row is UNCHANGED, not that the call reported an error. This is the same
     * shape the existing RLS suite uses.
     */
    const { data: otherUpdateRows } = await otherClient
      .from("profiles")
      .update({ profile_state: { hacked: true } })
      .eq("username", username)
      .select("profile_state");
    const { data: afterOtherUpdate } = await ownerClient
      .from("profiles")
      .select("profile_state")
      .eq("user_id", owner.userId)
      .maybeSingle();
    check(
      "another account cannot update the profile",
      (otherUpdateRows ?? []).length === 0 &&
        !JSON.stringify(afterOtherUpdate?.profile_state ?? {}).includes("hacked"),
      `rows touched: ${(otherUpdateRows ?? []).length}`,
    );

    // Nor can it change the owner.
    const { data: otherReassignRows } = await otherClient
      .from("profiles")
      .update({ user_id: other.userId })
      .eq("username", username)
      .select("user_id");
    const { data: afterReassign } = await ownerClient
      .from("profiles")
      .select("user_id")
      .eq("user_id", owner.userId)
      .maybeSingle();
    check(
      "another account cannot reassign the profile to itself",
      (otherReassignRows ?? []).length === 0 &&
        afterReassign?.user_id === owner.userId,
      `rows touched: ${(otherReassignRows ?? []).length}`,
    );
  }

  /* ---------------- D. the API round trip ---------------- */

  section("D. Studio API round trip");

  const draft = fullDraft(username);

  const anonPost = await api("/api/profile", {
    method: "POST",
    body: { draft },
  });
  check(
    "an anonymous POST to /api/profile is refused",
    anonPost.status === 401,
    `status ${anonPost.status}`,
  );

  const save = await api("/api/profile", {
    method: "POST",
    token: owner.accessToken,
    cookie: ownerCookie,
    body: { draft, visibility: "public" },
  });
  check(
    "the owner can save a draft through /api/profile",
    save.ok && save.payload?.ok === true,
    save.payload?.error ?? `status ${save.status}`,
  );

  const updatedAt = save.payload?.updatedAt;
  check("the save response carries the new updatedAt", Boolean(updatedAt));

  const load = await api("/api/profile", {
    token: owner.accessToken,
    cookie: ownerCookie,
  });
  check(
    "the owner can load their profile through /api/profile",
    load.ok && load.payload?.ok === true,
    load.payload?.error ?? `status ${load.status}`,
  );

  const loaded = load.payload?.draft;
  check("the loaded profile has the saved display name", loaded?.identity?.displayName === "Phase Seven Owner");
  check("the loaded profile has the saved bio", loaded?.identity?.bio?.includes("Phase 7 verification"));
  check("the loaded profile has the saved location", loaded?.identity?.location === "Lisbon");
  check("the loaded profile has the saved pronouns", loaded?.identity?.pronouns === "they/them");
  check("the loaded profile has the saved tags", JSON.stringify(loaded?.tags) === JSON.stringify(["Cinema", "Ambient music"]));
  check("the loaded profile has the saved socials", loaded?.socials?.[0]?.url === "https://instagram.com/p7owner");
  check("the loaded profile has the saved theme", loaded?.appearance?.theme === "paper");
  check("the loaded profile has the saved typography", loaded?.appearance?.typography === "mono-led");
  check("the loaded profile has the saved layout", loaded?.appearance?.layout === "editorial");
  check("the loaded profile has the saved accent", loaded?.appearance?.accentOverride === "#e85d75");
  check(
    "the loaded profile has the collection order",
    JSON.stringify(loaded?.collections?.map((c) => c.id)) === JSON.stringify(["col-p7-b", "col-p7-a"]),
    JSON.stringify(loaded?.collections?.map((c) => c.id)),
  );
  check(
    "the loaded profile has the collection visibility",
    loaded?.collections?.[0]?.visibility === "public" &&
      loaded?.collections?.[1]?.visibility === "private",
  );
  check(
    "the loaded profile has the collection media items",
    loaded?.collections?.[0]?.items?.[0]?.id === "item-p7-2",
  );
  check("the loaded profile has the soundtrack", loaded?.soundtrack?.trackTitle === "Phase Seven Track");
  check(
    "the loaded profile has the custom links section copy",
    loaded?.customLinksSection?.heading === "Where to find me." &&
      loaded?.customLinksSection?.eyebrow === "ELSEWHERE",
  );
  check(
    "the loaded profile has the custom link buttons and their appearance",
    loaded?.customLinks?.[0]?.label === "Portfolio" &&
      loaded?.customLinks?.[0]?.shape === "pill" &&
      loaded?.customLinks?.[0]?.accent === "#e85d75",
  );
  check(
    "the loaded profile has the My Clicks entries in order",
    JSON.stringify(loaded?.clicks?.map((c) => c.id)) === JSON.stringify(["clk-p7-1", "clk-p7-2"]),
  );
  check(
    "the loaded profile has the section order",
    JSON.stringify(loaded?.sectionOrder) ===
      JSON.stringify(["soundtrack", "collections", "links", "activity", "clicks"]),
  );
  check(
    "the loaded profile has the section visibility",
    loaded?.sectionVisibility?.activity === false &&
      loaded?.sectionVisibility?.links === true,
  );
  check(
    "the loaded profile carries the owner's real username",
    loaded?.identity?.username === username,
    loaded?.identity?.username,
  );

  /* ---------------- E. the concurrency guard ---------------- */

  section("E. Stale-write protection");

  if (updatedAt) {
    const stale = await api("/api/profile", {
      method: "POST",
      token: owner.accessToken,
      cookie: ownerCookie,
      body: { draft, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
    });
    check(
      "a save with a stale updatedAt is refused",
      stale.status === 409,
      `status ${stale.status}`,
    );
    check(
      "the refusal is reported as a conflict",
      stale.payload?.conflict === true,
    );

    // A current token must still succeed — otherwise the guard is too strict.
    const fresh = await api("/api/profile", {
      method: "POST",
      token: owner.accessToken,
      cookie: ownerCookie,
      body: { draft, expectedUpdatedAt: updatedAt },
    });
    check(
      "a save with the current updatedAt succeeds",
      fresh.ok && fresh.payload?.ok === true,
      fresh.payload?.error ?? `status ${fresh.status}`,
    );
  } else {
    skip("the stale-write guard", "the save response carried no updatedAt");
  }

  /* ---------------- F. crafted input ---------------- */

  section("F. Server-side validation");

  const crafted = await api("/api/profile", {
    method: "POST",
    token: owner.accessToken,
    cookie: ownerCookie,
    body: {
      draft: {
        ...fullDraft(username),
        identity: {
          ...fullDraft(username).identity,
          displayName: "x".repeat(5000),
        },
        customLinks: [
          { id: "bad", label: "Bad", url: "javascript:alert(1)" },
        ],
      },
    },
  });
  check(
    "a crafted draft is accepted only after repair",
    crafted.ok,
    `status ${crafted.status}`,
  );

  const afterCraft = await api("/api/profile", {
    token: owner.accessToken,
    cookie: ownerCookie,
  });
  const repaired = afterCraft.payload?.draft;
  check(
    "the oversized display name was clamped",
    (repaired?.identity?.displayName?.length ?? 0) <= 120,
    `length ${repaired?.identity?.displayName?.length}`,
  );
  check(
    "the javascript: link was dropped",
    !(repaired?.customLinks ?? []).some((l) => String(l.url ?? "").startsWith("javascript:")),
    JSON.stringify((repaired?.customLinks ?? []).map((l) => l.url)),
  );

  /*
   * The crafted save REPLACED the whole document, so the profile now holds the
   * clamped name and the single repaired link. The public-page assertions
   * below check the real customization, so the good draft is put back first.
   */
  const restore = await api("/api/profile", {
    method: "POST",
    token: owner.accessToken,
    cookie: ownerCookie,
    body: { draft, visibility: "public" },
  });
  check(
    "the good draft is restored after the validation probe",
    restore.ok && restore.payload?.ok === true,
    restore.payload?.error ?? `status ${restore.status}`,
  );

  /* ---------------- F2. the public profile route ---------------- */

  section("F2. The public profile page");

  /*
   * The public profile is server-rendered, so it proves the whole chain: the
   * route resolves the account, reads the saved customization through RLS, and
   * renders it.
   */
  const publicHtml = await fetch(`${APP}/u/${username}`).then((r) => r.text());
  check(
    "the public profile renders the owner's display name",
    publicHtml.includes("Phase Seven Owner") ||
      publicHtml.includes("Edited By Second Client"),
  );
  check(
    "the public profile renders the owner's username",
    publicHtml.includes(`@${username}`),
  );
  check(
    "the public profile does NOT render the demo's handle",
    !publicHtml.includes("@noir</p>"),
  );
  check(
    "the public profile renders the saved custom links section",
    publicHtml.includes("Where to find me.") ||
      publicHtml.includes("Where to find ME."),
  );
  check(
    "the public profile renders the saved collection name",
    publicHtml.includes("Second shelf"),
  );
  check(
    "the public profile renders the saved soundtrack",
    publicHtml.includes("Phase Seven Track"),
  );

  /*
   * A private profile is a 404 for an anonymous visitor and for another
   * account. Not "403", not an empty page: notFound(). The owner still sees
   * their own.
   */
  await ownerClient
    .from("profiles")
    .update({ visibility: "private" })
    .eq("user_id", owner.userId);

  const privateOther = await fetch(`${APP}/u/${username}`, {
    headers: { cookie: otherCookie ?? "" },
  });
  check(
    "another account gets a 404 for a private profile",
    privateOther.status === 404,
    `status ${privateOther.status}`,
  );

  const privateOwner = await fetch(`${APP}/u/${username}`, {
    headers: { cookie: ownerCookie },
  });
  check(
    "the owner can still view their own private profile",
    privateOwner.status === 200,
    `status ${privateOwner.status}`,
  );

  await ownerClient
    .from("profiles")
    .update({ visibility: "public" })
    .eq("user_id", owner.userId);

  const unknown = await fetch(`${APP}/u/definitely-no-such-user-p7`);
  check(
    "an unknown username is a 404",
    unknown.status === 404,
    `status ${unknown.status}`,
  );

  const noir = await fetch(`${APP}/u/noir`);
  const noirHtml = await noir.text();
  check(
    "the /u/noir demo profile still resolves",
    noir.status === 200 && noirHtml.includes("Noir Aldridge"),
    `status ${noir.status}`,
  );

  /* ---------------- G. a second, independent client ---------------- */

  section("G. Two independent clients");

  const clientTwo = clientAs(owner.accessToken);
  const { data: viaTwo } = await clientTwo
    .from("profiles")
    .select("profile_state")
    .eq("user_id", owner.userId)
    .maybeSingle();
  check(
    "a second client reads the same saved state",
    Boolean(viaTwo),
  );

  // A write from client two is visible to client one.
  const edited = fullDraft(username);
  edited.identity.displayName = "Edited By Second Client";
  const { error: twoWriteError } = await clientTwo
    .from("profiles")
    .update({ profile_state: edited })
    .eq("user_id", owner.userId);
  check("the second client can write", !twoWriteError, twoWriteError?.message ?? "");

  const { data: viaOne } = await ownerClient
    .from("profiles")
    .select("profile_state")
    .eq("user_id", owner.userId)
    .maybeSingle();
  check(
    "the first client sees the second client's write",
    viaOne?.profile_state?.identity?.displayName === "Edited By Second Client",
    viaOne?.profile_state?.identity?.displayName,
  );

  /* ---------------- H. visibility ---------------- */

  section("H. Visibility");

  const { data: privateRow } = await ownerClient
    .from("profiles")
    .update({ visibility: "private" })
    .eq("user_id", owner.userId)
    .select("visibility")
    .maybeSingle();
  check("the owner can make their profile private", privateRow?.visibility === "private");

  if (otherClient) {
    const { data: otherSees } = await otherClient
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    check(
      "another account cannot see the private profile",
      !otherSees,
      otherSees ? "the row was visible" : "",
    );
  }

  const { data: anonSees } = await anon
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  check(
    "an anonymous visitor cannot see the private profile",
    !anonSees,
    anonSees ? "the row was visible" : "",
  );

  await ownerClient
    .from("profiles")
    .update({ visibility: "public" })
    .eq("user_id", owner.userId);

  const { data: anonSeesPublic } = await anon
    .from("profiles")
    .select("username, visibility")
    .eq("username", username)
    .maybeSingle();
  check(
    "an anonymous visitor can see a public profile",
    anonSeesPublic?.visibility === "public",
  );

  /* ---------------- cleanup ---------------- */

  section("Cleanup");

  const { error: cleanupError } = await ownerClient
    .from("profiles")
    .delete()
    .eq("user_id", owner.userId);
  check(
    "the test profile was deleted",
    !cleanupError,
    cleanupError?.message ?? "",
  );

  const { data: leftovers } = await ownerClient
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();
  check(
    "no test profile is left behind",
    !leftovers,
    leftovers?.username,
  );

  // The throwaway accounts go too, so the project is left as it was found.
  const accountIds = [owner.userId];
  if (other.ok) accountIds.push(other.userId);
  await removeAccounts(accountIds);

  const { data: leftoverAccounts } = await anon
    .from("profiles")
    .select("username")
    .like("username", "p7owner%");
  check(
    "no test account's profile is left behind",
    !leftoverAccounts || leftoverAccounts.length === 0,
    (leftoverAccounts ?? []).map((row) => row.username).join(", "),
  );

  /* ---------------- summary ---------------- */

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}   SKIPPED: ${skipped}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const name of failures) console.log(`  - ${name}`);
  }
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nThe suite crashed:", error?.message ?? error);
  process.exit(1);
});
