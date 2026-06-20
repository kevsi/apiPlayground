# Hooks Module — `reqy-web/hooks/`

## Purpose
React hooks providing state management for requests, mock servers, AI context, keyboard shortcuts, and UI state. The two primary stores (`useRequestStore`, `useMockStore`) manage the entire application data layer.

## Key Hooks

### State Management
| Hook | Purpose |
|------|---------|
| `use-request-store.ts` | **Primary store.** Manages collections, environments, history, notifications, projects, workspaces, and current request/response state. Uses `storageAdapter` for persistence (IndexedDB with Tauri FS fallback). Cross-tab sync via `withCrossTabSync` middleware. |
| `use-mock-store.ts` | **Mock server store.** Manages mock routes, servers, logs, and global toggle. Persists via `persistence` class (IndexedDB). Syncs to Tauri Rust backend or Next.js API. |

### Request Execution
| Hook | Purpose |
|------|---------|
| `use-request-tab-execution.ts` | Executes HTTP requests from tab state — handles send, streaming response, cancellation. |
| `use-request-tabs-state.ts` | Manages open request tabs (open, close, reorder, dirty state). |

### AI Features
| Hook | Purpose |
|------|---------|
| `use-ai-engine.ts` | AI engine integration for request generation, response analysis, and suggestions. |
| `use-ai-context.ts` | Context provider for AI feature availability and configuration. |

### UI Utilities
| Hook | Purpose |
|------|---------|
| `use-keyboard-shortcuts.ts` | Global keyboard shortcut registration and dispatch. |
| `use-mobile.ts` | Responsive breakpoint detection for mobile layouts. |
| `use-toast.ts` | Toast notification hook (wraps sonner). |
| `use-sync-state.ts` | SyncState tracker — exposes persistence status (synced/syncing/error) with retry handler. |

### Store Mutations (sub-module)
| File | Purpose |
|------|---------|
| `store/collections.ts` | Collection CRUD mutations (add, rename, delete, reorder). |
| `store/environments.ts` | Environment variable management. |
| `store/folders.ts` | Folder mutations within collections. |
| `store/history.ts` | Request history mutations. |
| `store/notifications.ts` | Notification preferences and history. |
| `store/projects.ts` | Project CRUD operations. |
| `store/variable-mappings.ts` | Variable mapping mutations. |
| `store/workspaces.ts` | Workspace CRUD and switching. |
| `store/types.ts` | Shared store types (`CommitFn`, `WORKSPACE_PERSONAL_ID`). |

## Architecture
- **Module-level singleton stores** — `useRequestStore` and `useMockStore` hold state in module-level variables, not React state. React components subscribe via `useState` + listeners.
- **Commit pattern** — `useRequestStore` exposes a `commit(updater)` function as the single mutation primitive. Domain mutations are extracted into `store/*.ts` files, each taking `commit` as a dependency.
- **Persistence** — saves are debounced (300ms) with retry logic (3 attempts, exponential backoff). State propagates through `storageAdapter` (Tauri FS + IndexedDB fallback).

## Dependencies
- `@/lib/storage-adapter` — persistence abstraction
- `@/lib/store/middleware/with-cross-tab-sync` — cross-tab sync
- `@/lib/persistence` — legacy persistence (used by mock store)
- `@/lib/tauri-mock` — Tauri Rust backend bindings
- `@/lib/mock-types` — mock route type definitions
