/**
 * Phase 6.1 — a GoTrue-compatible auth service for the local stack.
 *
 * WHY THIS EXISTS
 *
 * GoTrue (Supabase's auth server) ships no Windows binary, and this
 * environment has neither Docker nor WSL, so the real binary cannot run.
 * The `auth-js` client that supabase-js uses, however, speaks a small,
 * well-documented HTTP contract. This file implements exactly that contract
 * against the SAME local Postgres database the migrations were applied to.
 *
 * It is a test shim, not product code, and it lives under scripts/localdb/.
 *
 * WHAT IT IMPLEMENTS
 *
 *   POST /auth/v1/signup          create an account
 *   POST /auth/v1/token           password grant / refresh
 *   GET  /auth/v1/user            the signed-in user
 *   PUT  /auth/v1/user            update the signed-in user
 *   POST /auth/v1/logout          sign out
 *   POST /auth/v1/recover         request a password reset
 *   GET  /auth/v1/health          liveness
 *
 * The tokens it issues are real HS256 JWTs signed with the same secret
 * PostgREST is configured with, so PostgREST verifies them exactly as it
 * verifies a Supabase-issued token, and `auth.uid()` resolves the `sub`
 * claim. That is what makes the RLS policies under test the project's own
 * rather than a simulation.
 *
 * Passwords are hashed with scrypt, never stored in the clear.
 */

import { createServer } from "node:http";
import { randomUUID, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAsync = promisify(scrypt);

const PG_PORT = Number(process.env.PRSME_LOCAL_PG_PORT ?? 54322);
const AUTH_PORT = Number(process.env.PRSME_LOCAL_AUTH_PORT ?? 54323);
const JWT_SECRET = process.env.PRSME_LOCAL_JWT_SECRET
  ?? "prsme-phase6-local-development-jwt-secret-32chars";

/** The session length the local tokens carry. */
const TOKEN_TTL_SECONDS = 60 * 60;

/* -------------------------------------------------------------------------- */
/*                             Password hashing                                */
/* -------------------------------------------------------------------------- */

/**
 * Hash a password.
 *
 * The local `auth.users.encrypted_password` column holds a salted scrypt
 * digest. The salt is stored in the digest string itself, the same shape
 * Supabase uses, so the column is never a plaintext password.
 */
async function hashPassword(password) {
  const salt = randomUUID().replace(/-/g, "");
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

/** Verify a password against a stored digest. */
async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;

  const expected = Buffer.from(hex, "hex");
  const derived = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(derived, expected);
}

/* -------------------------------------------------------------------------- */
/*                                  JWT                                       */
/* -------------------------------------------------------------------------- */

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

/**
 * Sign an HS256 JWT.
 *
 * PostgREST verifies the signature against its configured `jwt-secret`, so
 * the token the app sends is genuinely verified at the database boundary.
 */
function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerPart = base64Url(JSON.stringify(header));
  const payloadPart = base64Url(JSON.stringify(payload));
  const signature = base64Url(
    createHmac("sha256", JWT_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest(),
  );
  return `${headerPart}.${payloadPart}.${signature}`;
}

/** The claims a Supabase access token carries. */
function accessTokenClaims(user, role, expiresIn) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "authenticated",
    exp: now + expiresIn,
    iat: now,
    iss: "prsme-local-auth",
    sub: user.id,
    email: user.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata ?? {},
    role,
    email_verified: Boolean(user.email_confirmed_at),
    session_id: randomUUID(),
    is_anonymous: false,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Database                                  */
/* -------------------------------------------------------------------------- */

let pool;

function db() {
  if (!pool) {
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: "postgres",
      password: "postgres",
      database: "prsme",
      max: 5,
    });
  }
  return pool;
}

