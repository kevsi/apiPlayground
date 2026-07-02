import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { WebSocketServer } from "ws"
import workspaces from "./routes/workspaces.js"
import memberships from "./routes/memberships.js"
import sync from "./routes/sync.js"
import { handleWsUpgrade } from "./routes/ws.js"
import { closeAll } from "./ws-hub.js"

const app = new Hono()

function parseOrigins(): string[] | "*" {
  const env = process.env.ALLOWED_ORIGIN
  if (!env) return ["http://localhost:3000"]
  if (env === "*") return "*"
  return env.split(",").map((o) => o.trim()).filter(Boolean)
}

const allowedOrigins = parseOrigins()

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return allowedOrigins === "*" ? "*" : allowedOrigins[0]
    if (allowedOrigins === "*") return "*"
    return allowedOrigins.includes(origin) ? origin : null
  },
  credentials: allowedOrigins !== "*",
}))

app.get("/health", (c) => c.json({ status: "ok" }))
app.route("/api/workspaces", workspaces)
app.route("/api/memberships", memberships)
app.route("/api/sync", sync)

const port = Number(process.env.PORT ?? 4000)

// @hono/node-server streams request bodies natively (no Buffer.concat),
// handles chunked transfer, and integrates with Node's HTTP server lifecycle.
const node = serve(
  {
    fetch: app.fetch,
    port,
    hostname: process.env.HOST ?? "0.0.0.0",
  },
  (info) => {
    console.log(`[reqly-sync] listening on http://${info.address}:${info.port}`)
  },
)

const wss = new WebSocketServer({ noServer: true })

node.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/sync/ws")) {
    handleWsUpgrade(req, socket, head, wss)
    return
  }
  socket.destroy()
})

function shutdown() {
  console.log("[reqly-sync] shutting down")
  closeAll()
  node.close(() => process.exit(0))
  // Force exit after 5s if close hangs
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

export default {
  port,
  fetch: app.fetch,
}
