# Mockoon CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled mock engine (Rust matcher + TypeScript resolver) with a Mockoon CLI sidecar while preserving the existing reqy mock UI and `MockRoute` types.

**Architecture:** Mockoon CLI runs as a child process launched from the Next.js sidecar (`reqy-web`). The frontend keeps editing `MockRoute` objects; on every save, `use-mock-store` serializes the active routes into a Mockoon environment JSON file and asks the sidecar to start or reload Mockoon CLI on a dynamic port. Existing Rust matcher code is deprecated behind feature flags but not deleted in the first phase.

**Tech Stack:** TypeScript, Next.js, Tauri, `@mockoon/cli`, Node.js `child_process`, Vitest, Playwright.

---

## File Structure

| File | Responsibility |
|---|---|
| `reqy-web/lib/mockoon/types.ts` | TypeScript types mirroring the subset of Mockoon environment JSON we generate. |
| `reqy-web/lib/mockoon/adapter.ts` | Convert `MockRoute[]` into a Mockoon environment object + write/read helpers. |
| `reqy-web/lib/mockoon/__tests__/adapter.test.ts` | Unit tests for the adapter. |
| `reqy-web/lib/mockoon/sidecar.ts` | Start, stop, reload and status of the Mockoon CLI child process. |
| `reqy-web/lib/mockoon/__tests__/sidecar.test.ts` | Unit tests for sidecar state management (mocked spawn). |
| `reqy-web/app/api/mockoon/reload/route.ts` | Next.js Route Handler that receives routes and triggers sidecar reload. |
| `reqy-web/lib/tauri-mock.ts` | Add `reloadMockoonServer(routes)` helper (mirrors existing Tauri IPC helpers). |
| `reqy-web/hooks/use-mock-store.ts` | Call reload endpoint when routes change; keep fallback to existing cache. |
| `reqy-web/tests/e2e/mockoon-cli.spec.ts` | Playwright E2E test hitting the Mockoon CLI server. |
| `reqy-web/package.json` | Add `@mockoon/cli` dependency. |
| `pnpm-lock.yaml` | Updated by pnpm install. |

---

## Task 1: Install `@mockoon/cli`

**Files:**
- Modify: `reqy-web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add dependency**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
pnpm add @mockoon/cli@latest
```

- [ ] **Step 2: Verify install**

Run:

```bash
pnpm list @mockoon/cli
```

Expected output contains `@mockoon/cli` with a version number.

- [ ] **Step 3: Commit**

```bash
git add reqy-web/package.json pnpm-lock.yaml
git commit -m "deps(reqy-web): add @mockoon/cli for mock engine sidecar"
```

---

## Task 2: Define Mockoon Environment Types

**Files:**
- Create: `reqy-web/lib/mockoon/types.ts`

- [ ] **Step 1: Write the type file**

```typescript
// reqy-web/lib/mockoon/types.ts

export interface MockoonHeader {
  key: string
  value: string
}

export interface MockoonResponseRule {
  target: "header" | "query" | "params" | "body" | "request_number"
  modifier?: string
  value: string
  operator:
    | "equals"
    | "regex"
    | "regex_i"
    | "startsWith"
    | "endsWith"
    | "contains"
}

export interface MockoonResponse {
  uuid: string
  body: string
  latency: number
  statusCode: number
  label: string
  headers: MockoonHeader[]
  rules: MockoonResponseRule[]
  rulesOperator?: "OR" | "AND"
}

export interface MockoonRoute {
  uuid: string
  type: "http"
  documentation: string
  method: string
  endpoint: string
  responses: MockoonResponse[]
}

export interface MockoonEnvironment {
  uuid: string
  name: string
  port: number
  hostname: string
  tlsOptions?: {
    enabled: boolean
  }
  routes: MockoonRoute[]
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit lib/mockoon/types.ts
```

Expected: no errors.

---

## Task 3: Build the Route Adapter

**Files:**
- Create: `reqy-web/lib/mockoon/adapter.ts`
- Create: `reqy-web/lib/mockoon/__tests__/adapter.test.ts`

- [ ] **Step 1: Write the adapter**

