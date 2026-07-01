#!/usr/bin/env node
/**
 * Generates the 200-error annotated dataset for ReqlyAI Copilot Phase 1.
 * Output: reqy-web/src/ai/__tests__/fixtures/error-dataset.json
 *
 * Distribution:
 *   auth        (60): 401-missing(15), 401-expired(15), 401-invalid(10),
 *                       401-basic(10), 403-scope(5), 403-admin(5)
 *   format      (50): 415-missing(15), 415-wrong(10), 400-missing(10),
 *                       400-malformed(10), 422-validation(5)
 *   performance (30): 429-with(10), 429-without(5), timeout(10), body(5)
 *   ssl         (30): ECONNREFUSED(8), ENOTFOUND(8), ETIMEDOUT(8),
 *                       CERT_EXPIRED(3), CERT_INVALID(3)
 *   server      (30): 500(10), 502(5), 503(10), 504(5)
 *
 *   TOTAL = 200
 */

const fs = require("fs");
const path = require("path");

const fixtures = [];

// ─── Realistic URL pools ──────────────────────────────────────────────────
// Each API offers multiple plausible paths and methods so we can mix-and-match.
const API_POOLS = [
  { name: "github", base: "https://api.github.com", paths: [
    "/user", "/user/repos", "/repos/{owner}/{repo}/issues", "/orgs/{org}/members",
    "/gists", "/notifications", "/search/repositories", "/user/followers",
    "/user/starred", "/repos/{owner}/{repo}/pulls", "/teams/{team_id}/discussions",
    "/user/keys", "/apps/{client_id}", "/projects/{project_id}/columns",
    "/admin/users/{username}",
  ]},
  { name: "stripe", base: "https://api.stripe.com/v1", paths: [
    "/customers", "/customers/{id}", "/charges", "/payment_intents",
    "/subscriptions", "/invoices", "/checkout/sessions", "/coupons",
    "/disputes", "/transfers", "/refunds", "/products", "/prices",
    "/payment_methods", "/setup_intents", "/connect/accounts",
  ]},
  { name: "slack", base: "https://slack.com/api", paths: [
    "/users.list", "/channels.list", "/chat.postMessage", "/conversations.history",
    "/auth.test", "/team.info", "/files.upload", "/reactions.add",
    "/search.messages", "/pins.add", "/stars.add", "/oauth.v2.access",
    "/admin.users.list", "/admin.conversations.archive", "/app.manifest.validate",
  ]},
  { name: "twilio", base: "https://api.twilio.com/2010-04-01", paths: [
    "/Accounts.json", "/Accounts/{sid}/Messages.json", "/Accounts/{sid}/Calls.json",
    "/Accounts/{sid}/Recordings.json", "/Accounts/{sid}/Conferences.json",
    "/Accounts/{sid}/Addresses.json", "/Accounts/{sid}/Queues.json",
    "/Accounts/{sid}/Calls/{call_sid}/Recordings.json",
  ]},
  { name: "openai", base: "https://api.openai.com/v1", paths: [
    "/models", "/chat/completions", "/completions", "/embeddings",
    "/images/generations", "/audio/transcriptions", "/files",
    "/fine_tuning/jobs", "/moderations", "/assistants", "/threads",
  ]},
  { name: "shopify", base: "https://{shop}.myshopify.com/admin/api/2024-04", paths: [
    "/products.json", "/products/{id}.json", "/orders.json", "/customers.json",
    "/inventory_levels.json", "/fulfillments.json", "/webhooks.json",
    "/shop.json", "/themes.json", "/collections.json",
  ]},
  { name: "atlassian", base: "https://{site}.atlassian.net/rest/api/3", paths: [
    "/issue", "/issue/{id}", "/search", "/myself", "/project", "/project/{key}",
    "/user/search", "/board/{id}/issue", "/version", "/priority",
  ]},
  { name: "spotify", base: "https://api.spotify.com/v1", paths: [
    "/me", "/me/player", "/me/top/artists", "/me/top/tracks", "/playlists/{id}",
    "/albums/{id}", "/artists/{id}", "/search", "/tracks/{id}", "/audio-features/{id}",
  ]},
  { name: "sendgrid", base: "https://api.sendgrid.com/v3", paths: [
    "/marketing/contacts", "/marketing/lists", "/marketing/segments",
    "/mail/send", "/suppression/bounces", "/suppression/blocks",
    "/api_keys", "/subusers", "/stats", "/teammates",
  ]},
  { name: "aws-s3", base: "https://{bucket}.s3.{region}.amazonaws.com", paths: [
    "/", "/{key}", "/?list-type=2", "/{key}?uploadId={id}",
    "/{key}?partNumber={n}", "/?delete", "/{key}?tagging",
  ]},
  { name: "digitalocean", base: "https://api.digitalocean.com/v2", paths: [
    "/droplets", "/droplets/{id}", "/sizes", "/images", "/volumes",
    "/snapshots/{id}", "/firewalls", "/floating_ips", "/load_balancers",
  ]},
  { name: "discord", base: "https://discord.com/api/v10", paths: [
    "/users/@me", "/guilds/{id}/members/{uid}", "/channels/{id}/messages",
    "/webhooks/{id}/{token}", "/guilds", "/applications/@me",
    "/invites/{code}", "/voice/regions", "/gateway/bot", "/users/@me/channels",
  ]},
  { name: "mapbox", base: "https://api.mapbox.com", paths: [
    "/geocoding/v5/mapbox.places/{q}.json", "/directions/v5/mapbox/driving/{c}.json",
    "/styles/v1/{u}/{s}", "/tiles/v4", "/datasets/v1/{id}",
    "/uploads/v1/{acc}/{id}", "/isochrone/v1/{prof}/{c}.json",
  ]},
  { name: "twitter", base: "https://api.twitter.com/2", paths: [
    "/users/me", "/users/{id}", "/users/by/username/{u}", "/tweets",
    "/tweets/{id}", "/tweets/search/recent", "/spaces/{id}",
    "/lists/{id}/tweets", "/followers/{id}", "/trending/places/{woeid}.json",
  ]},
  { name: "notion", base: "https://api.notion.com/v1", paths: [
    "/users", "/users/me", "/pages", "/pages/{id}", "/blocks/{id}/children",
    "/databases", "/databases/{id}/query", "/search", "/comments",
  ]},
  { name: "hubspot", base: "https://api.hubapi.com", paths: [
    "/crm/v3/objects/contacts", "/crm/v3/objects/deals", "/crm/v3/objects/companies",
    "/crm/v3/owners", "/crm/v3/pipelines/deals", "/marketing/v3/emails",
    "/cms/v3/pages", "/files/v3/files", "/tickets/v3/tickets",
  ]},
  { name: "firebase", base: "https://firestore.googleapis.com/v1", paths: [
    "/projects/{p}/databases/(default)/documents/users",
    "/projects/{p}/databases/(default)/documents/orders",
    "/projects/{p}/databases/(default)/documents/{c}",
  ]},
  { name: "google-calendar", base: "https://www.googleapis.com/calendar/v3", paths: [
    "/calendars/{cid}/events", "/calendars/{cid}", "/users/me/calendarList",
    "/calendars", "/colors", "/freeBusy",
  ]},
  { name: "github-actions", base: "https://api.github.com", paths: [
    "/repos/{owner}/{repo}/actions/runs", "/repos/{owner}/{repo}/actions/secrets",
    "/repos/{owner}/{repo}/actions/workflows", "/repos/{owner}/{repo}/environments",
    "/user/installations", "/repos/{owner}/{repo}/actions/permissions",
  ]},
  { name: "intercom", base: "https://api.intercom.io", paths: [
    "/contacts", "/conversations", "/admins", "/tags", "/segments",
    "/articles", "/teams", "/companies", "/events", "/me",
  ]},
];

