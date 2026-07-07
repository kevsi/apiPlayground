# Mockoon-Only Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy mock server subsystem entirely and wire the UI to the Mockoon CLI sidecar as the sole mock engine.

**Architecture:**
- Mockoon CLI sidecar remains the only mock runtime (`@mockoon/cli` on `127.0.0.1:3001` by default).
- `useMockStore` persists routes in `localStorage`, calls `/api/mockoon/reload` to convert active routes into a Mockoon environment, and stores the sidecar `baseUrl` returned by the reload call.
- The mocks page displays the sidecar base URL + server prefix and tests routes by making real HTTP calls against the sidecar.
- Legacy Next.js routes (`/api/mock/*`), legacy libraries (`mock-store.ts`, `mock-resolver.ts`, `match-mock-path.ts`, `schemas/mock-config.ts`), and legacy Rust modules (`mock_store.rs`, `mock_matcher.rs`, `mock_types.rs`) are deleted.

**Tech Stack:** TypeScript, Next.js, Tauri, `@mockoon/cli`, Rust, Vitest, Playwright.

---

## File Structure Decisions

| File | Responsibility |
|---|---|
| `reqy-web/lib/mockoon/adapter.ts` | Convert `MockRoute[]` + `MockServer[]` into Mockoon routes, prefixing endpoints with server `localPrefix`. |
| `reqy-web/lib/mockoon/sidecar.ts` | Spawn/manage Mockoon CLI child process. |
| `reqy-web/lib/mockoon/types.ts` | Mockoon environment types. |
| `reqy-web/app/api/mockoon/reload/route.ts` | Receive routes, reload sidecar, return `{ baseUrl, pid }`. |
| `reqy-web/lib/tauri-mock.ts` | Keep only `reloadMockoonServer`. Remove Tauri Rust mock IPC helpers. |
| `reqy-web/hooks/use-mock-store.ts` | Persist routes in localStorage, call `/api/mockoon/reload`, store sidecar base URL in hook state. Remove `/api/mock/config` and Tauri mock calls. |
| `reqy-web/app/(app)/mocks/page.tsx` | Display sidecar base URL + prefix, test routes via real HTTP to sidecar. |
| `reqy-web/app/api/proxy/route.ts` | Remove mock interception block. |
| `reqy-web/hooks/use-request-tab-execution.ts` | Remove legacy mock config bootstrap effect. |

---

## Chunk 1: Delete Legacy Next.js Backend

**Files:**
- Delete: `reqy-web/app/api/mock/[...path]/route.ts`
- Delete: `reqy-web/app/api/mock/config/route.ts`
- Delete: `reqy-web/lib/mock-store.ts`
- Delete: `reqy-web/lib/mock-resolver.ts`
- Delete: `reqy-web/lib/match-mock-path.ts`
- Delete: `reqy-web/lib/schemas/mock-config.ts`
- Delete: `reqy-web/lib/__tests__/mock-resolver.test.ts`
- Delete: `reqy-web/lib/__tests__/match-mock-path.test.ts`
- Delete: `scripts/validate-mock-matcher.ts`
- Delete: `reqy-web/test-mock/index.html`
- Delete: `reqy-web/test-mock/test-routes.mjs`

**Steps:**

- [ ] **Step 1: Delete the listed files and directories**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
rm -rf reqy-web/app/api/mock
rm reqy-web/lib/mock-store.ts
rm reqy-web/lib/mock-resolver.ts
rm reqy-web/lib/match-mock-path.ts
rm reqy-web/lib/schemas/mock-config.ts
rm reqy-web/lib/__tests__/mock-resolver.test.ts
rm reqy-web/lib/__tests__/match-mock-path.test.ts
rm scripts/validate-mock-matcher.ts
rm -rf reqy-web/test-mock
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor(mock): remove legacy Next.js mock server backend

