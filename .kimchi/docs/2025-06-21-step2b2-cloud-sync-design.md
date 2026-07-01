# Step 2b-ii — Cloud Sync MVP — Design

## Context
Reqly is a local-first API testing playground. All data (collections, environments, history) is stored in `localStorage` per-browser. This works for solo use but blocks team collaboration. The README explicitly lists "Pas de synchronisation cloud / partage multi-utilisateur" as a **🔴 Élevée** missing feature.

Step 2b-ii adds a minimal Cloud sync layer: a self-hosted backend where teams can share workspaces with token-based invitations, synced via polling with last-write-wins conflict resolution.

## Goal
Enable multiple users in a team to collaborate on collections and environments in shared workspaces, with offline-first tolerance and automatic conflict resolution.

## Approved scope (MVP)

| Element | Scope |
|---|---|
| **Backend** | SQLite local + Node.js API (Hono framework, ultra-léger) |
| **Auth** | Reuse existing HMAC cookie session + workspace share tokens |
| **Sync** | Polling every 30s (not WebSocket) |
| **Conflict resolution** | Last-write-wins by `updatedAt` timestamp |
| **Team model** | Workspaces with invitations by token (no real email in MVP) |
| **Data synced** | Collections + environments + folders + workspaces |
| **NOT synced** | History, request snapshots, settings, AI config |
| **Storage** | Server on `localhost:4000` for dev, deployable on any Node host |

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│ Reqly Web (browser)                                      │
│   ├─ Existing localStorage store (unchanged)             │
│   ├─ NEW: SyncEngine (hooks/use-sync-engine.ts)          │
│   │    ├─ poll() every 30s                              │
│   │    ├─ diff(local, remote) → patches                  │
│   │    ├─ applyPatches() with LWW                        │
│   │    └─ push() local changes                           │
│   └─ NEW: WorkspaceInvitation UI                         │
└────────────────┬────────────────────────────────────────┘
                 │ HTTPS (polling)
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Sync API server (Node.js + Hono + SQLite)                │
│   ├─ /api/sync/poll    GET → server changes since token  │
│   ├─ /api/sync/push    POST → client changes              │
│   ├─ /api/workspaces   CRUD workspaces                    │
│   ├─ /api/memberships  POST join via token               │
│   └─ /api/invitations  POST create invite token          │
└─────────────────────────────────────────────────────────┘
```

## Data model

### Server-side (SQLite)

```sql
-- Users (synced from main app auth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- matches auth_session.userId
  email TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
);

-- Workspaces (team containers)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Memberships (who can access which workspace)
CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

-- Collections (synced records)
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON blob of Collection
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  deleted INTEGER NOT NULL DEFAULT 0  -- soft delete
);

-- Environments (synced records)
CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON blob
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  deleted INTEGER NOT NULL DEFAULT 0
);

-- Folders (synced records)
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id),
  deleted INTEGER NOT NULL DEFAULT 0
);
```

### Client-side (new)

```ts
// hooks/store/types.ts additions
interface SyncState {
  enabled: boolean
  workspaceId: string | null
  serverUrl: string             // e.g. "http://localhost:4000"
  lastSyncAt: number | null
  syncing: boolean
  syncError: string | null
  conflicts: ConflictRecord[]   // for UI display
}

