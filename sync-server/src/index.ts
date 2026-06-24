import http from "node:http"
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

const server = http.createServer(async (req, res) => {
  try {
    const protocol = (req.headers["x-forwarded-proto"] as string) ?? "http"
    const host = req.headers.host ?? `localhost:${port}`
    const url = `${protocol}://${host}${req.url ?? "/"}`
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null) continue
      if (Array.isArray(v)) headers.set(k, v.join(", "))
      else headers.set(k, v)
    }

    const method = req.method ?? "GET"
    const init: RequestInit = { method, headers }

    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      init.body = Buffer.concat(chunks)
      // `duplex` is a Node fetch extension not in lib.dom's RequestInit
      ;(init as RequestInit & { duplex?: "half" | "full" }).duplex = "half"
    }

    const honoRes = await app.fetch(new Request(url, init))
    res.statusCode = honoRes.status
    honoRes.headers.forEach((v, k) => res.setHeader(k, v))
    const body = await honoRes.arrayBuffer()
    res.end(Buffer.from(body))
  } catch (err) {
    res.statusCode = 500
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }))
  }
})

const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/sync/ws")) {
    handleWsUpgrade(req, socket, head, wss)
    return
  }
  socket.destroy()
})

server.listen(port, () => {
  console.log(`[reqly-sync] listening on http://localhost:${port}`)
})

function shutdown() {
  console.log("[reqly-sync] shutting down")
  closeAll()
  server.close(() => process.exit(0))
  // Force exit after 5s if close hangs
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

export default {
  port,
  fetch: app.fetch,
}
