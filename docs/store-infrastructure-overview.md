# Store Infrastructure — `reqy-web/lib/store/`

## Purpose
Core store infrastructure providing composable middleware and adapters for state management. Created via the autoresearch improvement loop to implement the "Shared Infrastructure, Independent Instances" architecture decision.

## Files

### Adapters
| File | Purpose |
|------|---------|
| `adapters/tauri-fs-adapter.ts` | Tauri filesystem adapter implementing `StorageAdapter`. Uses `@tauri-apps/plugin-fs` for atomic writes to `appDataDir`. Includes `ensureAppDataDir` helper and exponential backoff retry logic. |

### Middleware
| File | Purpose |
|------|---------|
| `middleware/with-cross-tab-sync.ts` | Cross-tab synchronization middleware using `BroadcastChannel` with `storage` event fallback. Exposes `onMessage`, `broadcast`, `listenStorage`, `cleanup` API. LWW (last-writer-wins) conflict resolution suitable for single-user desktop apps. |

## Architecture

```
useRequestStore
    │
    ├── storageAdapter (lib/storage-adapter.ts)
    │       ├── TauriFsAdapter (lib/store/adapters/tauri-fs-adapter.ts) — desktop
    │       └── IndexedDbAdapter — web fallback
    │
    └── withCrossTabSync middleware (lib/store/middleware/with-cross-tab-sync.ts)
            ├── BroadcastChannel (primary)
            └── storage event (fallback)
```

## Integration Points
- `lib/storage-adapter.ts` imports `TauriFsAdapter` from `adapters/tauri-fs-adapter.ts`
- `hooks/use-request-store.ts` uses `withCrossTabSync` middleware for cross-tab sync
- `hooks/use-request-store.ts` calls `setSyncState` / `setRetryHandler` from `use-sync-state` hook

## Design Decisions
1. **Composable middleware** — `withCrossTabSync` is a standalone module that can be composed with other middleware
2. **Single writer primitive** — The `commit` function in `useRequestStore` remains the sole mutation entry point
3. **LWW for v1** — Last-writer-wins is sufficient for single-user desktop scenarios
4. **Tauri FS as primary** — Desktop mode prefers native filesystem; IndexedDB remains web fallback
