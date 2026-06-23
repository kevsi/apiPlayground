import { Hono } from "hono"
import { z } from "zod"
import db from "../db.js"
import { requireAuth, type AuthContext } from "../auth.js"

const workspaces = new Hono<{ Variables: { auth: AuthContext } }>()
workspaces.use("*", requireAuth)

const CreateSchema = z.object({ name: z.string().min(1).max(100) })

workspaces.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext
  const body = CreateSchema.parse(await c.req.json())
  const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  db.prepare(`INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)`)
    .run(auth.userId, auth.email, auth.name, now)

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, body.name, auth.userId, now, now)
    db.prepare(`INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`)
      .run(id, auth.userId, "owner", now)
  })
  tx()

  return c.json({ workspace: { id, name: body.name, ownerId: auth.userId, createdAt: now, updatedAt: now } })
})

workspaces.get("/", (c) => {
  const auth = c.get("auth") as AuthContext
  const rows = db.prepare(`
    SELECT w.id, w.name, w.owner_id as ownerId, w.created_at as createdAt, w.updated_at as updatedAt, m.role
    FROM workspaces w
    JOIN memberships m ON m.workspace_id = w.id
    WHERE m.user_id = ?
    ORDER BY w.updated_at DESC
  `).all(auth.userId) as any[]
  return c.json({ workspaces: rows })
})

workspaces.post("/:id/invitations", (c) => {
  const auth = c.get("auth") as AuthContext
  const id = c.req.param("id")
  const membership = db.prepare(`SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?`)
    .get(id, auth.userId) as { role: string } | undefined
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only owner can invite" }, 403)
  }
  const token = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const now = Date.now()
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000
  db.prepare(`INSERT INTO invitations (token, workspace_id, role, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(token, id, "editor", now, expiresAt, auth.userId)
  return c.json({ token, expiresAt, role: "editor" })
})

export default workspaces
