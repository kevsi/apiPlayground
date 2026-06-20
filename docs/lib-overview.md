# Library Module — `reqy-web/lib/`

## Purpose
Core library providing storage persistence, API client utilities, Tauri bridge, AI engine integration, and shared types for the Reqly desktop API client.

## Key Files

### Storage & Persistence
| File | Purpose |
|------|---------|
| `storage-adapter.ts` | Abstract `StorageAdapter` interface with IndexedDB and Tauri FS implementations. `createStorageAdapter()` returns the appropriate adapter based on runtime environment. Singleton `storageAdapter` used by request store. |
| `storage-error.ts` | `StorageError`, `IndexedDbError`, `TauriError`, `SyncError` classes with structured error context and user-friendly messages. |
| `persistence.ts` | Legacy `Persistence` class with in-memory cache + IndexedDB backend. Used by `use-mock-store` for mock config, logs, and servers. |
| `secure-storage.ts` | Encrypted storage wrapper (placeholder). |
| `store/adapters/tauri-fs-adapter.ts` | Extracted Tauri filesystem adapter with `ensureAppDataDir` and atomic writes via `@tauri-apps/plugin-fs`. |
| `store/middleware/with-cross-tab-sync.ts` | Cross-tab synchronization middleware using `BroadcastChannel` with `storage` event fallback. |

### API & Networking
| File | Purpose |
|------|---------|
| `request-executor.ts` | HTTP request execution layer — builds `fetch` options, handles streaming, returns typed responses. |
| `request-bridge.ts` | Tauri-native fetch bridge — routes requests through Rust backend when running in Tauri. |
| `proxy/route.ts` | Next.js API proxy route for forwarding requests (used in web mode). |
| `api-middleware.ts` | Middleware for API route authentication and error handling. |

### Mock Server
| File | Purpose |
|------|---------|
| `mock-types.ts` | TypeScript types for `MockRoute`, `MockServer`, `MockServerConfig`, `MockRouteVariant`. |
| `mock-resolver.ts` | Path pattern matching and response resolution for mock routes. |
| `match-mock-path.ts` | URL-to-route pattern matching logic. |
| `tauri-mock.ts` | Tauri Rust backend bindings for mock route storage and global enable/disable. |
| `mock-events.ts` | Custom DOM event constants for mock config updates. |

### AI Integration
| File | Purpose |
|------|---------|
| `ai-engine.ts` | AI engine types and configuration for AI-assisted features. |
| `ai-config.ts` | AI model configuration and provider settings. |
| `ai-request-generator.ts` | AI-powered request generation from natural language. |

### Utilities
| File | Purpose |
|------|---------|
| `utils.ts` | General utility functions (cn, debounce, etc.). |
| `type-guards.ts` | Runtime type checking helpers. |
| `types.ts` | Shared TypeScript interfaces (`SavedProject`, `ProjectFile`, etc.). |
| `config.ts` | Application configuration constants. |
| `variable-mapping.ts` | Environment variable mapping utilities. |
| `variable-path.ts` | Path-based variable resolution (e.g., `{{baseUrl}}/users`). |
| `workspace-utils.ts` | Workspace ID and context resolution. |
| `project-analyzer.ts` | Static analysis of project files for API endpoints. |
| `tree-sitter-parser.ts` | Multi-language code parser using tree-sitter for endpoint detection. |
| `openapi-export.ts` / `openapi-import.ts` | OpenAPI 3.0 spec generation and parsing. |
| `import-schemas.ts` | Import schema definitions for Postman, OpenAPI, etc. |
| `detect-shared.ts` | Shared library detection (axios, fetch, etc.). |

## Architecture
The library follows a layered architecture:
1. **Storage layer** (`storage-adapter.ts`, `persistence.ts`) — handles data persistence
2. **Domain layer** (`mock-resolver.ts`, `request-executor.ts`, `variable-mapping.ts`) — business logic
3. **Integration layer** (`tauri.ts`, `tauri-mock.ts`, `request-bridge.ts`) — platform bridges
4. **AI layer** (`ai-engine.ts`, `ai-request-generator.ts`) — AI-powered features
5. **Utility layer** (`utils.ts`, `type-guards.ts`, `config.ts`) — shared helpers

## Dependencies
- `@tauri-apps/plugin-fs` — filesystem access in desktop mode
- `@tauri-apps/api` — Tauri runtime bridge
- `idb-keyval` — IndexedDB wrapper for web fallback
- `web-tree-sitter` / `tree-sitter-*` — code analysis