// Token examples - realistic-looking JWTs (dummy signatures, NOT real tokens)
const JWT_LIKE = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.HflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik5qSTVNakkzTXpJNU9EQTROVFUzTXpVNE9UTXpNREU0T0RreE1qTTBNalkyIn0.payload.sig",
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJleHAiOjE3MjAwMDAwMDAsImlhdCI6MTcwMDAwMDAwMCwic3ViIjoidXNlcjEyMyJ9.signature",
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQ1NiIsImVtYWlsIjoiam9obkBleGFtcGxlLmNvbSIsImV4cCI6MTcyOTAwMDAwMH0.signaturepart",
  "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzc4OSIsInNjb3BlIjpbInJlYWQ6dXNlcnMiXX0.sig",
];

const PICK = (arr, i) => arr[i % arr.length];

// Helper: substitute path placeholders with realistic IDs
function fillPath(path) {
  return path
    .replace(/\{owner\}/g, () => PICK(["facebook", "microsoft", "vercel", "anthropic", "openai"], Math.random()))
    .replace(/\{repo\}/g, () => PICK(["react", "typescript", "next.js", "rust", "deno"], Math.random()))
    .replace(/\{id\}/g, () => "ch_" + Math.random().toString(36).slice(2, 12))
    .replace(/\{sid\}/g, () => "AC" + Math.random().toString(36).slice(2, 14))
    .replace(/\{call_sid\}/g, () => "CA" + Math.random().toString(36).slice(2, 14))
    .replace(/\{bucket\}/g, () => PICK(["prod-media", "user-uploads", "backups-2026", "assets-cdn"], Math.random()))
    .replace(/\{region\}/g, () => PICK(["us-east-1", "eu-west-3", "ap-southeast-2"], Math.random()))
    .replace(/\{key\}/g, () => "uploads/" + Math.random().toString(36).slice(2, 12) + ".jpg")
    .replace(/\{shop\}/g, () => PICK(["acme-co", "northwind-traders", "globex-corp", "initech"], Math.random()) + "-store")
    .replace(/\{site\}/g, () => PICK(["acme-co", "globex", "initech", "umbrella"], Math.random()))
    .replace(/\{uid\}/g, () => Math.random().toString(36).slice(2, 12))
    .replace(/\{cid\}/g, () => "cal_" + Math.random().toString(36).slice(2, 14))
    .replace(/\{p\}/g, () => "proj-" + Math.random().toString(36).slice(2, 10))
    .replace(/\{c\}/g, () => "coll_" + Math.random().toString(36).slice(2, 10))
    .replace(/\{u\}/g, () => PICK(["mapbox", "streets-v11", "satellite-v9", "light-v10"], Math.random()))
    .replace(/\{s\}/g, () => PICK(["streets-v11", "satellite-streets-v12", "dark-v11"], Math.random()))
    .replace(/\{prof\}/g, () => PICK(["driving", "walking", "cycling"], Math.random()))
    .replace(/\{q\}/g, () => "paris")
    .replace(/\{team_id\}/g, () => Math.random().toString(36).slice(2, 10))
    .replace(/\{project_id\}/g, () => Math.random().toString(36).slice(2, 10))
    .replace(/\{woeid\}/g, () => "23424819")
    .replace(/\{n\}/g, () => String(Math.floor(Math.random() * 10000)))
    .replace(/\{token\}/g, () => Math.random().toString(36).slice(2, 14));
}

