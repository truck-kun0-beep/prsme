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
  delete headers.origin;
  delete headers["access-control-request-headers"];
  delete headers["access-control-request-method"];

  const upstream = httpRequest(
    {
      host,
      port,
      method: req.method,
      path: targetPath,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, {
        ...upstreamRes.headers,
        ...corsHeaders(req),
      });
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    res.writeHead(502, {
      "content-type": "application/json",
      ...corsHeaders(req),
    });
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
 * The CORS headers every response carries.
 *
 * WHY THIS IS NEEDED HERE
 *
 * On a real Supabase project the browser and the API share an origin, so
 * there is no cross-origin request to authorise. Locally the application is
 * served from one port and the gateway from another, so EVERY call the
 * browser makes — the sign-in request, the REST reads — is cross-origin.
 *
 * Without these headers the browser refuses the response before the
 * application ever sees it, and the symptom is a sign-in form that reports
 * "that email and password don't match an account" for a correct password:
 * the request never reached the auth service, and the client turned the
 * network failure into its generic credential error.
 *
 * The origin is echoed rather than fixed, because the local stack serves
 * whatever port the application is on, and credentials are allowed because
 * the browser client sends the session cookie on these requests.
 */
function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      req.headers["access-control-request-headers"] ??
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range, x-profile-name",
    "access-control-expose-headers": "content-range, x-total-count",
    "access-control-max-age": "3600",
    vary: "Origin",
  };
}

/**
 * Answer a CORS preflight.
 *
 * The browser sends OPTIONS before a request that carries headers it did not
 * send on a "simple" request — the `apikey` header is one of them — and
 * waits for the answer. If the preflight is not answered, the real request
 * is never made.
 */
function answerPreflight(req, res) {
  res.writeHead(204, {
    ...corsHeaders(req),
    "content-length": "0",
  });
  res.end();
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

    /*
     * The preflight comes before anything else, and it is answered here
     * rather than being proxied: the upstream services do not know about
     * this gateway's origin, and a proxied preflight would come back
     * without the headers the browser needs.
     */
    if (req.method === "OPTIONS") {
      return answerPreflight(req, res);
    }

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
      res.writeHead(501, {
        "content-type": "application/json",
        ...corsHeaders(req),
      });
      res.end(
        JSON.stringify({ message: "storage is not enabled in this local stack" }),
      );
      return;
    }

    res.writeHead(200, {
      "content-type": "application/json",
      ...corsHeaders(req),
    });
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
