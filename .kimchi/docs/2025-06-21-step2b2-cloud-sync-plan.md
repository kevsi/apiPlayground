# Step 2b-ii — Cloud Sync MVP — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Three sequential chunks — server first, then client, then UI.

**Goal:** Add cloud sync for shared workspaces — server (Hono + SQLite), client sync engine (polling + LWW), and UI (invite/join dialogs).

**Architecture:** Self-hosted Node.js server with SQLite. Client polls every 30s. Last-write-wins conflict resolution by `updatedAt` timestamp. Reuses existing HMAC cookie session for auth.

**Tech Stack:** Hono, better-sqlite3, zod (server); TypeScript, Zustand (client).

---

## File Map

### New files

| File | Role |
|---|---|
| `sync-server/package.json` | Server deps (hono, better-sqlite3, zod, tsx) |
| `sync-server/tsconfig.json` | Server TS config |
| `sync-server/src/index.ts` | Entry point |
| `sync-server/src/db.ts` | SQLite setup + migrations |
| `sync-server/src/auth.ts` | HMAC session middleware |
| `sync-server/src/routes/workspaces.ts` | Workspace CRUD |
| `sync-server/src/routes/memberships.ts` | Token-based join |
| `sync-server/src/routes/sync.ts` | Polling + push endpoints |
| `sync-server/src/sync-engine.ts` | Server-side LWW logic |
| `sync-server/src/__tests__/sync-engine.test.ts` | Server tests |
| `reqy-web/lib/sync/diff.ts` | Pure diff function |
| `reqy-web/lib/sync/__tests__/diff.test.ts` | Diff tests |
| `reqy-web/hooks/use-sync-engine.ts` | Client sync engine |
| `reqy-web/hooks/store/sync-state.ts` | Sync state Zustand store |
| `reqy-web/components/workspace-invite-dialog.tsx` | UI to generate invite token |
| `reqy-web/components/workspace-join-dialog.tsx` | UI to join via token |

### Modified files

| File | Change |
|---|---|
| `reqy-web/components/api-sidebar.tsx` | Add "Sync workspace" menu |
| `reqy-web/hooks/store/workspaces.ts` | Add `markSynced` action |
| `reqy-web/.env.example` | Add `NEXT_PUBLIC_SYNC_URL` |
| `reqy-web/components/sync-status-banner.tsx` | Extend with conflict display |

---

## Chunk 1: Server (Hono + SQLite + routes + sync engine + tests)

**Files:**
- Create: `sync-server/package.json`
- Create: `sync-server/tsconfig.json`
- Create: `sync-server/src/index.ts`
- Create: `sync-server/src/db.ts`
- Create: `sync-server/src/auth.ts`
- Create: `sync-server/src/routes/workspaces.ts`
- Create: `sync-server/src/routes/memberships.ts`
- Create: `sync-server/src/routes/sync.ts`
- Create: `sync-server/src/sync-engine.ts`
- Create: `sync-server/src/__tests__/sync-engine.test.ts`

### Step 1.1 — Create `sync-server/package.json`

```json
{
  "name": "reqly-sync-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --import tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "hono": "^4.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

### Step 1.2 — Create `sync-server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

### Step 1.3 — Create `sync-server/src/db.ts`

```ts
import Database from "better-sqlite3"
import path from "node:path"
import fs from "node:fs"

const DB_DIR = path.resolve(process.cwd(), "data")
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(path.join(DB_DIR, "reqly-sync.db"))
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memberships (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invitations (
    token TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_collections_ws ON collections(workspace_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_environments_ws ON environments(workspace_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_folders_col ON folders(collection_id, updated_at);
`)

export default db
```

### Step 1.4 — Create `sync-server/src/auth.ts`

```ts
import type { Context, Next } from "hono"
import { createHmac, timingSafeEqual } from "node:crypto"

interface SessionPayload {
  email: string
  name: string
  provider: string
  userId?: string
  expires: number
}