function buildUrl(api, i) {
  const p = api.paths[i % api.paths.length];
  return api.base + fillPath(p);
}

function pickApi(i) {
  return PICK(API_POOLS, i);
}

// ─── Generator helpers per category ───────────────────────────────────────

function auth401Missing(i) {
  const api = pickApi(i);
  const url = buildUrl(api, i);
  const isAdmin = /\/admin\//i.test(url);
  const bodyShapes = [
    { error: "missing_token" },
    { error: "invalid_request", error_description: "Authentication credentials were not provided" },
    { error: "unauthorized" },
    { code: "AUTH_REQUIRED", message: "Authentication required" },
    { error: { type: "auth", message: "No authorization header" } },
  ];
  const shape = PICK(bodyShapes, i);
  return {
    id: `auth-401-bearer-missing-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["GET", "GET", "POST", "GET"], i),
        url,
        headers: isAdmin ? { accept: "application/json" } : { accept: "application/json" },
        body: null,
        authType: "none",
      },
      response: {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "www-authenticate": "Bearer",
          "content-type": "application/json",
        },
        body: shape,
        duration: 30 + (i * 3) % 50,
        size: 40 + (i * 7) % 30,
      },
    },
    expected: {
      ruleId: "auth.401.bearer.missing",
      severity: "error",
      title: "Token Bearer manquant",
    },
  };
}

function auth401Expired(i) {
  const api = pickApi(i + 7);
  const url = buildUrl(api, i);
  const token = PICK(JWT_LIKE, i);
  const expireMessages = [
    { error: "invalid_token", error_description: "The access token expired at 2026-06-20T12:00:00Z" },
    { error: "token_expired", message: "JWT expired at 2026-06-15T08:42:13Z" },
    { error: "invalid_token", error_description: "Token expired, please refresh" },
    { code: "TOKEN_EXPIRED", message: "Your session has expired. Please log in again." },
    { error: "invalid_token", error_description: "expired_token: bearer token has expired" },
  ];
  const shape = PICK(expireMessages, i);
  return {
    id: `auth-401-bearer-expired-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["GET", "GET", "POST", "PUT", "DELETE"], i),
        url,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "www-authenticate": `Bearer error="invalid_token", error_description="The access token expired"`,
          "content-type": "application/json",
        },
        body: shape,
        duration: 25 + (i * 5) % 40,
        size: 80 + (i * 11) % 40,
      },
    },
    expected: {
      ruleId: "auth.401.bearer.expired",
      severity: "error",
      title: "Token Bearer expiré",
    },
  };
}

function auth401Invalid(i) {
  const api = pickApi(i + 11);
  const url = buildUrl(api, i);
  const token = PICK(JWT_LIKE, i + 3);
  const invalidShapes = [
    { error: "invalid_token", error_description: "Invalid signature" },
    { error: "invalid_token", message: "Signature verification failed" },
    { code: "INVALID_TOKEN", message: "JWT is malformed or signature is invalid" },
    { error: "unauthorized", message: "Token validation failed: audience mismatch" },
    { error: "invalid_grant", message: "Bearer token rejected by introspection endpoint" },
  ];
  return {
    id: `auth-401-bearer-invalid-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["GET", "POST", "DELETE", "PATCH"], i),
        url,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        body: PICK([null, null, { foo: "bar" }], i),
        authType: "bearer",
      },
      response: {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "www-authenticate": "Bearer error=\"invalid_token\"",
          "content-type": "application/json",
        },
        body: PICK(invalidShapes, i),
        duration: 35 + (i * 4) % 30,
        size: 60 + (i * 9) % 40,
      },
    },
    expected: {
      ruleId: "auth.401.bearer.invalid",
      severity: "error",
      title: "Token Bearer invalide",
    },
  };
}

function auth401Basic(i) {
  const api = pickApi(i + 13);
  const url = buildUrl(api, i);
  const credBodies = [
    { message: "Authentication failed: invalid credentials" },
    { code: 20003, message: "Authenticate", more_info: "https://www.twilio.com/docs/errors/20003" },
    { error: "unauthorized", message: "Invalid username or password" },
    { error_description: "The user credentials were incorrect." },
    { message: "HTTP Basic: Access denied" },
  ];
  return {
    id: `auth-401-basic-bad-credentials-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url,
        headers: {
          authorization: "Basic " + Buffer.from(`user${i}:wrongpass`).toString("base64"),
          accept: "application/json",
        },
        body: i % 2 === 0 ? null : { grant_type: "client_credentials" },
        authType: "basic",
      },
      response: {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "www-authenticate": `Basic realm="${PICK(["API", "Twilio API", "Restricted area", "Jira"], i)}"`,
          "content-type": "application/json",
        },
        body: PICK(credBodies, i),
        duration: 40 + (i * 6) % 50,
        size: 70 + (i * 8) % 50,
      },
    },
    expected: {
      ruleId: "auth.401.basic.bad_credentials",
      severity: "error",
      title: "Identifiants Basic incorrects",
    },
  };
}

