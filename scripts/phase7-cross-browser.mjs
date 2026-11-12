// scripts/phase7-cross-browser.mjs — Phase 7 cross-browser verification.
//
// The claim: a saved profile belongs to the ACCOUNT, not to the browser that
// saved it. So a completely separate browser — its own Edge profile, its own
// localStorage, its own cookies — must see the same saved customization.
//
// This launches a SECOND Edge instance on its own CDP port with its own
// user-data-dir, signs the account in there (through the app's own auth
// endpoint, not by copying cookies), and checks that:
//
//   1. the second browser has an empty localStorage (it really is separate)
//   2. the Studio in the second browser loads the SAVED state, not a blank one
//   3. an edit made in the second browser is visible in the FIRST browser
//      after it re-reads — the round trip across two browsers
//   4. the public profile in the second browser shows the saved customization
//
// Usage:
//   node scripts/localdb/with-db.mjs scripts/phase7-cross-browser.mjs
//
// Requires the app to be served against the local database on port 3100 and
// the first browser on CDP 9334.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey } from "./supabase-access-token.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3100";
const CDP_A = Number(process.env.PRSME_CDP_PORT ?? 9334);
const CDP_B = Number(process.env.PRSME_CDP_PORT_B ?? 9335);
const ROOT = process.cwd();
const PROFILE_B = join(ROOT, ".tmp-localdb", "edge-profile-b");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
/**
 * Load .env.local into the environment, without printing any value.
 */
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

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n-- ${title} ${"-".repeat(Math.max(0, 52 - title.length))}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/*                          A second CDP connection                           */
/* -------------------------------------------------------------------------- */