const COOKIE_NAME = "auth_session"

function getSecret(): string {
  const s = process.env.AUTH_SIGNING_SECRET
  if (!s) throw new Error("AUTH_SIGNING_SECRET env variable not set")
  return s
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8")
}

function createSignature(payloadBase64: string): string {
  return createHmac("sha256", getSecret()).update(payloadBase64).digest("base64url")
}

function parseSession(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null
  const [payloadBase64, signature] = cookieValue.split(".")
  if (!payloadBase64 || !signature) return null
  const expectedSignature = createSignature(payloadBase64)
  const sigBuf = Buffer.from(signature, "utf-8")
  const expBuf = Buffer.from(expectedSignature, "utf-8")
  if (sigBuf.length !== expBuf.length) return null
  if (!timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const payload = JSON.parse(decodeBase64Url(payloadBase64)) as SessionPayload
    if (payload.expires < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export interface AuthContext {
  userId: string
  email: string
  name: string
}

export async function requireAuth(c: Context, next: Next) {
  const cookieHeader = c.req.header("cookie") ?? ""
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  const session = parseSession(match?.[1])
  if (!session || !session.userId) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  c.set("auth", {
    userId: session.userId,
    email: session.email,
    name: session.name,
  } as AuthContext)
  await next()
}

export async function optionalAuth(c: Context, next: Next) {
  const cookieHeader = c.req.header("cookie") ?? ""
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  const session = parseSession(match?.[1])
  if (session && session.userId) {
    c.set("auth", {
      userId: session.userId,
      email: session.email,
      name: session.name,
    } as AuthContext)
  }
  await next()
}
```

### Step 1.5 — Create `sync-server/src/routes/workspaces.ts`

```ts
import { Hono } from "hono"
import { z } from "zod"
import db from "../db.js"
import { requireAuth, type AuthContext } from "../auth.js"

const workspaces = new Hono()
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
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000  // 7 days
  db.prepare(`INSERT INTO invitations (token, workspace_id, role, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(token, id, "editor", now, expiresAt, auth.userId)
  return c.json({ token, expiresAt, role: "editor" })
})

export default workspaces
```

### Step 1.6 — Create `sync-server/src/routes/memberships.ts`

```ts
import { Hono } from "hono"
import { z } from "zod"
import db from "../db.js"
import { requireAuth, type AuthContext } from "../auth.js"

const memberships = new Hono()
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
```

### Step 1.7 — Create `sync-server/src/sync-engine.ts`

```ts
import db from "./db.js"

export interface SyncChange {
  entityType: "collection" | "environment" | "folder"
  id: string
  data: object
  updatedAt: number
  updatedBy: string
  version: number
  deleted: boolean
}

export interface LocalChange {
  entityType: SyncChange["entityType"]
  id: string
  data: object
  updatedAt: number
  updatedBy: string
  baseVersion?: number
}

export interface PushResult {
  accepted: string[]
  conflicts: Array<{ entityType: SyncChange["entityType"]; id: string; serverVersion: number; serverUpdatedAt: number }>
}

function tableFor(entityType: SyncChange["entityType"]): string {
  if (entityType === "collection") return "collections"
  if (entityType === "environment") return "environments"
  return "folders"
}

export function getChangesSince(workspaceId: string, since: number): SyncChange[] {
  const result: SyncChange[] = []
  for (const entityType of ["collection", "environment", "folder"] as const) {
    const table = tableFor(entityType)
    const idField = entityType === "folder" ? "collection_id" : "workspace_id"
    const rows = db.prepare(`
      SELECT id, data, version, updated_at as updatedAt, updated_by as updatedBy, deleted
      FROM ${table}
      WHERE ${idField} = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).all(workspaceId, since) as any[]
    for (const row of rows) {
      result.push({
        entityType,
        id: row.id,
        data: JSON.parse(row.data),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        version: row.version,
        deleted: row.deleted === 1,
      })
    }
  }
  return result
}

export function isMember(workspaceId: string, userId: string): boolean {
  const row = db.prepare(`SELECT 1 FROM memberships WHERE workspace_id = ? AND user_id = ?`)
    .get(workspaceId, userId)
  return !!row
}

export function pushChanges(workspaceId: string, userId: string, changes: LocalChange[]): PushResult {
  const accepted: string[] = []
  const conflicts: PushResult["conflicts"] = []

  const tx = db.transaction(() => {
    for (const change of changes) {
      const table = tableFor(change.entityType)
      const idField = change.entityType === "folder" ? "collection_id" : "workspace_id"
      const existing = db.prepare(`SELECT version, updated_at as updatedAt FROM ${table} WHERE id = ?`)
        .get(change.id) as { version: number; updatedAt: number } | undefined

      // LWW: if server has newer version, reject (conflict)
      if (existing && existing.updatedAt > change.updatedAt) {
        conflicts.push({
          entityType: change.entityType,
          id: change.id,
          serverVersion: existing.version,
          serverUpdatedAt: existing.updatedAt,
        })
        continue
      }

      const newVersion = (existing?.version ?? 0) + 1
      const folderCollectionId = change.entityType === "folder"
        ? (change.data as { collectionId?: string }).collectionId ?? ""
        : ""
      const name = (change.data as { name?: string }).name ?? ""

      db.prepare(`
        INSERT INTO ${table} (id, ${idField}, name, data, version, updated_at, updated_by, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          version = excluded.version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          deleted = 0
      `).run(change.id, change.entityType === "folder" ? folderCollectionId : workspaceId, name, JSON.stringify(change.data), newVersion, change.updatedAt, userId)

      accepted.push(change.id)
    }
  })
  tx()

  return { accepted, conflicts }
}
```

### Step 1.8 — Create `sync-server/src/routes/sync.ts`

```ts
import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, type AuthContext } from "../auth.js"
import { getChangesSince, isMember, pushChanges, type LocalChange } from "../sync-engine.js"