- Delete /api/mock/* route handlers
- Delete mock-store, mock-resolver, match-mock-path, schemas/mock-config
- Delete associated unit tests and standalone validation scripts"
```

---

## Chunk 2: Delete Legacy Rust Backend

**Files:**
- Delete: `src-tauri/src/mock_store.rs`
- Delete: `src-tauri/src/mock_matcher.rs`
- Delete: `src-tauri/src/mock_types.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Delete Rust modules**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
rm src-tauri/src/mock_store.rs
rm src-tauri/src/mock_matcher.rs
rm src-tauri/src/mock_types.rs
```

**Step 2: Clean up `src-tauri/src/lib.rs`**

Remove:

```rust
mod mock_matcher;
mod mock_store;
mod mock_types;

use mock_store::MockStore;
use mock_types::MockRoute;

static MOCK_STORE: OnceLock<MockStore> = OnceLock::new();

fn get_mock_store() -> &'static MockStore {
  MOCK_STORE.get().expect("MockStore not initialized")
}

fn parse_mock_store_path(app: &AppHandle) -> PathBuf { ... }

#[tauri::command]
fn get_mock_routes() -> Vec<MockRoute> { ... }

#[tauri::command]
fn set_mock_routes(routes: Vec<MockRoute>) { ... }

#[tauri::command]
fn add_mock_route(route: MockRoute) { ... }

#[tauri::command]
fn update_mock_route(id: String, route: MockRoute) -> Result<(), String> { ... }

#[tauri::command]
#[allow(dead_code)]
fn delete_mock_route(id: String) { ... }

#[tauri::command]
fn toggle_mock_enabled(id: String) -> Result<(), String> { ... }

#[tauri::command]
fn is_mock_enabled_globally() -> bool { ... }

#[tauri::command]
fn set_mock_enabled_globally(enabled: bool) { ... }
```

Remove the mock-interception block inside `fetch_proxy`:

```rust
// Check mock store first — intercept before SSRF checks or network calls
if let Some(mock) = get_mock_store().find_mock_match(&method, &url, &headers) {
  ...
}
```

Remove mock command registration from `.invoke_handler(...)`:

```rust
get_mock_routes,
set_mock_routes,
add_mock_route,
update_mock_route,
toggle_mock_enabled,
is_mock_enabled_globally,
set_mock_enabled_globally,
```

Remove the `MockStore` initialization from `.setup(...)`:

```rust
// Initialize mock store (file-persisted, survives restarts)
let store_path = parse_mock_store_path(app.handle());
let store = MockStore::new(store_path);
...
```

**Step 3: Verify Rust compilation**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri
cargo check
```

Expected: no errors.

**Step 4: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add -A
git commit -m "refactor(mock): remove legacy Rust mock store and matcher

- Delete mock_store.rs, mock_matcher.rs, mock_types.rs
- Remove mock commands and fetch_proxy interception from lib.rs"
```

---

## Chunk 3: Update Adapter for Server Prefix

**Files:**
- Modify: `reqy-web/lib/mockoon/adapter.ts`
- Modify: `reqy-web/lib/mockoon/__tests__/adapter.test.ts`

**Step 1: Update `convertMockRoutesToEnvironment` to accept server prefix**

Change the function signature and route conversion so each route's endpoint is prefixed with its server's `localPrefix`.

```typescript
// reqy-web/lib/mockoon/adapter.ts

import type { MockRoute, MockRouteVariant, MockServer } from "@/lib/mock-types"
import type {
  MockoonEnvironment,
  MockoonRoute,
  MockoonResponse,
} from "./types"

let _uuidCounter = 0

function generateUuid(): string {
  _uuidCounter++
  return `reqy-${Date.now()}-${_uuidCounter}`
}

export function resetUuidCounter(): void {
  _uuidCounter = 0
}

function buildEndpoint(pathPattern: string, prefix?: string): string {
  const normalizedPrefix = prefix?.replace(/^\/+|\/$/g, "") || ""
  const normalizedPath = pathPattern.replace(/^\/?/, "/")
  if (!normalizedPrefix) return normalizedPath
  return `/${normalizedPrefix}${normalizedPath}`
}

function convertVariantToResponse(
  route: MockRoute,
  variant: MockRouteVariant,
): MockoonResponse {
  return {
    uuid: generateUuid(),
    body: variant.responseBody,
    latency: variant.delay,
    statusCode: variant.responseStatus,
    label: variant.name,
    headers: Object.entries(variant.responseHeaders).map(([key, value]) => ({
      key,
      value,
    })),
    rules: [],
  }
}

function convertRouteToMockoonRoute(route: MockRoute): MockoonRoute {
  const baseResponse: MockoonResponse = {
    uuid: generateUuid(),
    body: route.responseBody,
    latency: route.delay,
    statusCode: route.responseStatus,
    label: route.name,
    headers: Object.entries(route.responseHeaders).map(([key, value]) => ({
      key,
      value,
    })),
    rules: [],
  }

  const variantResponses =
    route.variants?.map((variant) => convertVariantToResponse(route, variant)) ??
    []

  return {
    uuid: generateUuid(),
    type: "http",
    documentation: route.name,
    method: route.method.toUpperCase(),
    endpoint: buildEndpoint(route.pathPattern, route.serverId === "mock_server_default" ? undefined : undefined),
    responses: [baseResponse, ...variantResponses],
  }
}

export function convertMockRoutesToEnvironment(
  routes: MockRoute[],
  servers: MockServer[] = [],
  options: { name: string; port: number; hostname?: string } = {
    name: "reqy-mock-environment",
    port: 3001,
  },
): MockoonEnvironment {
  const prefixByServerId = new Map(servers.map((s) => [s.id, s.localPrefix]))

  return {
    uuid: generateUuid(),
    name: options.name,
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    routes: routes
      .filter((route) => route.enabled)
      .map((route) => {
        const mockoonRoute = convertRouteToMockoonRoute(route)
        const prefix = route.serverId ? prefixByServerId.get(route.serverId) : undefined
        mockoonRoute.endpoint = buildEndpoint(route.pathPattern, prefix)
        return mockoonRoute
      }),
  }
}

export function environmentToJson(environment: MockoonEnvironment): string {
  return JSON.stringify(environment, null, 2)
}
```

**Step 2: Update adapter tests**

Add a test verifying prefix behavior:

```typescript
it("prefixes endpoints with server localPrefix", () => {
  const routes: MockRoute[] = [
    {
      id: "r1",
      name: "Get user",
      method: "GET",
      pathPattern: "/users/:id",
      responseStatus: 200,
      responseHeaders: {},
      responseBody: "{}",
      contentType: "application/json",
      delay: 0,
      enabled: true,
      serverId: "srv_1",
      createdAt: 0,
      updatedAt: 0,
    },
  ]

  const servers: MockServer[] = [
    {
      id: "srv_1",
      name: "API",
      baseUrl: "",
      localPrefix: "api/v1",
      enabled: true,
      createdAt: 0,
    },
  ]

  const env = convertMockRoutesToEnvironment(routes, servers, { name: "test", port: 9001 })
  expect(env.routes[0].endpoint).toBe("/api/v1/users/:id")
})
```

**Step 3: Run adapter tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run lib/mockoon/__tests__/adapter.test.ts
```

Expected: all tests pass.

**Step 4: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add -A
git commit -m "feat(mockoon): prefix endpoints with server localPrefix

- Adapter now accepts MockServer[] and prefixes route endpoints
- Add unit test for prefix behavior"
```

---

## Chunk 4: Update `/api/mockoon/reload` Route to Accept Servers

**Files:**
- Modify: `reqy-web/app/api/mockoon/reload/route.ts`
- Modify: `reqy-web/lib/__tests__/mockoon-reload.test.ts`

**Step 1: Update route handler**

```typescript
// reqy-web/app/api/mockoon/reload/route.ts

import { NextRequest, NextResponse } from "next/server"
import type { MockRoute, MockServer } from "@/lib/mock-types"
import { convertMockRoutesToEnvironment } from "@/lib/mockoon/adapter"
import { startMockoonSidecar, stopMockoonSidecar } from "@/lib/mockoon/sidecar"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      routes: MockRoute[]
      servers?: MockServer[]
      port?: number
    }
    const routes = body.routes ?? []
    const servers = body.servers ?? []
    const port = body.port ?? 3001

    await stopMockoonSidecar()

    const environment = convertMockRoutesToEnvironment(
      routes,
      servers,
      {
        name: "reqy-mock-environment",
        port,
      },
    )

    const state = await startMockoonSidecar(environment)

    return NextResponse.json({ ok: true, baseUrl: state.baseUrl, pid: state.pid })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
```

**Step 2: Update route test if needed**

The existing test passes empty servers; no change required unless TypeScript complains. Verify:

```bash
npx vitest run lib/__tests__/mockoon-reload.test.ts
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(mockoon): reload route accepts servers for prefix mapping"
```

---

## Chunk 5: Update `useMockStore` to Track Sidecar Base URL

**Files:**
- Modify: `reqy-web/hooks/use-mock-store.ts`
- Modify: `reqy-web/lib/tauri-mock.ts`

**Step 1: Simplify `lib/tauri-mock.ts`**

Keep only `reloadMockoonServer`. Remove all Tauri Rust mock IPC helpers.

```typescript
// reqy-web/lib/tauri-mock.ts

import type { MockRoute, MockServer } from "./mock-types"

export async function reloadMockoonServer(
  routes: MockRoute[],
  servers?: MockServer[],
  port?: number,
): Promise<{ ok: true; baseUrl: string; pid: number } | { ok: false; error: string }> {
  const response = await fetch("/api/mockoon/reload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes, servers, port }),
  })

  const data = (await response.json()) as { ok: boolean; baseUrl?: string; pid?: number; error?: string }
  if (response.ok && data.ok) {
    return { ok: true, baseUrl: data.baseUrl!, pid: data.pid! }
  }
  return { ok: false, error: data.error ?? "Unknown error" }
}
```

**Step 2: Update `useMockStore.ts`**

- Remove imports: `getMockRoutes`, `setMockRoutes`, `isMockEnabledGlobally`, `setMockEnabledGlobally` from `@/lib/tauri-mock`.
- Remove import of `MOCK_CONFIG_UPDATED_EVENT` from `@/lib/mock-events`.
- Remove `enabledGlobally` and `toggleGlobal` from hook state.
- Add `sidecarBaseUrl` state.
- Add `mockConfigUpdatedEvent` constant inline or remove event dispatch.
- Simplify `load()`:
  - Keep localStorage loading.
  - Remove Tauri Rust mock loading.
  - Remove `/api/mock/config` fetch.
  - Call `reloadMockoonServer` with active routes after loading.
- Simplify `syncToBackend`:
  - Call `reloadMockoonServer(activeRoutes, servers)`.
  - On success, update `sidecarBaseUrl`.
  - Remove `/api/mock/config` and Tauri calls.
- Remove `toggleGlobal` method from returned object.
- Keep `setBaseUrl` but it no longer syncs to backend (or remove it if unused).

Key implementation details:

```typescript
const SIDECAR_BASE_URL_KEY = "reqly-mock-sidecar-base-url"

function loadSidecarBaseUrl(): string {
  if (typeof window === "undefined") return ""
  try {
    return persistence.getItem<string>(SIDECAR_BASE_URL_KEY) || ""
  } catch {
    return ""
  }
}

async function saveSidecarBaseUrl(baseUrl: string) {
  if (typeof window === "undefined") return
  try {
    await persistence.setItem(SIDECAR_BASE_URL_KEY, baseUrl)
  } catch { /* quota */ }
}