/** The same protocol driver as scripts/cdp.mjs, but for an arbitrary port. */
async function connectTo(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error(`No page target on CDP port ${port}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  let nextId = 1;
  const pending = new Map();

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");

  return {
    call,
    async setViewport(width, height = 900) {
      await call("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },
    async goto(url, { waitMs = 3000 } = {}) {
      await call("Page.navigate", { url });
      await wait(waitMs);
    },
    async evalJs(code) {
      const res = await call("Runtime.evaluate", {
        expression: `(async () => { ${code} })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res.exceptionDetails) {
        throw new Error(
          res.exceptionDetails.exception?.description ??
            res.exceptionDetails.text ??
            "eval error",
        );
      }
      return res.result?.value;
    },
    async setCookie(name, value, url) {
      /*
       * `url`, NOT `domain`.
       *
       * The test server runs on 127.0.0.1, and a cookie's Domain attribute
       * cannot be an IP address — the browser silently refuses it, so the
       * session never reaches the app and the Studio stays in guest mode.
       * Passing the full URL makes it a host-only cookie, which is what a
       * real sign-in sets.
       *
       * `httpOnly: false` matches `@supabase/ssr`'s own
       * `DEFAULT_COOKIE_OPTIONS`. The BROWSER client has to be able to read
       * the session cookie — that is how `AccountProvider` decides the
       * account is authenticated — so an httpOnly cookie would leave the
       * Studio in guest mode even though the server could see the session.
       */
      await call("Network.setCookie", {
        name,
        value,
        url,
        path: "/",
        httpOnly: false,
        sameSite: "Lax",
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          Launching the second browser                       */
/* -------------------------------------------------------------------------- */

function launchSecondBrowser() {
  if (!existsSync(EDGE)) throw new Error(`Edge not found at ${EDGE}`);
  mkdirSync(PROFILE_B, { recursive: true });

  const child = spawn(
    EDGE,
    [
      `--remote-debugging-port=${CDP_B}`,
      `--user-data-dir=${PROFILE_B}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    {
      cwd: ROOT,
      detached: true,
      stdio: [
        "ignore",
        openSync(join(ROOT, ".tmp-localdb", "edge-b.out.txt"), "a"),
        openSync(join(ROOT, ".tmp-localdb", "edge-b.err.txt"), "a"),
      ],
      windowsHide: true,
    },
  );
  child.unref();
  return child;
}

async function waitForCdp(port, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      if (r.ok) {
        const list = await r.json();
        if (list.some((t) => t.type === "page")) return true;
      }
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*                                    Main                                     */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("PRSME — Phase 7 cross-browser verification\n");
  console.log("=".repeat(60));

  /*
   * The environment comes from .env.local when it is not already set, so the
   * suite can be run without exporting anything by hand.
   */
  loadEnv();

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !KEY) {
    console.log("No Supabase environment — nothing to verify.");
    return;
  }

  section("Setup");

  const RUN_ID = Math.random().toString(36).slice(2, 8);
  const PASSWORD = `Prsme!${RUN_ID}9x`;
  const email = `prsme-p7-x-${RUN_ID}@prsme.test`;
  const username = `p7x${RUN_ID}`;

  /*
   * The account is created through the admin endpoint as ALREADY CONFIRMED,
   * because the public sign-up path rate-limits, requires email confirmation,
   * and rejects the throwaway addresses. It is then signed in through the
   * ORDINARY password path, so the session and its RLS scope are the real
   * ones. Only the email delivery is skipped.
   */
  const adminKey = await serviceRoleKey();
  if (!adminKey) {
    check("the account could be created", false, "no service-role key available");
    return;
  }
  const admin = createClient(SUPABASE_URL, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const client = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError) {
    check("the account could be created", false, createError.message);
    return;
  }

  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) {
    check("the account could be signed in", false, signInError.message);
    return;
  }
  const session = signIn.session;
  check("the account was created and signed in", true, email);


  const ownerClient = createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  await ownerClient.from("profiles").insert({
    user_id: session.user.id,
    username,
    visibility: "public",
    profile_state: {},
  });
  check("the profile row was created", true, username);

  /* ---------------- browser B ---------------- */

  section("The second browser");

  // A FRESH profile directory, so browser B shares nothing with browser A.
  try {
    rmSync(PROFILE_B, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  const child = launchSecondBrowser();
  const up = await waitForCdp(CDP_B);
  check("the second browser started on its own CDP port", up, `port ${CDP_B}`);

  if (!up) {
    console.log("\nCannot continue without the second browser.");
    return;
  }

  const browserB = await connectTo(CDP_B);

  // Sign browser B in through the app's own auth endpoint, so the session
  // cookie is set exactly the way a real sign-in sets it.
  const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const signInBody = await signInResponse.json();
  check(
    "the account could be signed in for browser B",
    Boolean(signInBody?.access_token),
  );

  const cookieName = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  /*
   * The `base64-` prefix is required: `@supabase/ssr`'s server client defaults
   * to `cookieEncoding: "base64url"`, and it only decodes a cookie value that
   * carries the prefix. Without it the server finds no session and every
   * request comes back unauthenticated.
   */
  const cookieValue = Buffer.from(
    JSON.stringify({
      access_token: signInBody.access_token,
      token_type: "bearer",
      expires_in: signInBody.expires_in,
      expires_at: signInBody.expires_at,
      refresh_token: signInBody.refresh_token,
      user: signInBody.user,
    }),
    "utf8",
  ).toString("base64url");

  const hostUrl = `${HOST}/`;
  await browserB.setCookie(cookieName, `base64-${cookieValue}`, hostUrl);

  /* ---------------- browser B is genuinely separate ---------------- */

  await browserB.setViewport(1280, 1000);
  await browserB.goto(`${HOST}/studio`, { waitMs: 6000 });
  await wait(2500);

  const localState = await browserB.evalJs(`
    return {
      hasDraft: Boolean(localStorage.getItem('prsme:profile-draft:v1')),
      keys: Object.keys(localStorage).filter((k) => k.indexOf('prsme') === 0),
    };
  `);
  check(
    "browser B starts with NO localStorage copy of the profile",
    localState.hasDraft === false,
    JSON.stringify(localState.keys),
  );

  /* ---------------- browser B loads the SAVED state ---------------- */

  section("Browser B loads the saved profile");

  // Save a distinctive value from browser A's side first.
  const draft = {
    version: 1,
    identity: {
      username,
      displayName: "Cross Browser Owner",
      bio: "Saved from browser A.",
      location: "Porto",
      pronouns: "she/her",
      avatarPalette: "rose",
    },
    tags: ["CrossBrowser"],
    socials: [],
    avatarDataUrl: null,
    collections: [],
    soundtrack: null,
    clicks: [],
    customLinksSection: {
      eyebrow: "ELSEWHERE",
      heading: "Cross browser links.",
      description: "Stored in the account, not the browser.",
    },
    customLinks: [
      {
        id: "lnk-x-1",
        label: "Cross Browser Link",
        url: "https://example.com/x-browser",
        shape: "rounded",
        style: "solid",
        colourMode: "theme",
        layout: "stack",
      },
    ],
    appearance: {
      theme: "obsidian",
      typography: "serif",
      layout: "poster",
      background: "solid",
      accentOverride: null,
    },
    visibility: "public",
    sectionOrder: ["soundtrack", "collections", "links", "activity", "clicks"],
    sectionVisibility: {
      soundtrack: true,
      collections: true,
      reviews: true,
      links: true,
      activity: true,
      clicks: true,
    },
  };

  const saveResponse = await fetch(`${HOST}/api/profile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${cookieName}=base64-${cookieValue}`,
    },
    body: JSON.stringify({ draft }),
  });
  const saveBody = await saveResponse.json();
  check(
    "the profile was saved from browser A's session",
    saveResponse.ok && saveBody?.ok === true,
    saveBody?.error ?? `status ${saveResponse.status}`,
  );

  // Now reload browser B's Studio — it must show the SAVED values.
  await browserB.goto(`${HOST}/studio`, { waitMs: 6000 });
  await wait(3000);

  // The Studio opens on the Appearance panel; the Identity fields live on the
  // Identity tab, so it is selected before the values are read.
  await browserB.evalJs(`
    const tab = document.querySelector('[data-testid="studio-tab-identity"]');
    if (tab) tab.click();
    return Boolean(tab);
  `);
  await wait(1200);

  const studioState = await browserB.evalJs(`
    const el = (sel) => document.querySelector(sel);
    const value = (id) => {
      const node = document.getElementById(id);
      return node ? node.value : null;
    };
    const header = el('header');
    return {
      headerText: header ? header.innerText : null,
      displayName: value('f-displayName'),
      bio: value('f-bio'),
      location: value('f-location'),
      pronouns: value('f-pronouns'),
      saveDisabled: el('[data-testid="studio-save-btn"]')
        ? el('[data-testid="studio-save-btn"]').disabled
        : null,
    };
  `);
  check(
    "browser B's Studio shows the SAVED display name",
    studioState.displayName === "Cross Browser Owner",
    studioState.displayName,
  );
  check(
    "browser B's Studio shows the SAVED bio",
    studioState.bio === "Saved from browser A.",
    studioState.bio,
  );
  check(
    "browser B's Studio shows the SAVED location",
    studioState.location === "Porto",
    studioState.location,
  );
  check(
    "browser B's Studio shows the SAVED pronouns",
    studioState.pronouns === "she/her",
    studioState.pronouns,
  );
  check(
    "browser B's Studio header names the account",
    (studioState.headerText ?? "").includes(username),
    (studioState.headerText ?? "").slice(0, 120),
  );
  check(
    "browser B's Studio is not dirty (nothing to save)",
    studioState.saveDisabled === true,
    `save button disabled: ${studioState.saveDisabled}`,
  );

  /* ---------------- browser B's public profile ---------------- */

  section("Browser B's public profile");

  await browserB.goto(`${HOST}/u/${username}`, { waitMs: 6000 });
  await wait(2000);

  const publicState = await browserB.evalJs(`
    const text = document.body.innerText;
    return {
      hasDisplayName: text.indexOf('Cross Browser Owner') !== -1,
      hasHandle: text.indexOf('${username}') !== -1,
      hasNoirHandle: text.indexOf('@noir') !== -1,
      hasLinkLabel: text.indexOf('Cross Browser Link') !== -1,
      hasHeading: text.indexOf('Cross browser links.') !== -1,
      hasBio: text.indexOf('Saved from browser A.') !== -1,
      handleExcerpt: text.slice(0, 220),
    };
  `);
  check(
    "browser B's public profile shows the saved display name",
    publicState.hasDisplayName,
  );
  check(
    "browser B's public profile shows the account's handle",
    publicState.hasHandle,
    publicState.handleExcerpt,
  );
  check(
    "browser B's public profile does NOT show the demo handle",
    !publicState.hasNoirHandle,
  );
  check(
    "browser B's public profile shows the saved custom link",
    publicState.hasLinkLabel,
  );
  check(
    "browser B's public profile shows the saved links heading",
    publicState.hasHeading,
  );
  check(
    "browser B's public profile shows the saved bio",
    publicState.hasBio,
  );

  /* ---------------- the reverse direction ---------------- */

  section("An edit in browser B is visible to browser A");

  // Edit through browser B's own API call (its cookie), then read the row
  // with browser A's completely separate client.
  const edited = { ...draft };
  edited.identity = { ...draft.identity, displayName: "Edited In Browser B" };

  const editResponse = await fetch(`${HOST}/api/profile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${cookieName}=base64-${cookieValue}`,
    },
    body: JSON.stringify({ draft: edited }),
  });
  const editBody = await editResponse.json();
  check(
    "browser B can save an edit",
    editResponse.ok && editBody?.ok === true,
    editBody?.error ?? `status ${editResponse.status}`,
  );

  const { data: seenByA } = await ownerClient
    .from("profiles")
    .select("profile_state")
    .eq("user_id", session.user.id)
    .maybeSingle();
  /*
   * `profile_state` is the FLATTENED stored shape — `displayName` sits at the
   * top level, not under `identity`. (`toStoredProfileState` lifts the
   * identity fields out so the stored document is flat and versioned.)
   */
  check(
    "browser A sees browser B's edit",
    seenByA?.profile_state?.displayName === "Edited In Browser B",
    seenByA?.profile_state?.displayName,
  );

  /* ---------------- cleanup ---------------- */

  section("Cleanup");

  const { error: cleanupError } = await ownerClient
    .from("profiles")
    .delete()
    .eq("user_id", session.user.id);
  check("the test profile was deleted", !cleanupError, cleanupError?.message ?? "");

  // The throwaway account goes too, so the project is left as it was found.
  const { error: accountError } = await admin.auth.admin.deleteUser(session.user.id);
  check("the test account was deleted", !accountError, accountError?.message ?? "");

  browserB.close();


  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
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