const sync = new Hono()
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
```

### Step 1.9 — Create `sync-server/src/index.ts`

```ts
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
```

### Step 1.10 — Create `sync-server/src/__tests__/sync-engine.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest"
import db from "../db.js"
import { getChangesSince, pushChanges, isMember } from "../sync-engine.js"

const WS = "ws-test"
const USER_A = "user-a"
const USER_B = "user-b"

describe("sync engine", () => {
  beforeEach(() => {
    db.exec("DELETE FROM folders; DELETE FROM environments; DELETE FROM collections; DELETE FROM memberships; DELETE FROM workspaces; DELETE FROM users;")
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run(USER_A, "a@x", "A", 1)
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run(USER_B, "b@x", "B", 1)
    db.prepare("INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(WS, "Test", USER_A, 1, 1)
    db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(WS, USER_A, "owner", 1)
  })

  it("isMember returns true for member", () => {
    expect(isMember(WS, USER_A)).toBe(true)
  })

  it("isMember returns false for non-member", () => {
    expect(isMember(WS, USER_B)).toBe(false)
  })

  it("pushChanges inserts new collection", () => {
    const result = pushChanges(WS, USER_A, [{
      entityType: "collection",
      id: "col-1",
      data: { id: "col-1", name: "Test", requests: [] },
      updatedAt: Date.now(),
      updatedBy: USER_A,
    }])
    expect(result.accepted).toEqual(["col-1"])
    expect(result.conflicts).toEqual([])
  })

  it("getChangesSince returns pushed changes", () => {
    pushChanges(WS, USER_A, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "Test" },
      updatedAt: Date.now(),
      updatedBy: USER_A,
    }])
    const changes = getChangesSince(WS, 0)
    expect(changes).toHaveLength(1)
    expect(changes[0].entityType).toBe("collection")
    expect(changes[0].id).toBe("col-1")
  })

  it("LWW: newer server version rejects client push (conflict)", () => {
    const oldTime = Date.now() - 1000
    pushChanges(WS, USER_A, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "First" },
      updatedAt: oldTime,
      updatedBy: USER_A,
    }])
    const result = pushChanges(WS, USER_B, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "Stale" },
      updatedAt: oldTime - 500,
      updatedBy: USER_B,
    }])
    expect(result.accepted).toEqual([])
    expect(result.conflicts).toHaveLength(1)
  })

  it("LWW: newer client push updates server", () => {
    pushChanges(WS, USER_A, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "Old" },
      updatedAt: Date.now() - 1000,
      updatedBy: USER_A,
    }])
    const result = pushChanges(WS, USER_B, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "New" },
      updatedAt: Date.now(),
      updatedBy: USER_B,
    }])
    expect(result.accepted).toEqual(["col-1"])
    const changes = getChangesSince(WS, Date.now() - 100)
    const col = changes.find((c) => c.id === "col-1")
    expect(col?.data).toMatchObject({ name: "New" })
  })

  it("getChangesSince filters by timestamp", () => {
    pushChanges(WS, USER_A, [{
      entityType: "collection",
      id: "col-1",
      data: { name: "Old" },
      updatedAt: 1000,
      updatedBy: USER_A,
    }])
    pushChanges(WS, USER_A, [{
      entityType: "environment",
      id: "env-1",
      data: { name: "Env" },
      updatedAt: 2000,
      updatedBy: USER_A,
    }])
    expect(getChangesSince(WS, 1500)).toHaveLength(1)
    expect(getChangesSince(WS, 0)).toHaveLength(2)
  })
})
```

### Step 1.11 — Install + verify

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/sync-server
# Install will require network — if not available, just verify files compile
pnpm install 2>&1 | tail -10 || echo "install skipped (network unavailable)"
pnpm exec tsc --noEmit
pnpm exec vitest run
```