export function useMockStore() {
  const [routes, setRoutes] = useState<MockRoute[]>([])
  const [servers, setServers] = useState<MockServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [mockLogs, setMockLogs] = useState<MockLogEntry[]>([])
  const [config, setConfig] = useState<MockServerConfig>({ baseUrl: "" })
  const [sidecarBaseUrl, setSidecarBaseUrl] = useState<string>("")

  useEffect(() => {
    async function load() {
      setConfig(loadConfig())
      setMockLogs(loadLogs())

      let loadedServers = loadServers()
      if (loadedServers.length === 0) {
        loadedServers = [createDefaultServer()]
      }
      setServers(loadedServers)
      setSelectedServerId(loadedServers[0]?.id || DEFAULT_SERVER_ID)

      const local = loadFromStorage()
      const migratedRoutes = local.map((r) => ({
        ...r,
        serverId: r.serverId || DEFAULT_SERVER_ID,
        workspaceId: r.workspaceId || "ws-personal",
      }))
      setRoutes(migratedRoutes)

      setSidecarBaseUrl(loadSidecarBaseUrl())

      // Start sidecar with loaded routes
      if (migratedRoutes.length > 0) {
        const activeRoutes = migratedRoutes.filter((r) => r.enabled)
        const result = await reloadMockoonServer(activeRoutes, loadedServers)
        if (result.ok) {
          setSidecarBaseUrl(result.baseUrl)
          await saveSidecarBaseUrl(result.baseUrl)
        } else {
          console.error("Mockoon sidecar reload failed:", result.error)
        }
      }

      setIsLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    ;(async () => {
      await Promise.all([
        saveToStorage(routes),
        saveConfig(config),
        saveServers(servers),
      ])
      syncToBackend(routes, servers)
    })()
  }, [routes, config, servers, isLoaded])

  // ... keep addRoute, updateRoute, deleteRoute, toggleRoute, reorderRoutes, generateFromCollection, etc.
  // remove toggleGlobal

  const setBaseUrl = useCallback((url: string) => {
    setConfig((prev) => ({ ...prev, baseUrl: url }))
  }, [])

  return {
    routes,
    servers,
    selectedServerId,
    isLoaded,
    mockLogs,
    baseUrl: config.baseUrl,
    sidecarBaseUrl,
    setBaseUrl,
    addRoute,
    updateRoute,
    deleteRoute,
    toggleRoute,
    reorderRoutes,
    generateFromCollection,
    getRoutesForWorkspace,
    addMockLog,
    clearMockLogs,
    addServer,
    updateServer,
    deleteServer,
    selectServer,
    getServerRoutes,
  }
}

async function syncToBackend(
  routes: MockRoute[],
  servers: MockServer[],
) {
  try {
    const activeRoutes = routes.filter((r) => r.enabled)
    const result = await reloadMockoonServer(activeRoutes, servers)
    if (!result.ok) {
      console.error("Mockoon sidecar reload failed:", result.error)
    }
  } catch {
    // Backend might not be available
  }
}
```

**Step 3: Type-check**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit
```

Expected: no new errors (pre-existing errors remain).

**Step 4: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add -A
git commit -m "feat(mock): wire useMockStore to Mockoon sidecar base URL

- Remove legacy /api/mock/config and Tauri mock sync
- Track sidecarBaseUrl in hook state
- Reload sidecar on route/server changes"
```

---

## Chunk 6: Update Mocks Page UI

**Files:**
- Modify: `reqy-web/app/(app)/mocks/page.tsx`

**Step 1: Replace URL display and copy**

Change `serverBaseUrl` from `window.location.origin` to `mockStore.sidecarBaseUrl || "http://127.0.0.1:3001"`.

Update displayed URL:

```tsx
const sidecarBaseUrl = mockStore.sidecarBaseUrl || "http://127.0.0.1:3001"
const serverBaseDisplayUrl = `${sidecarBaseUrl.replace(/\/$/, "")}/${selectedServer.localPrefix ? `${selectedServer.localPrefix}/` : ""}`
```

**Step 2: Replace `handleTestMock` simulation with real fetch**

```typescript
const handleTestMock = async (route: MockRoute) => {
  if (!selectedServer) return
  setIsTesting(true)

  const prefix = selectedServer.localPrefix || ""
  const cleanPath = route.pathPattern.replace(/^\/?/, "/")
  const displayUrl = `${sidecarBaseUrl.replace(/\/$/, "")}${prefix ? `/${prefix}` : ""}${cleanPath}`
  setTestUrl(displayUrl)

  try {
    // Replace :param placeholders with sample values for testing
    let testPath = cleanPath
    const paramMatches = cleanPath.match(/:\w+/g)
    if (paramMatches) {
      paramMatches.forEach((param) => {
        testPath = testPath.replace(param, "1")
      })
    }
    const testUrl = `${sidecarBaseUrl.replace(/\/$/, "")}${prefix ? `/${prefix}` : ""}${testPath}`

    const response = await fetch(testUrl, {
      method: route.method,
      headers: route.responseHeaders,
    })

    const body = await response.text()

    const headers: { key: string; value: string }[] = [
      { key: "x-mock-route", value: route.id },
      { key: "x-mock-name", value: route.name },
      { key: "x-mock-delay", value: String(route.delay) },
      ...Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
    ]

    setTestResult({
      status: response.status,
      body,
      headers,
      url: displayUrl,
      method: route.method,
    })
  } catch (err) {
    setTestResult({ status: 0, body: String(err), headers: [], url: displayUrl, method: route.method })
  } finally {
    setIsTesting(false)
  }
}
```

**Step 3: Remove `handleToggleServer` POST to `/api/mock/config`**

`handleToggleServer` currently toggles server.enabled in local state and POSTs to `/api/mock/config`. Since the sidecar is reloaded from `useMockStore` state, just toggle the state and let the effect handle the reload.

```typescript
const handleToggleServer = useCallback((id: string) => {
  setServers((prev) =>
    prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
  )
}, [])
```

**Step 4: Update route documentation/help text**

Find any reference to `/mock/<path>` and replace with the sidecar base URL + prefix pattern.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(mock): point mocks page URL and tests to Mockoon sidecar

- Display sidecar base URL + server prefix
- Test routes via real HTTP to sidecar
- Remove legacy /api/mock/config toggle call"
```

---

## Chunk 7: Remove Mock Interception from Proxy Route

**Files:**
- Modify: `reqy-web/app/api/proxy/route.ts`

**Step 1: Remove mock-related imports**

Remove:

```typescript
import { getActiveMockRoutesForWorkspace, getMockServers, isMockEnabledForWorkspace } from "@/lib/mock-store"
import { resolveMockMatch, applyMockDelay, buildMockHeaders } from "@/lib/mock-resolver"
```

**Step 2: Remove helper `isRouteServerEnabled`**

Remove the function:

```typescript
function isRouteServerEnabled(route: { serverId?: string }): boolean { ... }
```

**Step 3: Remove mock check block**

Remove everything from:

```typescript
// ── Mock check — intercept BEFORE SSRF guard ─────────────────────────
```

until just before:

```typescript
// ── SSRF protection ──────────────────────────────────────────────────
```

**Step 4: Remove `targetIsLocalMock` header injection**

Remove:

```typescript
const targetIsLocalMock = parsedUrl.origin === request.nextUrl.origin && parsedUrl.pathname.startsWith("/mock/")
if (targetIsLocalMock && workspaceId) {
  finalHeaders["x-workspace-id"] = workspaceId
}
```

**Step 5: Type-check and run proxy tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit
npx vitest run lib/__tests__/*proxy*.test.ts app/api/proxy/__tests__/*.test.ts 2>/dev/null || echo "No proxy tests found"
```

Expected: no new errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(proxy): remove legacy mock interception

- Proxy now forwards only real HTTP traffic
- Remove mock-store and mock-resolver dependencies"
```

---

## Chunk 8: Remove Legacy Mock Bootstrap from Request Execution

**Files:**
- Modify: `reqy-web/hooks/use-request-tab-execution.ts`

**Step 1: Remove the bootstrap useEffect**

Remove the `mockSyncedRef` and the `useEffect` that seeds `/api/mock/config` on mount. Keep the `addRoute` import from `useMockStore` if still used.

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor(request): remove legacy mock config bootstrap"
```

---

## Chunk 9: Update/Remove Legacy E2E Tests

**Files:**
- Modify: `reqy-web/tests/e2e/mock-server.spec.ts`
- Modify: `reqy-web/tests/e2e/phase-1-critical-fixes.spec.ts`
- Modify: `reqy-web/app/(app)/documentation/page.tsx`

**Step 1: Rewrite `mock-server.spec.ts`**

Replace legacy assertions with calls to the Mockoon sidecar URL. If the test heavily relies on the deleted `/api/mock/config` route, delete the file and rely on `mockoon-cli.spec.ts`.

**Step 2: Update `phase-1-critical-fixes.spec.ts`**

Remove or rewrite assertions that depend on `/api/mock/config` or mocked proxy responses.

**Step 3: Update documentation page**

Replace references to `/mock/<path>` with the sidecar base URL pattern.

**Step 4: Commit**

```bash
git add -A
git commit -m "test(docs): update legacy mock references to Mockoon sidecar"
```

---

## Chunk 10: Final Verification

**Step 1: Run unit tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run
```

Expected: all mockoon tests pass; legacy mock tests no longer exist.

**Step 2: Run lint**

```bash
pnpm lint
```

Expected: no new errors.

**Step 3: Verify Rust build**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri
cargo check
```

Expected: no errors.

**Step 4: Final commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git add -A
git commit -m "chore(mock): final cleanup for Mockoon-only mock server

- Remove remaining legacy mock references
- Update tests and documentation
- Verify build and test suites"
```

---

## Self-Review Checklist

- [ ] No file imports `mock-store`, `mock-resolver`, `match-mock-path`, or `schemas/mock-config`.
- [ ] `/api/mock/*` routes are deleted.
- [ ] Rust `mock_store`, `mock_matcher`, `mock_types` modules are deleted and `lib.rs` compiles.
- [ ] `useMockStore` only calls `reloadMockoonServer` and tracks `sidecarBaseUrl`.
- [ ] Mocks page displays sidecar URL and tests against it.
- [ ] Proxy does not intercept mock requests.
- [ ] All tests and lint pass.