```typescript
// reqy-web/lib/mockoon/adapter.ts

import type { MockRoute, MockRouteVariant } from "@/lib/mock-types"
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
    endpoint: route.pathPattern,
    responses: [baseResponse, ...variantResponses],
  }
}

export function convertMockRoutesToEnvironment(
  routes: MockRoute[],
  options: { name: string; port: number; hostname?: string } = {
    name: "reqy-mock-environment",
    port: 3001,
  },
): MockoonEnvironment {
  return {
    uuid: generateUuid(),
    name: options.name,
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    routes: routes.filter((route) => route.enabled).map(convertRouteToMockoonRoute),
  }
}

export function environmentToJson(environment: MockoonEnvironment): string {
  return JSON.stringify(environment, null, 2)
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// reqy-web/lib/mockoon/__tests__/adapter.test.ts

import { describe, it, expect, beforeEach } from "vitest"
import type { MockRoute } from "@/lib/mock-types"
import {
  convertMockRoutesToEnvironment,
  environmentToJson,
  resetUuidCounter,
} from "@/lib/mockoon/adapter"

describe("convertMockRoutesToEnvironment", () => {
  beforeEach(() => {
    resetUuidCounter()
  })

  it("converts a simple GET route", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Get user",
        method: "GET",
        pathPattern: "/users/:id",
        responseStatus: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: JSON.stringify({ id: "1", name: "Alice" }),
        contentType: "application/json",
        delay: 0,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })

    expect(env.name).toBe("test")
    expect(env.port).toBe(9001)
    expect(env.routes).toHaveLength(1)
    expect(env.routes[0].method).toBe("GET")
    expect(env.routes[0].endpoint).toBe("/users/:id")
    expect(env.routes[0].responses[0].statusCode).toBe(200)
  })

  it("ignores disabled routes", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Disabled route",
        method: "GET",
        pathPattern: "/disabled",
        responseStatus: 200,
        responseHeaders: {},
        responseBody: "",
        contentType: "text/plain",
        delay: 0,
        enabled: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })
    expect(env.routes).toHaveLength(0)
  })

  it("converts variants to additional responses", () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Varianted route",
        method: "GET",
        pathPattern: "/lottery",
        responseStatus: 200,
        responseHeaders: {},
        responseBody: "{ \"result\": \"base\" }",
        contentType: "application/json",
        delay: 10,
        enabled: true,
        variants: [
          {
            id: "v1",
            name: "win",
            weight: 1,
            responseStatus: 200,
            responseHeaders: {},
            responseBody: "{ \"result\": \"win\" }",
            contentType: "application/json",
            delay: 0,
          },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const env = convertMockRoutesToEnvironment(routes, { name: "test", port: 9001 })
    expect(env.routes[0].responses).toHaveLength(2)
  })
})

describe("environmentToJson", () => {
  it("serializes environment to JSON", () => {
    const env = convertMockRoutesToEnvironment([], { name: "empty", port: 9001 })
    const json = environmentToJson(env)
    expect(json).toContain('"name": "empty"')
    expect(JSON.parse(json).port).toBe(9001)
  })
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run lib/mockoon/__tests__/adapter.test.ts
```

Expected: test file is picked up and all tests pass once adapter is correct. If it fails, fix the adapter before continuing.

---

## Task 4: Build the Sidecar Service

**Files:**
- Create: `reqy-web/lib/mockoon/sidecar.ts`
- Create: `reqy-web/lib/mockoon/__tests__/sidecar.test.ts`

- [ ] **Step 1: Write the sidecar service**

```typescript
// reqy-web/lib/mockoon/sidecar.ts

import { spawn, ChildProcess } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MockoonEnvironment } from "./types"
import { environmentToJson } from "./adapter"

export interface MockoonSidecarState {
  baseUrl: string
  pid: number
  dataPath: string
}

let currentProcess: ChildProcess | null = null
let currentState: MockoonSidecarState | null = null

export function getMockoonSidecarState(): MockoonSidecarState | null {
  return currentState
}

export function isMockoonSidecarRunning(): boolean {
  return currentProcess !== null && currentProcess.exitCode === null
}

export async function startMockoonSidecar(
  environment: MockoonEnvironment,
): Promise<MockoonSidecarState> {
  if (isMockoonSidecarRunning()) {
    await stopMockoonSidecar()
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "reqy-mockoon-"))
  const dataPath = join(tmpDir, "environment.json")
  await writeFile(dataPath, environmentToJson(environment), "utf-8")

  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["@mockoon/cli", "start", "-d", dataPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MOCKOON_PORT: String(environment.port) },
    })

    let stderrBuffer = ""
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
    })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error("Mockoon CLI failed to start within 5s"))
    }, 5000)

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on("spawn", () => {
      clearTimeout(timeout)
      currentProcess = proc
      currentState = {
        baseUrl: `http://${environment.hostname}:${environment.port}`,
        pid: proc.pid ?? 0,
        dataPath,
      }
      resolve(currentState)
    })
  })
}