function auth403Scope(i) {
  const api = pickApi(i + 17);
  const url = buildUrl(api, i);
  const scopeBodies = [
    { error: "insufficient_scope", error_description: "The request requires higher privileges than provided by the access token.", scope: "users:read admin:write" },
    { error: "forbidden", message: "Token is missing required scope: repo:delete" },
    { error: { code: 40301, type: "insufficient_scope", message: "Scope 'billing:admin' required" } },
    { error: "insufficient_scope", scope: "admin", message: "Caller does not have permission" },
    { code: "FORBIDDEN", message: "Access token does not include scope: workspace:delete" },
  ];
  return {
    id: `auth-403-scope-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["POST", "PUT", "DELETE", "PATCH"], i),
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: { operation: "delete", target: "user_123" },
        authType: "bearer",
      },
      response: {
        status: 403,
        statusText: "Forbidden",
        headers: {
          "www-authenticate": `Bearer error="insufficient_scope", scope="admin:write"`,
          "content-type": "application/json",
        },
        body: PICK(scopeBodies, i),
        duration: 32 + (i * 4) % 25,
        size: 110 + (i * 7) % 60,
      },
    },
    expected: {
      ruleId: "auth.403.scope",
      severity: "error",
      title: "Scope insuffisant",
    },
  };
}

function auth403Admin(i) {
  const adminPaths = [
    "https://api.example.com/admin/users",
    "https://api.github.com/admin/organizations",
    "https://slack.com/api/admin.conversations.archive",
    "https://api.linear.app/graphql/admin/orgs",
    "https://api.notion.com/v1/admin/users",
  ];
  const adminBodies = [
    { error: "forbidden", message: "Admin privileges required to access this resource" },
    { code: "ADMIN_REQUIRED", message: "This endpoint requires administrator role" },
    { error: "forbidden", message: "User lacks admin permission for this workspace" },
    { error: { type: "auth/forbidden", message: "Admin role required" } },
    { message: "Access denied: admin-only endpoint" },
  ];
  return {
    id: `auth-403-admin-${String(i + 1).padStart(3, "0")}`,
    category: "auth",
    context: {
      request: {
        method: PICK(["GET", "POST", "DELETE"], i),
        url: PICK(adminPaths, i),
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i + 2),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
        body: PICK(adminBodies, i),
        duration: 28 + (i * 3) % 30,
        size: 75 + (i * 5) % 40,
      },
    },
    expected: {
      ruleId: "auth.403.admin",
      severity: "error",
      title: "Permissions admin requises",
    },
  };
}

// ─── Format ──────────────────────────────────────────────────────────────

function format415Missing(i) {
  const api = pickApi(i + 3);
  const url = buildUrl(api, i);
  const bodies = [
    { name: "Acme Widget", price: 1999 },
    { customer: "cus_abc123", amount: 4500 },
    { channel: "#general", text: "Hello team" },
    { repo: "vercel/next.js", issue: 12345 },
    { query: "SELECT * FROM users" },
  ];
  return {
    id: `format-415-missing-content-type-${String(i + 1).padStart(3, "0")}`,
    category: "format",
    context: {
      request: {
        method: PICK(["POST", "PUT", "PATCH", "POST"], i),
        url,
        headers: { accept: "application/json", "x-request-id": `req_${i}` },
        body: PICK(bodies, i),
        authType: "bearer",
      },
      response: {
        status: 415,
        statusText: "Unsupported Media Type",
        headers: { "content-type": "application/json", "accept": "application/json, application/xml" },
        body: {
          error: "unsupported_media_type",
          message: "Content-Type header is missing or unsupported",
        },
        duration: 18 + (i * 2) % 25,
        size: 95 + (i * 5) % 40,
      },
    },
    expected: {
      ruleId: "format.415.missing_content_type",
      severity: "error",
      title: "Content-Type manquant",
    },
  };
}

function format415Wrong(i) {
  const api = pickApi(i + 5);
  const url = buildUrl(api, i);
  const wrongTypes = ["text/plain", "application/xml", "application/x-www-form-urlencoded", "text/html", "application/yaml"];
  return {
    id: `format-415-wrong-content-type-${String(i + 1).padStart(3, "0")}`,
    category: "format",
    context: {
      request: {
        method: PICK(["POST", "PUT", "PATCH"], i),
        url,
        headers: {
          "content-type": PICK(wrongTypes, i),
          accept: "application/json",
        },
        body: { name: "Widget", sku: "W-001", price: 1999 },
        authType: "bearer",
      },
      response: {
        status: 415,
        statusText: "Unsupported Media Type",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: {
          error: "unsupported_media_type",
          message: `Only application/json is supported, got ${PICK(wrongTypes, i)}`,
          supported: ["application/json"],
        },
        duration: 20 + (i * 3) % 30,
        size: 100 + (i * 4) % 30,
      },
    },
    expected: {
      ruleId: "format.415.wrong_content_type",
      severity: "error",
      title: "Content-Type non supporté",
    },
  };
}

function format400MissingCT(i) {
  const api = pickApi(i + 8);
  const url = buildUrl(api, i);
  return {
    id: `format-400-missing-content-type-${String(i + 1).padStart(3, "0")}`,
    category: "format",
    context: {
      request: {
        method: PICK(["POST", "PUT", "PATCH"], i),
        url,
        headers: { accept: "application/json" },
        body: { field: `value_${i}`, nested: { ok: true } },
        authType: "bearer",
      },
      response: {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
        body: {
          error: "bad_request",
          message: "Missing Content-Type header for request with body",
        },
        duration: 22 + (i * 3) % 25,
        size: 85 + (i * 6) % 30,
      },
    },
    expected: {
      ruleId: "format.400.missing_content_type",
      severity: "warning",
      title: "Content-Type absent sur requête avec body",
    },
  };
}

function format400Malformed(i) {
  const api = pickApi(i + 9);
  const url = buildUrl(api, i);
  const malformedBodies = [
    { error: "invalid_json", message: "JSON parse error: unexpected EOF at line 12" },
    { message: "Unexpected token < in JSON at position 0" },
    { code: "PARSE_ERROR", detail: "Invalid JSON syntax: missing comma" },
    { error: "SyntaxError", message: "Unexpected end of JSON input" },
    { message: "Request body could not be parsed as JSON: trailing comma at line 5" },
  ];
  return {
    id: `format-400-malformed-json-${String(i + 1).padStart(3, "0")}`,
    category: "format",
    context: {
      request: {
        method: PICK(["POST", "PUT", "PATCH"], i),
        url,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: `{ "name": "Widget", "price": 1999, "sku": "W-${i}",, }`,
        authType: "bearer",
      },
      response: {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
        body: PICK(malformedBodies, i),
        duration: 15 + (i * 2) % 20,
        size: 110 + (i * 7) % 50,
      },
    },
    expected: {
      ruleId: "format.400.malformed_json",
      severity: "error",
      title: "JSON malformé",
    },
  };
}

function format422Validation(i) {
  const api = pickApi(i + 12);
  const url = buildUrl(api, i);
  const validationShapes = [
    {
      errors: [
        { field: "email", message: "must be a valid email address", code: "invalid_format" },
        { field: "age", message: "must be greater than or equal to 18", code: "out_of_range" },
      ],
      message: "Validation failed",
    },
    {
      error: "validation_failed",
      details: {
        fields: [
          { path: ["address", "zip"], errors: ["required"] },
          { path: ["items", 0, "quantity"], errors: ["must be positive integer"] },
        ],
      },
    },
    { errors: [{ field: "card_number", message: "is invalid", code: "invalid_card" }] },
    {
      errors: [
        { field: "username", code: "taken", message: "Username already exists" },
        { field: "password", code: "too_short", message: "Password must be at least 12 characters" },
      ],
    },
    { code: 422, message: "Unprocessable Entity", errors: [{ field: "title", message: "can't be blank" }] },
  ];
  return {
    id: `format-422-validation-${String(i + 1).padStart(3, "0")}`,
    category: "format",
    context: {
      request: {
        method: "POST",
        url,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: {
          email: `not-an-email-${i}`,
          age: 12,
          address: { zip: "" },
          items: [{ quantity: -1 }],
          username: PICK(["john", "alice", "bob"], i),
        },
        authType: "bearer",
      },
      response: {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "content-type": "application/json" },
        body: PICK(validationShapes, i),
        duration: 45 + (i * 4) % 30,
        size: 220 + (i * 13) % 80,
      },
    },
    expected: {
      ruleId: "format.422.validation",
      severity: "error",
      title: "Validation échouée",
    },
  };
}

// ─── Performance ─────────────────────────────────────────────────────────

function perf429With(i) {
  const api = pickApi(i + 4);
  const url = buildUrl(api, i);
  const retryAfters = ["5", "15", "30", "60", "120", "3600", "0.5", "10", "20", "45"];
  return {
    id: `perf-429-with-retry-after-${String(i + 1).padStart(3, "0")}`,
    category: "performance",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          "retry-after": PICK(retryAfters, i),
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
          "content-type": "application/json",
        },
        body: {
          error: "rate_limited",
          message: `Rate limit exceeded. Retry after ${PICK(retryAfters, i)} seconds.`,
        },
        duration: 12 + (i * 2) % 15,
        size: 90 + (i * 5) % 30,
      },
    },
    expected: {
      ruleId: "performance.429.with_retry_after",
      severity: "warning",
      title: `Rate limit (retry après ${PICK(retryAfters, i)})`,
    },
  };
}

function perf429Without(i) {
  const api = pickApi(i + 14);
  const url = buildUrl(api, i);
  return {
    id: `perf-429-without-retry-after-${String(i + 1).padStart(3, "0")}`,
    category: "performance",
    context: {
      request: {
        method: "GET",
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "0",
          "content-type": "application/json",
        },
        body: {
          error: "too_many_requests",
          message: "API rate limit exceeded. Please slow down your requests.",
        },
        duration: 10 + (i * 2) % 12,
        size: 80 + (i * 4) % 30,
      },
    },
    expected: {
      ruleId: "performance.429.generic",
      severity: "warning",
      title: "Rate limit atteint",
    },
  };
}

function perfTimeout(i) {
  const api = pickApi(i + 6);
  const url = buildUrl(api, i);
  const durations = [5100, 5800, 6300, 7200, 8400, 9100, 9700, 10500, 11200, 12000];
  return {
    id: `perf-timeout-${String(i + 1).padStart(3, "0")}`,
    category: "performance",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: PICK([200, 200, 200, 200, 502], i),
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { data: `slow_response_${i}` },
        duration: PICK(durations, i),
        size: 150 + (i * 17) % 100,
      },
    },
    expected: {
      ruleId: "performance.timeout.warning",
      severity: "warning",
      title: "Réponse lente (> 5s)",
    },
  };
}

function perfBodyLarge(i) {
  const api = pickApi(i + 16);
  const url = buildUrl(api, i);
  const sizes = [1.2 * 1024 * 1024, 1.5 * 1024 * 1024, 2.3 * 1024 * 1024, 3.7 * 1024 * 1024, 5.1 * 1024 * 1024];
  return {
    id: `perf-body-large-${String(i + 1).padStart(3, "0")}`,
    category: "performance",
    context: {
      request: {
        method: "GET",
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          "accept-encoding": "gzip",
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "content-encoding": i % 2 === 0 ? "gzip" : "identity",
          "transfer-encoding": "chunked",
        },
        body: { items: Array(1000).fill({ id: i, payload: "x".repeat(100) }) },
        duration: 1800 + (i * 200),
        size: Math.round(PICK(sizes, i)),
      },
    },
    expected: {
      ruleId: "performance.body.large",
      severity: "info",
      title: "Réponse volumineuse (> 1 Mo)",
    },
  };
}

// ─── SSL ─────────────────────────────────────────────────────────────────

function sslEconnRefused(i) {
  const targets = [
    "http://localhost:3000/api/users",
    "http://127.0.0.1:8080/health",
    "http://api.localhost:4000/v1/orders",
    "http://dev-server.internal:5000/metrics",
    "http://192.168.1.42:8000/api/v2/items",
    "http://api.staging.internal:3001/users",
    "http://10.0.0.5:9090/healthz",
    "http://db-replica.internal:5432",
  ];
  return {
    id: `ssl-econnrefused-${String(i + 1).padStart(3, "0")}`,
    category: "ssl",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url: PICK(targets, i),
        headers: { accept: "application/json" },
        body: null,
        authType: "none",
      },
      error: {
        message: "connect ECONNREFUSED " + (PICK(targets, i).replace(/^https?:\/\//, "")),
        code: "ECONNREFUSED",
        type: "network",
      },
    },
    expected: {
      ruleId: "ssl.network.econnrefused",
      severity: "error",
      title: "Connexion refusée",
    },
  };
}

function sslEnotfound(i) {
  const targets = [
    "https://api.typo-domain-xyz.io/v1/users",
    "https://my-fake-api.example-non-existent.org/orders",
    "https://dev.staging-not-deployed.acme.io/health",
    "https://api.misspelled-company.com/v2/products",
    "https://api.that-domain-was-deleted.net/items",
    "https://nonexistent-host.local/graphql",
    "https://api.wrong-subdomain.example.com/me",
    "https://old-staging.acme-corp.io/v1/data",
  ];
  return {
    id: `ssl-enotfound-${String(i + 1).padStart(3, "0")}`,
    category: "ssl",
    context: {
      request: {
        method: PICK(["GET", "POST", "PUT"], i),
        url: PICK(targets, i),
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      error: {
        message: `getaddrinfo ENOTFOUND ${PICK(targets, i).replace(/^https?:\/\//, "").split("/")[0]}`,
        code: "ENOTFOUND",
        type: "dns",
      },
    },
    expected: {
      ruleId: "ssl.dns.enotfound",
      severity: "error",
      title: "DNS non résolu",
    },
  };
}

