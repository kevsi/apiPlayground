import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, type AuthContext } from "../auth.js"
import { getChangesSince, isMember, pushChanges, type LocalChange } from "../sync-engine.js"

const sync = new Hono<{ Variables: { auth: AuthContext } }>()
sync.use("*", requireAuth)

const PushSchema = z.object({
  workspaceId: z.string(),
  changes: z.array(z.object({
    entityType: z.enum(["collection", "environment", "folder"]),
    id: z.string(),
    data: z.record(z.any()),
    updatedAt: z.number(),
    updatedBy: z.string(),
    baseVersion: z.number().optional(),
  })),
})

sync.get("/poll", (c) => {
  const auth = c.get("auth") as AuthContext
  const workspaceId = c.req.query("workspaceId")
  const since = Number(c.req.query("since") ?? "0")
  if (!workspaceId) return c.json({ error: "Missing workspaceId" }, 400)
  if (!isMember(workspaceId, auth.userId)) return c.json({ error: "Not a member" }, 403)

  const changes = getChangesSince(workspaceId, since)
  return c.json({ changes, serverTime: Date.now() })
})

sync.post("/push", async (c) => {
  const auth = c.get("auth") as AuthContext
  const body = PushSchema.parse(await c.req.json())
  if (!isMember(body.workspaceId, auth.userId)) {
    return c.json({ error: "Not a member" }, 403)
  }
  const result = pushChanges(body.workspaceId, auth.userId, body.changes as LocalChange[])
  return c.json(result)
})

export default sync
