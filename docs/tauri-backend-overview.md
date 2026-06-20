# Tauri Backend — `src-tauri/src/`

## Purpose
Rust backend for the Reqly desktop application. Provides native HTTP proxying, mock server state management, and path pattern matching — all running locally via Tauri v2.

## Key Files

| File | Purpose |
|------|---------|
| `main.rs` | Application entry point. Registers Tauri commands (`fetch_proxy`, `get_mock_routes`, `set_mock_routes`, etc.) and initializes plugins (fs, dialog). |
| `lib.rs` | Tauri setup and command registration. Wires together mock store, mock matcher, and the HTTP fetch proxy. |
| `mock_store.rs` | In-memory mock route store with file persistence. Commands: `get_mock_routes`, `set_mock_routes`, `get_mock_enabled`, `set_mock_enabled`. Routes are loaded from a JSON file in the app data directory on startup. |
| `mock_matcher.rs` | URL path pattern matching — matches incoming request paths against configured mock route patterns (supports path params like `:id`, wildcards). |
| `mock_types.rs` | Rust type definitions for `MockRoute`, `MockMatch`, `MockServerConfig`. Mirrors the TypeScript types in `reqy-web/lib/mock-types.ts`. |

## Architecture

```
main.rs → lib.rs
          ├── fetch_proxy (HTTP proxy via reqwest)
          ├── mock_store (in-memory + file-persisted routes)
          │   └── mock_matcher (path pattern matching)
          └── mock_types (shared types)
```

### HTTP Proxy (`fetch_proxy`)
- Receives method, URL, headers, and optional body from the frontend
- Forwards the request via `reqwest` (Rust HTTP client)
- Returns status, body, headers, duration, and encoding back to the frontend
- Bypasses CORS restrictions entirely (runs on localhost)

### Mock Store (`mock_store`)
- Holds mock routes in a `Vec<MockRoute>` protected by `Mutex`
- Persists to a JSON file in the Tauri app data directory
- Commands: `get_mock_routes` → returns all routes; `set_mock_routes` → replaces all routes
- Global enable/disable toggle persisted separately

### Mock Matcher (`mock_matcher`)
- Tests incoming request method + path against each route's pattern
- Supports `:param` segments (e.g., `/users/:id`) and trailing wildcards
- Returns the first matching route's response configuration

## Commands (Tauri IPC)
| Command | Args | Returns |
|---------|------|---------|
| `fetch_proxy` | method, url, headers, body | status, body, headers, durationMs, mocked |
| `get_mock_routes` | — | `Vec<MockRoute>` |
| `set_mock_routes` | routes: Vec<MockRoute> | — |
| `get_mock_enabled` | — | bool |
| `set_mock_enabled` | enabled: bool | — |

## Dependencies (Cargo.toml)
- `tauri` v2 — desktop application framework
- `reqwest` — HTTP client for proxying
- `serde` / `serde_json` — serialization
- `tauri-plugin-fs` — filesystem access
- `tauri-plugin-dialog` — native dialogs
