import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import workspaces from "./routes/workspaces.js";
import memberships from "./routes/memberships.js";
import sync from "./routes/sync.js";
import { handleWsUpgrade } from "./routes/ws.js";
import { closeAll } from "./ws-hub.js";
import { parseOrigins } from "./cors/index.js";
import { apiLimiter, syncLimiter, rateLimitMiddleware } from "./rate-limiter.js";

const app = new Hono();

const allowedOrigins = parseOrigins();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        // Server-to-server or same-origin request without Origin header.
        // Return the first allowed origin as a safe default (client won't use it
        // without a matching Origin but it satisfies CORS protocol requirements).
        return allowedOrigins === "*" ? "*" : (allowedOrigins[0] ?? null);
      }
      if (allowedOrigins === "*") return origin; // echo back for credentials-less CORS
      if (allowedOrigins.includes(origin)) return origin;
      // Origin not in allowlist — block
      return null;
    },
    credentials: allowedOrigins !== "*",
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

// Body size limit: reject bodies larger than 5 MB to prevent resource exhaustion
const MAX_BODY_BYTES = 5_242_880; // 5 MB
app.use("/api/*", async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isNaN(len) && len > MAX_BODY_BYTES) {
      return c.json({ error: "Request body too large (max 5 MB)" }, 413);
    }
  }
  return next();
});

// Apply API-wide rate limiting (non-sync endpoints)
app.use("/api/workspaces/*", rateLimitMiddleware(apiLimiter));
app.use("/api/memberships/*", rateLimitMiddleware(apiLimiter));

// Sync endpoints have a lower rate limit (bursty polling)
app.use("/api/sync/*", rateLimitMiddleware(syncLimiter));

app.route("/api/workspaces", workspaces);
app.route("/api/memberships", memberships);
app.route("/api/sync", sync);

const port = Number(process.env.PORT ?? 4000);

// @hono/node-server streams request bodies natively (no Buffer.concat),
// handles chunked transfer, and integrates with Node's HTTP server lifecycle.
const node = serve(
  {
    fetch: app.fetch,
    port,
    hostname: process.env.HOST ?? "0.0.0.0",
  },
  (info) => {
    console.log(`[reqly-sync] listening on http://${info.address}:${info.port}`);
  },
);

const wss = new WebSocketServer({ noServer: true });

node.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/sync/ws")) {
    handleWsUpgrade(req, socket, head, wss);
    return;
  }
  socket.destroy();
});

function shutdown() {
  console.log("[reqly-sync] shutting down");
  closeAll();
  node.close(() => process.exit(0));
  // Force exit after 5s if close hangs
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default {
  port,
  fetch: app.fetch,
};