function sslEtimedout(i) {
  const targets = [
    "https://slow-api.example.com/v1/export",
    "https://api.unreachable-host.io/orders",
    "https://frozen-server.internal/report",
    "https://api.timeout-prone.com/v2/analytics",
    "https://reporting.legacy.internal:8443/exports",
    "https://api.slow-asia-region.example.com/v1/users",
    "https://hub.private.network:9443/healthz",
    "https://batch-jobs.internal:7000/api/v1/run",
  ];
  return {
    id: `ssl-etimedout-${String(i + 1).padStart(3, "0")}`,
    category: "ssl",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url: PICK(targets, i),
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      error: {
        message: `connect ETIMEDOUT ${PICK(targets, i).replace(/^https?:\/\//, "").split("/")[0].split(":")[0]}:443`,
        code: "ETIMEDOUT",
        type: "timeout",
      },
    },
    expected: {
      ruleId: "ssl.timeout.etimedout",
      severity: "error",
      title: "Timeout réseau",
    },
  };
}

function sslCertExpired(i) {
  const targets = [
    "https://expired-cert.acme-corp.io/v1/users",
    "https://legacy-api.example.com/orders",
    "https://old-admin.partner-org.com/health",
  ];
  return {
    id: `ssl-cert-has-expired-${String(i + 1).padStart(3, "0")}`,
    category: "ssl",
    context: {
      request: {
        method: "GET",
        url: PICK(targets, i),
        headers: { accept: "application/json" },
        body: null,
        authType: "none",
      },
      error: {
        message: "Certificate has expired",
        code: "CERT_HAS_EXPIRED",
        type: "ssl",
      },
    },
    expected: {
      ruleId: "ssl.cert.expired",
      severity: "error",
      title: "Certificat SSL expiré",
    },
  };
}