If `pnpm install` fails due to network, at least verify TypeScript compiles (it will fail on missing node_modules, but the agent should report this).

### Step 1.12 — Commit

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add sync-server/
git commit -m "feat(sync): Hono + SQLite server with workspaces, memberships, sync engine"
```

---

## Chunk 2: Client sync engine (diff, poll, push, LWW) + tests

**Files:**
- Create: `reqy-web/lib/sync/diff.ts`
- Create: `reqy-web/lib/sync/__tests__/diff.test.ts`
- Create: `reqy-web/hooks/use-sync-engine.ts`
- Create: `reqy-web/hooks/store/sync-state.ts`
- Modify: `reqy-web/hooks/store/workspaces.ts`

### Step 2.1 — Create `reqy-web/lib/sync/diff.ts`

```ts
export interface SyncEntity {
  id: string
  data: object
  updatedAt: number
  version: number
}

export interface DiffResult<T extends SyncEntity> {
  toUpsert: T[]
  toDelete: T[]
  unchanged: T[]
}

export function diffSyncEntities<T extends SyncEntity>(
  local: T[],
  remote: T[]
): { toUpsertRemote: T[]; toUpsertLocal: T[]; toDeleteRemote: T[]; unchanged: T[] } {
  const localMap = new Map(local.map((e) => [e.id, e]))
  const remoteMap = new Map(remote.map((e) => [e.id, e]))

  const toUpsertRemote: T[] = []
  const toUpsertLocal: T[] = []
  const toDeleteRemote: T[] = []
  const unchanged: T[] = []

  // Remote changes to apply locally
  for (const [id, r] of remoteMap) {
    const l = localMap.get(id)
    if (!l) {
      // New on remote
      if (!r.deleted) toUpsertRemote.push(r)
    } else if (r.updatedAt > l.updatedAt) {
      // Remote newer → apply remote
      if (r.deleted) toDeleteRemote.push(r)
      else toUpsertRemote.push(r)
    } else {
      // Local newer or equal → push local
      unchanged.push(l)
    }
  }

  // Local changes to push
  for (const [id, l] of localMap) {
    if (!remoteMap.has(id)) {
      toUpsertLocal.push(l)
    }
    // (already handled above if exists in both)
  }

  return { toUpsertRemote, toUpsertLocal, toDeleteRemote, unchanged }
}

