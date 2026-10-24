/**
 * Phase 6.1 — a smoke test of the whole local stack.
 *
 * Signs up a user through the local auth service, then uses the resulting
 * token against PostgREST through the gateway, which is where RLS is
 * enforced.
 */

import { createClient } from "@supabase/supabase-js";
import { REST_URL, ANON_KEY } from "./harness.mjs";

const email = `probe-${Date.now()}@example.test`;
const password = "probe-password-123";

console.log("--- signup ---");
const signup = await fetch(`${REST_URL}/auth/v1/signup`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON_KEY },
  body: JSON.stringify({ email, password }),
});
const signupBody = await signup.json();
console.log("status:", signup.status);
console.log("has access_token:", Boolean(signupBody?.access_token));
console.log("user id:", signupBody?.user?.id);

console.log("\n--- postgrest as anon ---");
const anon = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonRead = await anon.from("media_items").select("id").limit(1);
console.log("anon select error:", anonRead.error?.message ?? "none");
console.log("anon rows:", anonRead.data?.length ?? 0);

console.log("\n--- postgrest as the signed-up user ---");
const authed = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${signupBody.access_token}` } },
});
const username = `probe${Date.now().toString().slice(-8)}`;
const profileInsert = await authed.from("profiles").insert({
  user_id: signupBody.user.id,
  username,
  visibility: "public",
});
console.log("profile insert error:", profileInsert.error?.message ?? "none");

const profileRead = await authed
  .from("profiles")
  .select("username")
  .eq("user_id", signupBody.user.id);
console.log("own profile read:", JSON.stringify(profileRead.data));

console.log("\n--- the app's own getClaims path ---");
/*
 * `getClaims()` on an HS256 token falls back to `getUser()`, which needs the
 * client to KNOW the access token. A client built with only a global header
 * has no session, so the token has to be installed the way the app installs
 * it: through `setSession()`.
 */
const sessionClient = createClient(REST_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const setSession = await sessionClient.auth.setSession({
  access_token: signupBody.access_token,
  refresh_token: signupBody.refresh_token,
});
console.log("setSession error:", setSession.error?.message ?? "none");

const claims = await sessionClient.auth.getClaims();
console.log("getClaims sub:", claims.data?.claims?.sub ?? claims.error?.message);
console.log("matches signup id:", claims.data?.claims?.sub === signupBody.user.id);
