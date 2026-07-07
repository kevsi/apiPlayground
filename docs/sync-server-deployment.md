# sync-server deployment model

`sync-server` is an optional Hono + SQLite service that provides workspace
synchronization between reqly clients. It is **not** part of the Tauri desktop
bundle; it is a separate process that operators choose to run when they want
multi-device sync.

## Default mode: single instance

By default the sync-server runs as a **single Node.js process**. WebSocket
broadcasts are kept in memory (`sync-server/src/ws-hub.ts`). This is simple,
correct, and sufficient for:

- A single developer or small team.
- A self-hosted instance behind a reverse proxy with sticky sessions.
- Any deployment where one sync-server process serves all clients.

### Limitation

In-memory broadcasting means **WebSocket clients connected to instance A will
not receive live updates pushed to instance B**. They will still converge on
the next poll of `/api/sync/poll`.

This is the current default and is acceptable for the reqly sidecar / desktop
context, where sync is optional and users are expected to self-host a single
process.

## Horizontal scaling mode

To run multiple sync-server processes behind a load balancer (horizontal
scaling), enable Redis pub/sub:

```bash
# Point all instances to the same Redis
SYNC_SERVER_MULTI_INSTANCE=true \
  REDIS_URL=redis://redis.internal:6379 \
  pnpm --dir sync-server start
```

When `SYNC_SERVER_MULTI_INSTANCE` is `true`:

- Every push publishes a `sync:workspace:broadcast` message to Redis.
- Every instance subscribes to the same channel and forwards the message to
  its local WebSocket clients.
- `closeAll()` cleanly disconnects the Redis clients on shutdown.

Only enable this mode if you are actually running more than one sync-server
instance. The single-instance path has fewer moving parts and lower latency.

## Recommended production settings

- Run behind a reverse proxy that terminates TLS.
- Use SQLite write-ahead logging (`PRAGMA journal_mode = WAL`) for concurrent
  reads/writes (enabled by default via `sync-server/src/db.ts`).
- Back up the SQLite file regularly.
- If using Redis mode, use a managed Redis with persistence or AOF to avoid
  losing the pub/sub channel state (note: the actual workspace data lives in
  SQLite, not Redis).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SIGNING_SECRET` | Yes | HMAC signing key for auth tokens. |
| `DATABASE_URL` | Optional | SQLite file path. Defaults to `./data/sync.db`. |
| `SYNC_SERVER_MULTI_INSTANCE` | Optional | Set to `true` to enable Redis pub/sub. |
| `REDIS_URL` | When multi-instance | Redis connection string. |
| `PORT` | Optional | HTTP port. Defaults to `4000`. |