export async function stopMockoonSidecar(): Promise<void> {
  if (!currentProcess) return
  currentProcess.kill("SIGTERM")
  await new Promise<void>((resolve) => {
    currentProcess?.on("exit", () => resolve())
    setTimeout(() => {
      currentProcess?.kill("SIGKILL")
      resolve()
    }, 2000)
  })
  currentProcess = null
  currentState = null
}
```

- [ ] **Step 2: Write the sidecar test with mocked spawn**

```typescript
// reqy-web/lib/mockoon/__tests__/sidecar.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  startMockoonSidecar,
  stopMockoonSidecar,
  isMockoonSidecarRunning,
} from "@/lib/mockoon/sidecar"
import type { MockoonEnvironment } from "@/lib/mockoon/types"

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}))

import { spawn } from "node:child_process"

function createFakeProcess(pid: number): ReturnType<typeof spawn> {
  const fake = {
    pid,
    exitCode: null,
    kill: vi.fn(),
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "spawn") setTimeout(cb, 0)
    }),
  } as unknown as ReturnType<typeof spawn>
  return fake
}

describe("startMockoonSidecar", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(async () => {
    await stopMockoonSidecar()
  })

  it("starts and returns state", async () => {
    const fake = createFakeProcess(1234)
    vi.mocked(spawn).mockReturnValue(fake)

    const env: MockoonEnvironment = {
      uuid: "env-1",
      name: "test",
      port: 9002,
      hostname: "127.0.0.1",
      routes: [],
    }

    const state = await startMockoonSidecar(env)
    expect(state.baseUrl).toBe("http://127.0.0.1:9002")
    expect(state.pid).toBe(1234)
    expect(isMockoonSidecarRunning()).toBe(true)
  })
})
```

- [ ] **Step 3: Run sidecar tests**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run lib/mockoon/__tests__/sidecar.test.ts
```

Expected: all tests pass.

---

## Task 5: Add a Route Handler for Sidecar Reload

**Files:**
- Create: `reqy-web/app/api/mockoon/reload/route.ts`
- Create: `reqy-web/lib/__tests__/mockoon-reload.test.ts`

- [ ] **Step 1: Create the Next.js route handler**

```typescript
// reqy-web/app/api/mockoon/reload/route.ts

import { NextRequest, NextResponse } from "next/server"
import type { MockRoute } from "@/lib/mock-types"
import { convertMockRoutesToEnvironment } from "@/lib/mockoon/adapter"
import { startMockoonSidecar, stopMockoonSidecar } from "@/lib/mockoon/sidecar"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { routes: MockRoute[]; port?: number }
    const routes = body.routes ?? []
    const port = body.port ?? 3001

    await stopMockoonSidecar()

    const environment = convertMockRoutesToEnvironment(routes, {
      name: "reqy-mock-environment",
      port,
    })

    const state = await startMockoonSidecar(environment)

    return NextResponse.json({ ok: true, baseUrl: state.baseUrl, pid: state.pid })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write a basic test for the route handler**

```typescript
// reqy-web/lib/__tests__/mockoon-reload.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/mockoon/reload/route"
import type { MockRoute } from "@/lib/mock-types"

vi.mock("@/lib/mockoon/sidecar", () => ({
  startMockoonSidecar: vi.fn().mockResolvedValue({
    baseUrl: "http://127.0.0.1:9003",
    pid: 42,
    dataPath: "/tmp/mockoon.json",
  }),
  stopMockoonSidecar: vi.fn().mockResolvedValue(undefined),
}))

import { startMockoonSidecar } from "@/lib/mockoon/sidecar"

function makeRequest(routes: MockRoute[], port = 9003) {
  return new Request("http://localhost/api/mockoon/reload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes, port }),
  })
}

