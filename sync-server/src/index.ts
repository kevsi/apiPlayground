import { Hono } from "hono"
import { cors } from "hono/cors"
import workspaces from "./routes/workspaces.js"
import memberships from "./routes/memberships.js"
import sync from "./routes/sync.js"

const app = new Hono()

app.use("*", cors({
  origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
  credentials: true,
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
