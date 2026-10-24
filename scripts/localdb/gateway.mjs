/**
 * Phase 6.1 — the local Supabase gateway.
 *
 * The application talks to ONE origin and expects three services behind it:
 *
 *   <origin>/rest/v1/*    the REST gateway (PostgREST)
 *   <origin>/auth/v1/*    the auth service
 *   <origin>/storage/v1/* object storage
 *
 * This process is that origin. It routes the three prefixes to the three
 * services, which is the job Supabase's Kong gateway does on a real project.
 *
 * It exists because the app configures a single `NEXT_PUBLIC_SUPABASE_URL`,
 * and because the local `apikey` has to reach PostgREST as a JWT rather than
 * as an opaque string — PostgREST verifies the signature itself.
 */

import { createServer, request as httpRequest } from "node:http";
import { createHmac } from "node:crypto";

const REST_PORT = Number(process.env.PRSME_LOCAL_REST_PORT ?? 54321);
const AUTH_PORT = Number(process.env.PRSME_LOCAL_AUTH_PORT ?? 54323);
const GATEWAY_PORT = Number(process.env.PRSME_LOCAL_GATEWAY_PORT ?? 54324);

const JWT_SECRET =
  process.env.PRSME_LOCAL_JWT_SECRET
  ?? "prsme-phase6-local-development-jwt-secret-32chars";

/**
 * The local "publishable key".
 *
 * On a real Supabase project this is an opaque `sb_publishable_…` string
 * that Kong translates into an anonymous JWT before PostgREST sees it. Here
 * there is no Kong, so the key IS the anonymous JWT: a real HS256 token,
 * signed with the secret PostgREST trusts, carrying `role: anon`.
 *
 * It is deterministic — same token every run — so a build inlines a stable
 * value.
 */
export const ANON_JWT = (() => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role: "anon",
      iss: "prsme-local-auth",
      aud: "authenticated",
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
})();

/** Proxy one request body to an upstream service and pipe the response back. */
function proxy(req, res, { host, port, pathPrefix, stripPrefix }) {
  const targetPath = stripPrefix
    ? req.url.slice(pathPrefix.length) || "/"
    : req.url;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];

  const upstream = httpRequest(
    {
      host,
      port,
      method: req.method,
      path: targetPath,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message: `upstream ${host}:${port} is not reachable: ${error.message}`,
        details: "",
        hint: "",
      }),
    );
  });

  req.pipe(upstream);
}

/**
 * Start the gateway.
 *
 * `storageHandler` is optional: when supplied, `/storage/v1/*` is handled by
 * it rather than proxied.
 */
export function startGateway(port = GATEWAY_PORT, storageHandler = null) {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url.startsWith("/rest/v1")) {
      return proxy(req, res, {
        host: "127.0.0.1",
        port: REST_PORT,
        pathPrefix: "/rest/v1",
        stripPrefix: true,
      });
    }

    if (url.startsWith("/auth/v1")) {
      return proxy(req, res, {
        host: "127.0.0.1",
        port: AUTH_PORT,
        pathPrefix: "/auth/v1",
        stripPrefix: true,
      });
    }

    if (url.startsWith("/storage/v1")) {
      if (storageHandler) return storageHandler(req, res, url);
      res.writeHead(501, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ message: "storage is not enabled in this local stack" }),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        service: "prsme-local-supabase-gateway",
        rest: `http://127.0.0.1:${REST_PORT}`,
        auth: `http://127.0.0.1:${AUTH_PORT}/auth/v1`,
      }),
    );
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export { GATEWAY_PORT, JWT_SECRET };