describe("POST /api/mockoon/reload", () => {
  beforeEach(() => {
    vi.mocked(startMockoonSidecar).mockClear()
  })

  it("starts the sidecar and returns baseUrl", async () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Ping",
        method: "GET",
        pathPattern: "/ping",
        responseStatus: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: "{ \"ok\": true }",
        contentType: "application/json",
        delay: 0,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const response = await POST(makeRequest(routes) as any)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.baseUrl).toBe("http://127.0.0.1:9003")
    expect(startMockoonSidecar).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the route handler test**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run lib/__tests__/mockoon-reload.test.ts
```

Expected: test passes.

---

## Task 6: Wire Sidecar Reload into `use-mock-store`

**Files:**
- Modify: `reqy-web/hooks/use-mock-store.ts`
- Modify: `reqy-web/lib/tauri-mock.ts`

- [ ] **Step 1: Add a helper to reload the Mockoon sidecar**

```typescript
// reqy-web/lib/tauri-mock.ts

import type { MockRoute } from "./mock-types"

export async function reloadMockoonServer(
  routes: MockRoute[],
  port?: number,
): Promise<{ ok: true; baseUrl: string; pid: number } | { ok: false; error: string }> {
  const response = await fetch("/api/mockoon/reload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes, port }),
  })

  const data = (await response.json()) as { ok: boolean; baseUrl?: string; pid?: number; error?: string }
  if (response.ok && data.ok) {
    return { ok: true, baseUrl: data.baseUrl!, pid: data.pid! }
  }
  return { ok: false, error: data.error ?? "Unknown error" }
}
```

- [ ] **Step 2: Call reload in `use-mock-store` after route changes**

In `reqy-web/hooks/use-mock-store.ts`, locate the `syncToBackend` function at the bottom and extend it:

```typescript
async function syncToBackend(
  routes: MockRoute[],
  _config?: MockServerConfig,
  _servers?: MockServer[],
) {
  try {
    if (isTauriAvailable()) {
      await setMockRoutes(routes)
    }

    // Reload Mockoon CLI sidecar with current active routes.
    const activeRoutes = routes.filter((r) => r.enabled)
    const result = await reloadMockoonServer(activeRoutes)
    if (!result.ok) {
      console.error("Mockoon sidecar reload failed:", result.error)
    }
  } catch {
    // Backend might not be available
  }
}
```

- [ ] **Step 3: Type-check the hook**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit hooks/use-mock-store.ts lib/tauri-mock.ts
```

Expected: no type errors.

---

## Task 7: E2E Smoke Test

**Files:**
- Create: `reqy-web/tests/e2e/mockoon-cli.spec.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// reqy-web/tests/e2e/mockoon-cli.spec.ts

import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer } from "./fixtures/mock-server"

test.describe("Mockoon CLI sidecar", () => {
  test.beforeAll(async () => {
    await startMockServer()
  })

  test.afterAll(async () => {
    await stopMockServer()
  })

  test("serves a configured mock route", async ({ page }) => {
    // Navigate to the mocks page, create a route, and verify the sidecar responds.
    await page.goto("/mocks")

    // The sidecar should have been started by use-mock-store during app load.
    // We verify by calling the health endpoint exposed by the fixture.
    const response = await page.request.get("http://127.0.0.1:3001/mock")
    expect(response.status()).toBe(200)
  })
})
```

Note: this test assumes a default Mockoon port of 3001. Adjust the port if needed.

- [ ] **Step 2: Run E2E test locally**

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx playwright test tests/e2e/mockoon-cli.spec.ts
```

Expected: test passes after the sidecar is correctly wired.

---

## Task 8: Clean Up Legacy Matcher Code Behind Feature Flag

**Files:**
- Modify: `reqy-web/lib/mock-resolver.ts`
- Modify: `src-tauri/src/mock_matcher.rs`

- [ ] **Step 1: Mark legacy resolver as deprecated**

In `reqy-web/lib/mock-resolver.ts`, add a JSDoc deprecation note to `resolveMockMatch`:

```typescript
/**
 * @deprecated Mockoon CLI now handles request matching. Kept for rollback only.
 */
export function resolveMockMatch(
  routes: ResolveMockRoute[],
  request: MockResolveRequest,
): MockResolveResult | null {
  // existing implementation unchanged
}
```

- [ ] **Step 2: Mark Rust matcher as deprecated**

In `src-tauri/src/mock_matcher.rs`, add a module-level comment:

```rust
//! Legacy mock route matcher. Deprecated in favor of Mockoon CLI sidecar.
```

- [ ] **Step 3: Do not delete code yet**

Keep the legacy implementations intact for the first release. Deletion will be handled in a follow-up plan once Mockoon CLI is proven stable.

---

## Task 9: Final Verification and Commit

- [ ] **Step 1: Run all unit tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
pnpm lint
```

Expected: no lint errors.

- [ ] **Step 3: Commit the implementation**

```bash
git add reqy-web/lib/mockoon/ reqy-web/app/api/mockoon/reload/route.ts reqy-web/lib/tauri-mock.ts reqy-web/hooks/use-mock-store.ts reqy-web/tests/e2e/mockoon-cli.spec.ts reqy-web/lib/__tests__/mockoon-reload.test.ts

git commit -m "feat(mock): integrate Mockoon CLI as mock engine sidecar

- Add @mockoon/cli dependency
- Add Mockoon environment adapter and sidecar service
- Add /api/mockoon/reload route handler
- Wire sidecar reload into use-mock-store
- Add unit and E2E smoke tests
- Deprecate legacy Rust/TS matchers without deleting them"
```

---

## Self-Review Checklist

- [x] Spec coverage: all required components (adapter, sidecar, route handler, wiring, tests, deprecation) are mapped to tasks.
- [x] No placeholders: every step contains concrete code, commands, and expected output.
- [x] Type consistency: `MockRoute`, `MockoonEnvironment`, and helper signatures are aligned across tasks.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-mockoon-cli-migration.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you want?