interface ConflictRecord {
  entityType: "collection" | "environment" | "folder"
  entityId: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  resolution: "local-wins" | "remote-wins" | "pending"
}
```

## API endpoints

All endpoints require authentication via existing HMAC cookie session (reuse `getSessionFromRequest` from `app/api/auth/session.ts`).

### `POST /api/workspaces`
Create a new workspace. Requester becomes owner.
- Request: `{ name: string }`
- Response: `{ workspace: Workspace }`

### `GET /api/workspaces`
List workspaces the user is a member of.
- Response: `{ workspaces: Workspace[] }`

### `POST /api/workspaces/:id/invitations`
Create a share token (owner only).
- Response: `{ token: string, url: string, expiresAt: number }`

### `POST /api/memberships`
Join a workspace via token.
- Request: `{ token: string }`
- Response: `{ workspace: Workspace, role: "editor" | "viewer" }`

### `GET /api/sync/poll?workspaceId=X&since=Y`
Get all changes for workspace since timestamp Y (LWW resolution applied server-side).
- Response: `{ changes: SyncChange[], serverTime: number }`

```ts
type SyncChange = {
  entityType: "collection" | "environment" | "folder"
  id: string
  data: object                 // JSON blob
  updatedAt: number
  updatedBy: string
  version: number
}
```

### `POST /api/sync/push`
Push local changes (server applies LWW).
- Request: `{ workspaceId: string, changes: LocalChange[] }`
- Response: `{ accepted: string[], conflicts: ConflictRecord[] }`

```ts
type LocalChange = {
  entityType: "collection" | "environment" | "folder"
  id: string
  data: object
  updatedAt: number
  updatedBy: string
  baseVersion?: number         // for conflict detection
}
```

## Sync protocol

### Polling (client-driven)
1. Client polls `/api/sync/poll?workspaceId=X&since=lastSyncAt` every 30s
2. Server returns all changes since that timestamp (newer versions)
3. Client applies changes with LWW (remote wins if `remote.updatedAt > local.updatedAt`)
4. Client pushes any local changes via `/api/sync/push`
5. Server applies LWW, returns conflicts where remote was newer

### Conflict resolution (last-write-wins)
- Each entity has `updatedAt` and `updatedBy`
- On push, if server's `updatedAt` is newer than client's, server rejects (returns in `conflicts[]`)
- Client merges by accepting server version (LWW)
- Conflicts are recorded in `SyncState.conflicts[]` for UI display
- No automatic retry — user can manually re-edit if needed

### Offline tolerance
- Client continues to work offline (localStorage unchanged)
- On reconnect, polling resumes, changes are pushed/pulled
- No operational transform or CRDT — just LWW

## File map

### New files

| File | Role |
|---|---|
| `sync-server/package.json` | Server dependencies (hono, better-sqlite3) |
| `sync-server/src/index.ts` | Server entry point |
| `sync-server/src/db.ts` | SQLite setup + migrations |
| `sync-server/src/routes/auth.ts` | Reuse HMAC session middleware |
| `sync-server/src/routes/workspaces.ts` | Workspace CRUD |
| `sync-server/src/routes/memberships.ts` | Token-based join |
| `sync-server/src/routes/sync.ts` | Polling + push endpoints |
| `sync-server/src/sync-engine.ts` | Server-side LWW logic |
| `sync-server/src/__tests__/sync-engine.test.ts` | Server tests |
| `reqy-web/hooks/use-sync-engine.ts` | Client sync engine |
| `reqy-web/hooks/store/sync-state.ts` | Sync state Zustand store |
| `reqy-web/components/workspace-invite-dialog.tsx` | UI to generate invite token |
| `reqy-web/components/workspace-join-dialog.tsx` | UI to join via token |
| `reqy-web/components/sync-status-banner.tsx` | (existing) extended with conflict display |
| `reqy-web/lib/sync/diff.ts` | Pure diff function (local vs remote) |
| `reqy-web/lib/sync/__tests__/diff.test.ts` | Diff tests |

### Modified files

| File | Change |
|---|---|
| `reqy-web/components/api-sidebar.tsx` | Add "Sync workspace" menu item |
| `reqy-web/hooks/store/workspaces.ts` | Add `markSynced` action |
| `reqy-web/.env.example` | Add `NEXT_PUBLIC_SYNC_URL` |

## Testing strategy

- **Server unit tests** (sync-engine, LWW resolution)
- **Client unit tests** (diff function)
- **Integration test**: start server, simulate 2 clients, verify sync
- **No E2E** for sync flow (requires persistent server + timing — defer)

## Non-goals (out of scope)

- WebSocket / SSE for real-time push
- File/attachment uploads
- History sync
- Per-request snapshots
- Granular field-level conflict resolution
- Operational transforms / CRDTs
- Email invitations (token-only for MVP)
- SSO / OAuth providers (uses existing HMAC session)
- Encryption at rest (SQLite file on disk)
- Multi-region replication
- Offline queue with retry policies (best-effort polling)
- Conflict resolution UI beyond notification banner

## Dependencies

**Server side:**
- `hono` (web framework, ~10kb, fast)
- `better-sqlite3` (synchronous SQLite, perfect for embedded use)
- `zod` (input validation)

**Client side:** none (uses existing fetch)

## Risks

- **SQLite single-writer**: fine for MVP, but won't scale beyond ~10 concurrent users
- **Polling latency**: 30s delay for changes to propagate. Acceptable for collaboration, not for real-time pair programming
- **LWW loses data**: if two users edit simultaneously, the slower one loses their changes silently (except for the conflict log)
- **No auth on server**: HMAC cookie session is the only barrier. No API keys, no rate limiting. Fine for trusted team deployments, not for public hosting
- **No migration strategy**: schema changes require manual migration scripts

## Deployment notes

For dev: `pnpm --dir sync-server dev` starts on `localhost:4000`. Client connects via `NEXT_PUBLIC_SYNC_URL=http://localhost:4000`.

For production: any Node host (Fly.io, Railway, Render, VPS). Single binary `node sync-server/dist/index.js`. SQLite file persists at `./data/reqly-sync.db`.

## Plan structure (3 chunks)

- **Chunk 1**: Server (Hono + SQLite + routes + sync engine + tests)
- **Chunk 2**: Client sync engine (diff, poll, push, LWW) + tests
- **Chunk 3**: UI (invite dialog, join dialog, sync banner) + integration + commit
