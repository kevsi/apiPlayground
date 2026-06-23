import { Hono } from "hono"
import { cors } from "hono/cors"
import workspaces from "./routes/workspaces.js"
import memberships from "./routes/memberships.js"
import sync from "./routes/sync.js"

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
console.log(`[reqly-sync] listening on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