function sslCertInvalid(i) {
  const targets = [
    "https://self-signed-dev.internal:8443/api",
    "https://dev.local.who-cares.me/v1/users",
    "https://unknown-ca.partner-test.io/orders",
  ];
  const codes = ["CERT_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
  return {
    id: `ssl-cert-invalid-${String(i + 1).padStart(3, "0")}`,
    category: "ssl",
    context: {
      request: {
        method: "GET",
        url: PICK(targets, i),
        headers: { accept: "application/json" },
        body: null,
        authType: "none",
      },
      error: {
        message: PICK([
          "self signed certificate",
          "unable to verify the first certificate",
          "self-signed certificate in certificate chain",
          "certificate verify failed",
        ], i),
        code: PICK(codes, i),
        type: "ssl",
      },
    },
    expected: {
      ruleId: "ssl.cert.invalid",
      severity: "error",
      title: "Certificat SSL invalide",
    },
  };
}

// ─── Server ──────────────────────────────────────────────────────────────

function server500(i) {
  const api = pickApi(i + 2);
  const url = buildUrl(api, i);
  const errMessages = [
    { error: "internal_server_error", message: "NullPointerException at line 42" },
    { code: 500, message: "Something went wrong. Our engineers have been notified." },
    { error: "Internal Server Error", trace_id: "abc-123-def-456", request_id: "req_" + i },
    { message: "Database connection pool exhausted" },
    { error: { type: "internal_error", code: "DB_QUERY_TIMEOUT", message: "Query exceeded 30s" } },
    { message: "Unhandled exception: TypeError: Cannot read property 'id' of undefined" },
    { error: "service_error", detail: "Stack overflow in analytics worker" },
    { message: "Internal error: Failed to deserialize response from upstream service" },
    { error: "internal", message: "An unexpected error occurred while processing the request" },
    { code: "INTERNAL_ERROR", message: "Cache layer unavailable, please retry" },
  ];
  return {
    id: `server-500-generic-${String(i + 1).padStart(3, "0")}`,
    category: "server",
    context: {
      request: {
        method: PICK(["GET", "POST", "PUT", "DELETE"], i),
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: PICK([null, { foo: "bar" }], i),
        authType: "bearer",
      },
      response: {
        status: 500,
        statusText: "Internal Server Error",
        headers: {
          "content-type": "application/json",
          "x-request-id": `req-${i}-server500`,
        },
        body: PICK(errMessages, i),
        duration: 80 + (i * 7) % 100,
        size: 130 + (i * 9) % 80,
      },
    },
    expected: {
      ruleId: "server.500",
      severity: "error",
      title: "Erreur interne du serveur",
    },
  };
}

function server502(i) {
  const api = pickApi(i + 10);
  const url = buildUrl(api, i);
  return {
    id: `server-502-bad-gateway-${String(i + 1).padStart(3, "0")}`,
    category: "server",
    context: {
      request: {
        method: "GET",
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 502,
        statusText: "Bad Gateway",
        headers: {
          "content-type": "text/html",
          "server": "nginx/1.25.0",
        },
        body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
        duration: 5100 + (i * 100),
        size: 167,
      },
    },
    expected: {
      ruleId: "server.502",
      severity: "error",
      title: "Passerelle défaillante",
    },
  };
}

function server503(i) {
  const api = pickApi(i + 15);
  const url = buildUrl(api, i);
  const maintBodies = [
    { error: "service_unavailable", message: "API under maintenance. Back at 14:00 UTC." },
    { code: 503, message: "Service Temporarily Unavailable", retry_after_seconds: 300 },
    { error: "maintenance", message: "Database migration in progress" },
    { message: "We're currently rolling out v2. Please retry in 5 minutes." },
    { error: "temporarily_unavailable", maintenance_window: { start: "2026-06-25T12:00:00Z", end: "2026-06-25T13:00:00Z" } },
    { code: "SERVICE_UNAVAILABLE", message: "Upstream dependency unhealthy", upstream: "postgres-primary" },
    { error: "service_unavailable", message: "Deployment in progress, pod restarting" },
    { message: "Rate limit exceeded at edge, please retry after 60 seconds" },
    { error: "deployment_in_progress", commit_sha: "a1b2c3d4", message: "Rolling restart in progress" },
    { code: 503, message: "Database connection lost, reconnecting" },
  ];
  return {
    id: `server-503-unavailable-${String(i + 1).padStart(3, "0")}`,
    category: "server",
    context: {
      request: {
        method: PICK(["GET", "POST"], i),
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          accept: "application/json",
        },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "content-type": "application/json",
          "retry-after": PICK(["30", "60", "120", "300", "900"], i),
        },
        body: PICK(maintBodies, i),
        duration: 100 + (i * 5) % 60,
        size: 150 + (i * 11) % 80,
      },
    },
    expected: {
      ruleId: "server.503",
      severity: "error",
      title: "Service indisponible",
    },
  };
}