export type SyncEntityWithDelete<T> = T & { deleted?: boolean }
```

### Step 2.2 — Create `reqy-web/lib/sync/__tests__/diff.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { diffSyncEntities } from "@/lib/sync/diff"

describe("diffSyncEntities", () => {
  it("remote newer → upsert remote locally", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote = [{ id: "1", data: { x: 1 }, updatedAt: 200, version: 2 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertRemote).toHaveLength(1)
    expect(r.toUpsertLocal).toHaveLength(0)
  })

  it("local newer → push local", () => {
    const local = [{ id: "1", data: { x: 2 }, updatedAt: 200, version: 2 }]
    const remote = [{ id: "1", data: { x: 1 }, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertLocal).toHaveLength(1)
    expect(r.toUpsertRemote).toHaveLength(0)
  })

  it("equal timestamps → unchanged", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.unchanged).toHaveLength(1)
  })

  it("remote-only entity → upsert remote", () => {
    const local: any[] = []
    const remote = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertRemote).toHaveLength(1)
  })

  it("local-only entity → push local", () => {
    const local = [{ id: "1", data: {}, updatedAt: 100, version: 1 }]
    const remote: any[] = []
    const r = diffSyncEntities(local, remote)
    expect(r.toUpsertLocal).toHaveLength(1)
  })
})
```

### Step 2.3 — Create `reqy-web/hooks/store/sync-state.ts`

```ts
"use client"
import { create } from "zustand"

export interface ConflictRecord {
  entityType: "collection" | "environment" | "folder"
  entityId: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  resolution: "local-wins" | "remote-wins"
}

export interface SyncState {
  enabled: boolean
  workspaceId: string | null
  serverUrl: string
  lastSyncAt: number | null
  syncing: boolean
  syncError: string | null
  conflicts: ConflictRecord[]
  setEnabled: (enabled: boolean) => void
  setWorkspace: (workspaceId: string | null) => void
  setServerUrl: (url: string) => void
  setSyncing: (syncing: boolean) => void
  setSyncError: (error: string | null) => void
  setLastSyncAt: (timestamp: number) => void
  addConflict: (conflict: ConflictRecord) => void
  clearConflicts: () => void
}