/** The row shape the auth-js client expects from a user. */
function toAuthUser(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    phone: "",
    confirmed_at: row.email_confirmed_at,
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data ?? { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: false,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    HTTP                                    */
/* -------------------------------------------------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** A GoTrue-shaped error. The client reads `msg` / `error_code`. */
function sendError(res, status, message, errorCode) {
  sendJson(res, status, {
    error: errorCode ?? "unexpected_failure",
    error_code: errorCode ?? "unexpected_failure",
    msg: message,
    message,
  });
}

/** Pull the bearer token out of the request. */
function bearerToken(req) {
  const header = req.headers.authorization ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** Decode a JWT's payload without verifying it (PostgREST does that). */
function decodeClaims(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function findUserById(id) {
  const { rows } = await db().query(
    "select * from auth.users where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

async function findUserByEmail(email) {
  const { rows } = await db().query(
    "select * from auth.users where lower(email) = lower($1)",
    [email],
  );
  return rows[0] ?? null;
}

/**
 * The session payload `token` returns.
 *
 * The shape matches GoTrue's: `access_token`, `token_type`, `expires_in`,
 * `expires_at`, `refresh_token`, and the user.
 */
function sessionPayload(user, role = "authenticated") {
  const accessToken = signJwt(accessTokenClaims(user, role, TOKEN_TTL_SECONDS));
  const refreshToken = signJwt({
    ...accessTokenClaims(user, role, TOKEN_TTL_SECONDS),
    typ: "refresh_token",
    session_id: randomUUID(),
  });
  const now = Math.floor(Date.now() / 1000);

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: TOKEN_TTL_SECONDS,
    expires_at: now + TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    user: toAuthUser(user),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Routes                                   */
/* -------------------------------------------------------------------------- */

async function handleSignup(req, res, body) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return sendError(res, 400, "Email and password are required.", "validation_failed");
  }
  if (password.length < 6) {
    return sendError(
      res,
      422,
      "Password should be at least 6 characters.",
      "weak_password",
    );
  }
  if (await findUserByEmail(email)) {
    return sendError(
      res,
      422,
      "User already registered",
      "user_already_exists",
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  const { rows } = await db().query(
    `insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, $3, $4, $5, $6, $7, $7)
     returning *`,
    [
      id,
      email,
      await hashPassword(password),
      now,
      JSON.stringify({ provider: "email", providers: ["email"] }),
      JSON.stringify(body.data ?? {}),
      now,
    ],
  );

  const user = rows[0];

  await db().query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1, $2, $3, 'email', $4, $4, $4)`,
    [id, id, JSON.stringify({ sub: id, email }), now],
  );

  /*
   * The local project confirms email automatically. The PRSME sign-up form
   * handles both cases — it branches on whether a session came back — and
   * confirming here keeps the local flow to one step.
   */
  return sendJson(res, 200, sessionPayload(user));
}

async function handleToken(req, res, body) {
  const grantType = body.grant_type ?? "password";

  if (grantType === "refresh_token") {
    const token = body.refresh_token;
    const claims = typeof token === "string" ? decodeClaims(token) : null;
    if (!claims?.sub) {
      return sendError(res, 400, "Invalid refresh token", "refresh_token_not_found");
    }
    const user = await findUserById(claims.sub);
    if (!user) {
      return sendError(res, 400, "Invalid refresh token", "refresh_token_not_found");
    }
    return sendJson(res, 200, sessionPayload(user));
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return sendError(res, 400, "Email and password are required.", "validation_failed");
  }

  const user = await findUserByEmail(email);

  /*
   * ONE message for every credential failure.
   *
   * "Invalid login credentials" vs "email not confirmed" tells an attacker
   * which addresses hold an account. The client collapses the rest, but the
   * server should not hand out the distinction in the first place.
   */
  if (!user || !(await verifyPassword(password, user.encrypted_password))) {
    return sendError(res, 400, "Invalid login credentials", "invalid_credentials");
  }

  await db().query(
    "update auth.users set last_sign_in_at = now() where id = $1",
    [user.id],
  );
  user.last_sign_in_at = new Date().toISOString();

  return sendJson(res, 200, sessionPayload(user));
}

async function handleGetUser(req, res) {
  const token = bearerToken(req);
  if (!token) return sendError(res, 401, "Missing authorization header", "no_token");

  const claims = decodeClaims(token);
  if (!claims?.sub) return sendError(res, 401, "Invalid token", "invalid_token");

  const user = await findUserById(claims.sub);
  if (!user) return sendError(res, 401, "Invalid token", "invalid_token");

  return sendJson(res, 200, toAuthUser(user));
}

async function handleUpdateUser(req, res, body) {
  const token = bearerToken(req);
  if (!token) return sendError(res, 401, "Missing authorization header", "no_token");

  const claims = decodeClaims(token);
  if (!claims?.sub) return sendError(res, 401, "Invalid token", "invalid_token");

  const user = await findUserById(claims.sub);
  if (!user) return sendError(res, 401, "Invalid token", "invalid_token");

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return sendError(
        res,
        422,
        "Password should be at least 6 characters.",
        "weak_password",
      );
    }
    await db().query(
      "update auth.users set encrypted_password = $2, updated_at = now() where id = $1",
      [user.id, await hashPassword(body.password)],
    );
  }

  if (body.data && typeof body.data === "object") {
    const merged = { ...(user.raw_user_meta_data ?? {}), ...body.data };
    await db().query(
      "update auth.users set raw_user_meta_data = $2, updated_at = now() where id = $1",
      [user.id, JSON.stringify(merged)],
    );
    user.raw_user_meta_data = merged;
  }

  return sendJson(res, 200, toAuthUser(user));
}

async function handleLogout(req, res) {
  // A stateless local token has nothing server-side to revoke.
  return sendJson(res, 204, {});
}

async function handleRecover(req, res, body) {
  /*
   * The response must NOT reveal whether the address holds an account, so
   * this always answers the same way.
   */
  if (typeof body.email === "string" && body.email.trim()) {
    const user = await findUserByEmail(body.email.trim());
    if (user) {
      console.log(
        `[localauth] password reset requested for ${user.email} ` +
          "(local shim: no email is sent)",
      );
    }
  }
  return sendJson(res, 200, {});
}

/* -------------------------------------------------------------------------- */
/*                                   Server                                   */
/* -------------------------------------------------------------------------- */

export function createAuthServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${AUTH_PORT}`);
    const path = url.pathname.replace(/^\/auth\/v1/, "");

    try {
      if (req.method === "GET" && (path === "/health" || path === "/")) {
        return sendJson(res, 200, { version: "local-prsme-phase6", name: "GoTrue (local shim)" });
      }

      const body = req.method === "GET" ? {} : await readBody(req);

      if (req.method === "POST" && path === "/signup") {
        return await handleSignup(req, res, body);
      }
      if (req.method === "POST" && path === "/token") {
        return await handleToken(req, res, body);
      }
      if (req.method === "GET" && path === "/user") {
        return await handleGetUser(req, res);
      }
      if (req.method === "PUT" && path === "/user") {
        return await handleUpdateUser(req, res, body);
      }
      if (req.method === "POST" && path === "/logout") {
        return await handleLogout(req, res);
      }
      if (req.method === "POST" && path === "/recover") {
        return await handleRecover(req, res, body);
      }

      return sendError(res, 404, `Unknown auth route ${req.method} ${path}`, "not_found");
    } catch (error) {
      console.error("[localauth] unhandled error:", error);
      return sendError(res, 500, "Internal error", "unexpected_failure");
    }
  });
}

export function startAuthServer(port = AUTH_PORT) {
  const server = createAuthServer();
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export { AUTH_PORT, JWT_SECRET };