function server504(i) {
  const api = pickApi(i + 18);
  const url = buildUrl(api, i);
  return {
    id: `server-504-gateway-timeout-${String(i + 1).padStart(3, "0")}`,
    category: "server",
    context: {
      request: {
        method: "POST",
        url,
        headers: {
          authorization: "Bearer " + PICK(JWT_LIKE, i),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: { export_format: "csv", range: "last_90_days" },
        authType: "bearer",
      },
      response: {
        status: 504,
        statusText: "Gateway Timeout",
        headers: {
          "content-type": "text/html",
          "server": "nginx/1.25.0",
        },
        body: "<html><body><h1>504 Gateway Timeout</h1><p>Upstream did not respond in time.</p></body></html>",
        duration: 30000,
        size: 162,
      },
    },
    expected: {
      ruleId: "server.504",
      severity: "error",
      title: "Timeout passerelle",
    },
  };
}

// ─── Build all fixtures ──────────────────────────────────────────────────

function buildAll() {
  // auth (60)
  for (let i = 0; i < 15; i++) fixtures.push(auth401Missing(i));
  for (let i = 0; i < 15; i++) fixtures.push(auth401Expired(i));
  for (let i = 0; i < 10; i++) fixtures.push(auth401Invalid(i));
  for (let i = 0; i < 10; i++) fixtures.push(auth401Basic(i));
  for (let i = 0; i < 5; i++) fixtures.push(auth403Scope(i));
  for (let i = 0; i < 5; i++) fixtures.push(auth403Admin(i));

  // format (50)
  for (let i = 0; i < 15; i++) fixtures.push(format415Missing(i));
  for (let i = 0; i < 10; i++) fixtures.push(format415Wrong(i));
  for (let i = 0; i < 10; i++) fixtures.push(format400MissingCT(i));
  for (let i = 0; i < 10; i++) fixtures.push(format400Malformed(i));
  for (let i = 0; i < 5; i++) fixtures.push(format422Validation(i));

  // performance (30)
  for (let i = 0; i < 10; i++) fixtures.push(perf429With(i));
  for (let i = 0; i < 5; i++) fixtures.push(perf429Without(i));
  for (let i = 0; i < 10; i++) fixtures.push(perfTimeout(i));
  for (let i = 0; i < 5; i++) fixtures.push(perfBodyLarge(i));

  // ssl (30)
  for (let i = 0; i < 8; i++) fixtures.push(sslEconnRefused(i));
  for (let i = 0; i < 8; i++) fixtures.push(sslEnotfound(i));
  for (let i = 0; i < 8; i++) fixtures.push(sslEtimedout(i));
  for (let i = 0; i < 3; i++) fixtures.push(sslCertExpired(i));
  for (let i = 0; i < 3; i++) fixtures.push(sslCertInvalid(i));

  // server (30)
  for (let i = 0; i < 10; i++) fixtures.push(server500(i));
  for (let i = 0; i < 5; i++) fixtures.push(server502(i));
  for (let i = 0; i < 10; i++) fixtures.push(server503(i));
  for (let i = 0; i < 5; i++) fixtures.push(server504(i));

  return fixtures;
}

// ─── Validation ──────────────────────────────────────────────────────────

function validate(fixtures) {
  const errors = [];

  // 1. Total count
  if (fixtures.length !== 200) {
    errors.push(`Expected 200 fixtures, got ${fixtures.length}`);
  }

  // 2. Unique IDs
  const ids = fixtures.map((f) => f.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    errors.push(`Duplicate IDs: ${[...new Set(dupes)].join(", ")}`);
  }

  // 3. Required fields
  for (const f of fixtures) {
    if (!f.id) errors.push(`Fixture missing id: ${JSON.stringify(f).slice(0, 80)}`);
    if (!f.category) errors.push(`Fixture ${f.id} missing category`);
    if (!f.context) errors.push(`Fixture ${f.id} missing context`);
    if (!f.context?.request) errors.push(`Fixture ${f.id} missing context.request`);
    if (!f.context?.response && !f.context?.error) {
      errors.push(`Fixture ${f.id} missing both context.response and context.error`);
    }
    if (!f.expected) errors.push(`Fixture ${f.id} missing expected`);
    if (!f.expected?.ruleId) errors.push(`Fixture ${f.id} missing expected.ruleId`);
    if (!f.expected?.severity) errors.push(`Fixture ${f.id} missing expected.severity`);
    if (!f.expected?.title) errors.push(`Fixture ${f.id} missing expected.title`);
  }

  // 4. Distribution
  const byCat = fixtures.reduce((a, f) => { a[f.category] = (a[f.category] || 0) + 1; return a; }, {});
  const expected = { auth: 60, format: 50, performance: 30, ssl: 30, server: 30 };
  for (const [cat, count] of Object.entries(expected)) {
    if (byCat[cat] !== count) {
      errors.push(`Category ${cat}: expected ${count}, got ${byCat[cat]}`);
    }
  }

  // 5. RuleId distribution (sanity check)
  const byRule = fixtures.reduce((a, f) => { a[f.expected.ruleId] = (a[f.expected.ruleId] || 0) + 1; return a; }, {});
  return { errors, byCat, byRule };
}

// ─── Main ────────────────────────────────────────────────────────────────

const built = buildAll();
const { errors, byCat, byRule } = validate(built);

if (errors.length) {
  console.error("VALIDATION FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log("Total fixtures:", built.length);
console.log("By category:", byCat);
console.log("By ruleId:", byRule);

// Write JSON
const outPath = path.join(
  __dirname,
  "..",
  "reqy-web",
  "src",
  "ai",
  "__tests__",
  "fixtures",
  "error-dataset.json"
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(built, null, 2) + "\n", "utf8");
console.log("Wrote:", outPath);
console.log("Size:", fs.statSync(outPath).size, "bytes");