export const useSyncState = create<SyncState>((set) => ({
  enabled: false,
  workspaceId: null,
  serverUrl: "",
  lastSyncAt: null,
  syncing: false,
  syncError: null,
  conflicts: [],
  setEnabled: (enabled) => set({ enabled }),
  setWorkspace: (workspaceId) => set({ workspaceId }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  addConflict: (conflict) => set((s) => ({ conflicts: [...s.conflicts, conflict] })),
  clearConflicts: () => set({ conflicts: [] }),
}))
```

### Step 2.4 — Create `reqy-web/hooks/use-sync-engine.ts`

```ts
"use client"
import { useEffect, useRef, useCallback } from "react"
import { useSyncState } from "@/hooks/store/sync-state"
import { useRequestStore } from "@/hooks/use-request-store"

const POLL_INTERVAL_MS = 30_000

export function useSyncEngine() {
  const sync = useSyncState()
  const store = useRequestStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollOnce = useCallback(async () => {
    if (!sync.enabled || !sync.workspaceId || !sync.serverUrl) return
    sync.setSyncing(true)
    sync.setSyncError(null)
    try {
      const res = await fetch(
        `${sync.serverUrl}/api/sync/poll?workspaceId=${encodeURIComponent(sync.workspaceId)}&since=${sync.lastSyncAt ?? 0}`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
      const data = await res.json()
      // Apply remote changes
      for (const change of data.changes ?? []) {
        if (change.deleted) continue
        if (change.entityType === "collection") {
          store.upsertCollectionFromSync?.(change.data)
        } else if (change.entityType === "environment") {
          store.upsertEnvironmentFromSync?.(change.data)
        } else if (change.entityType === "folder") {
          store.upsertFolderFromSync?.(change.data)
        }
      }
      sync.setLastSyncAt(data.serverTime ?? Date.now())
    } catch (err) {
      sync.setSyncError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      sync.setSyncing(false)
    }
  }, [sync, store])

  const pushLocalChanges = useCallback(async (changes: any[]) => {
    if (!sync.enabled || !sync.workspaceId || !sync.serverUrl || changes.length === 0) return
    try {
      const res = await fetch(`${sync.serverUrl}/api/sync/push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: sync.workspaceId, changes }),
      })
      if (!res.ok) throw new Error(`Push failed: ${res.status}`)
      const data = await res.json()
      for (const c of data.conflicts ?? []) {
        sync.addConflict({
          entityType: c.entityType,
          entityId: c.id,
          localUpdatedAt: Date.now(),
          remoteUpdatedAt: c.serverUpdatedAt,
          resolution: "remote-wins",
        })
      }
    } catch (err) {
      sync.setSyncError(err instanceof Error ? err.message : "Push failed")
    }
  }, [sync])

  useEffect(() => {
    if (!sync.enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }
    pollOnce()
    intervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sync.enabled, pollOnce])

  return { pollOnce, pushLocalChanges }
}
```

### Step 2.5 — Modify `reqy-web/hooks/store/workspaces.ts`

Add new sync-related actions. Read the current file first, then add:

```ts
// Add to the createWorkspacesMutations function (or alongside it):
const upsertCollectionFromSync = (data: any) => {
  commit((prev) => ({
    ...prev,
    collections: [
      ...prev.collections.filter((c) => c.id !== data.id),
      { ...data, updatedAt: Date.now() },
    ],
  }))
}
const upsertEnvironmentFromSync = (data: any) => {
  commit((prev) => ({
    ...prev,
    environments: [
      ...prev.environments.filter((e) => e.id !== data.id),
      { ...data, updatedAt: Date.now() },
    ],
  }))
}
const upsertFolderFromSync = (data: any) => {
  commit((prev) => ({
    ...prev,
    folders: [
      ...prev.folders.filter((f) => f.id !== data.id),
      { ...data, updatedAt: Date.now() },
    ],
  }))
}

return { ..., upsertCollectionFromSync, upsertEnvironmentFromSync, upsertFolderFromSync }
```

### Step 2.6 — Verify

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run lib/sync/__tests__/
npx tsc --noEmit
```

Expected: 5 diff tests pass, TS clean.

### Step 2.7 — Commit

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add reqy-web/lib/sync/ reqy-web/hooks/use-sync-engine.ts reqy-web/hooks/store/sync-state.ts reqy-web/hooks/store/workspaces.ts
git commit -m "feat(sync): client sync engine with diff, polling, push, LWW"
```

---

## Chunk 3: UI (invite/join dialogs + integration + commit)

**Files:**
- Create: `reqy-web/components/workspace-invite-dialog.tsx`
- Create: `reqy-web/components/workspace-join-dialog.tsx`
- Modify: `reqy-web/components/api-sidebar.tsx`
- Modify: `reqy-web/components/sync-status-banner.tsx`
- Modify: `reqy-web/.env.example`

### Step 3.1 — Create `workspace-invite-dialog.tsx`

```tsx
"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, UserPlus } from "lucide-react"
import { useSyncState } from "@/hooks/store/sync-state"

interface Props {
  workspaceId: string
  workspaceName: string
}

export function WorkspaceInviteDialog({ workspaceId, workspaceName }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const serverUrl = useSyncState((s) => s.serverUrl)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${serverUrl}/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setToken(data.token)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    if (token) navigator.clipboard.writeText(`${window.location.origin}/join?token=${token}`)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="w-3 h-3 mr-1" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {workspaceName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!token ? (
            <Button onClick={generate} disabled={loading}>
              {loading ? "Generating..." : "Generate invite token"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input value={token} readOnly />
              <Button size="icon" variant="outline" onClick={copy}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Token expires in 7 days. Share with your teammate.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 3.2 — Create `workspace-join-dialog.tsx`

```tsx
"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSyncState } from "@/hooks/store/sync-state"

export function WorkspaceJoinDialog() {
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const serverUrl = useSyncState((s) => s.serverUrl)
  const setWorkspace = useSyncState((s) => s.setWorkspace)
  const setEnabled = useSyncState((s) => s.setEnabled)

  const join = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${serverUrl}/api/memberships`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error(`Join failed: ${res.status}`)
      const data = await res.json()
      setWorkspace(data.workspace.id)
      setEnabled(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Join workspace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="inv-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button onClick={join} disabled={loading || !token}>
            {loading ? "Joining..." : "Join"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 3.3 — Modify `api-sidebar.tsx`

Read the current file. Add menu items for sync actions. Find the workspace selector section and add:

```tsx
import { WorkspaceInviteDialog } from "@/components/workspace-invite-dialog"
import { WorkspaceJoinDialog } from "@/components/workspace-join-dialog"
import { useSyncState } from "@/hooks/store/sync-state"

// Inside the sidebar component, near workspace selector:
const activeWorkspaceId = useSyncState((s) => s.workspaceId)
const syncEnabled = useSyncState((s) => s.enabled)

// Add to the workspace actions area:
<WorkspaceJoinDialog />
{activeWorkspaceId && syncEnabled && (
  <WorkspaceInviteDialog
    workspaceId={activeWorkspaceId}
    workspaceName={activeWorkspaceName ?? "workspace"}
  />
)}
```

The exact integration depends on the existing component structure. Find the workspace dropdown/section and add the dialogs there. If the structure is too complex, MINIMUM: add a single "Sync" button to the sidebar that opens a menu with the dialogs.

### Step 3.4 — Modify `sync-status-banner.tsx`

Read the existing file. Extend to show conflict count:

```tsx
// In the banner, if conflicts.length > 0, show:
{conflicts.length > 0 && (
  <span className="text-orange-600">
    {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} resolved (server won)
  </span>
)}
```

### Step 3.5 — Update `.env.example`

Append to `reqy-web/.env.example`:
```
# Cloud sync (optional — requires sync-server running)
NEXT_PUBLIC_SYNC_URL=http://localhost:4000
```

### Step 3.6 — Verify

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit
npx vitest run
```

Expected: no new TS errors, no new test failures.

### Step 3.7 — Commit

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add reqy-web/components/workspace-invite-dialog.tsx reqy-web/components/workspace-join-dialog.tsx reqy-web/components/api-sidebar.tsx reqy-web/components/sync-status-banner.tsx reqy-web/.env.example
git commit -m "feat(sync): invite/join dialogs + sidebar integration + conflict banner"
```

---

## Final verification

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run
npx tsc --noEmit
```

Expected: existing tests pass (now ~283 with 5 new diff tests + 6 server tests = ~295 total), no new TS errors.

## Notes for implementation agents

- The server (`sync-server/`) is a new top-level workspace package. It needs its own `pnpm install` to get `hono`, `better-sqlite3`, `zod`. If network is unavailable, skip install but verify TS compiles against existing node_modules.
- The client (`reqy-web/`) reuses existing fetch — no new deps.
- The `upsert*FromSync` actions on the workspace store must NOT trigger another sync push (infinite loop). The store actions should be sync-aware.
- If the HMAC session cookie format in `sync-server/src/auth.ts` doesn't match exactly what the main app sets, users won't be able to sync. The agent should verify the cookie format matches `app/api/auth/session.ts` in the main app.
