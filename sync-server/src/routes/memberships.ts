import { Hono } from "hono"
import { z } from "zod"
import db from "../db.js"
import { requireAuth, type AuthContext } from "../auth.js"

const memberships = new Hono<{ Variables: { auth: AuthContext } }>()
memberships.use("*", requireAuth)

const JoinSchema = z.object({ token: z.string() })

memberships.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext
  const body = JoinSchema.parse(await c.req.json())

  const invite = db.prepare(`SELECT workspace_id, role, expires_at FROM invitations WHERE token = ?`)
    .get(body.token) as { workspace_id: string; role: string; expires_at: number } | undefined
  if (!invite) return c.json({ error: "Invalid or expired token" }, 400)
  if (invite.expires_at < Date.now()) return c.json({ error: "Token expired" }, 400)

  const now = Date.now()
  db.prepare(`INSERT OR IGNORE INTO memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)`)
    .run(invite.workspace_id, auth.userId, invite.role, now)

  const workspace = db.prepare(`SELECT id, name, owner_id as ownerId, created_at as createdAt, updated_at as updatedAt FROM workspaces WHERE id = ?`)
    .get(invite.workspace_id)

  return c.json({ workspace, role: invite.role })
})

export default memberships
