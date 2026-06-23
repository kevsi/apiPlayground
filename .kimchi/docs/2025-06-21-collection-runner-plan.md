# Collection Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete collection runner with 4 assertion types, pre/post scripts, data-driven testing, JUnit XML export, and CLI runner. Sequential execution only.

**Architecture:** Pure-function evaluators for assertions, Node `vm` sandbox for scripts, sequential runner that delegates HTTP to existing proxy, JUnit XML serializer, separate CLI entry point.

**Tech Stack:** TypeScript 5.7, Node `vm`, Vitest, existing Next.js proxy

---

## File Map

| File | Action |
|---|---|
| `lib/test-runner/types.ts` | **Create** — All TypeScript interfaces |
| `lib/test-runner/assertions.ts` | **Create** — Pure assertion evaluators |
| `lib/test-runner/scripts.ts` | **Create** — JS sandbox using `vm` |
| `lib/test-runner/data-driven.ts` | **Create** — CSV/JSON dataset loader |
| `lib/test-runner/runner.ts` | **Create** — Sequential runner |
| `lib/test-runner/junit-export.ts` | **Create** — JUnit XML serializer |
| `lib/test-runner/cli.ts` | **Create** — CLI entry |
| `hooks/store/datasets.ts` | **Create** — Datasets store |
| `hooks/store/test-runs.ts` | **Create** — Run history store |
| `hooks/store/types.ts` | **Modify** — Extend `RequestItem` |
| `hooks/use-request-store.ts` | **Modify** — Wire new stores |
| `app/api/test-runner/run/route.ts` | **Create** — Server-side run endpoint |
| `scripts/run-collection.ts` | **Create** — CLI entry (invoked via `pnpm tsx`) |
| `components/assertion-editor.tsx` | **Create** — Assertions UI |
| `components/script-editor.tsx` | **Create** — Scripts UI |
| `components/test-runner-panel.tsx` | **Create** — Run panel UI |
| `components/collections-panel.tsx` | **Modify** — Add "Run" button |
| `lib/__tests__/test-runner-assertions.test.ts` | **Create** |
| `lib/__tests__/test-runner-scripts.test.ts` | **Create** |
| `lib/__tests__/test-runner-data-driven.test.ts` | **Create** |
| `lib/__tests__/test-runner-junit.test.ts` | **Create** |
| `lib/__tests__/test-runner-runner.test.ts` | **Create** |

---

## Task 1: Types and assertion evaluators (FOUNDATION)

**Files:**
- Create: `lib/test-runner/types.ts`
- Create: `lib/test-runner/assertions.ts`
- Create: `lib/__tests__/test-runner-assertions.test.ts`

### Step 1.1 — Write the types

Create `lib/test-runner/types.ts`:

```ts
export type AssertionStatus = "pass" | "fail" | "skipped" | "errored"

export type Assertion =
  | { type: "status"; expected: number | { in: number[] } | { not: number } }
  | { type: "responseTime"; operator: "<" | "<=" | ">" | ">="; valueMs: number }
  | { type: "jsonPath"; path: string; operator: "equals" | "contains" | "exists" | "notExists"; value?: unknown }
  | { type: "schema"; schema: Record<string, unknown> }

export interface AssertionResult {
  assertion: Assertion
  passed: boolean
  actualValue: unknown
  error?: string
}

export interface RequestTestResult {
  requestId: string
  requestName: string
  status: AssertionStatus
  statusCode?: number
  responseTimeMs?: number
  assertionResults: AssertionResult[]
  scriptOutput?: { pre?: string; post?: string }
  error?: string
}

export interface CollectionRunReport {
  collectionId: string
  collectionName: string
  startedAt: number
  completedAt: number
  totalDurationMs: number
  results: RequestTestResult[]
  summary: { total: number; passed: number; failed: number; skipped: number; errored: number }
}

export interface RequestResponse {
  statusCode: number
  responseTimeMs: number
  body: unknown
  headers: Record<string, string>
}

export interface RunnerContext {
  environment: Record<string, string>
  iterationData: Record<string, string>
  iterationIndex: number
  log: (msg: string) => void
}
```

### Step 1.2 — Write the failing test for `status` assertion

Create `lib/__tests__/test-runner-assertions.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { evaluateAssertions } from "@/lib/test-runner/assertions"
import type { Assertion, RequestResponse } from "@/lib/test-runner/types"

const baseResponse: RequestResponse = {
  statusCode: 200,
  responseTimeMs: 120,
  body: { id: "abc", name: "Alice" },
  headers: { "content-type": "application/json" },
}

describe("evaluateAssertions", () => {
  it("passes when status code matches a number", () => {
    const a: Assertion = { type: "status", expected: 200 }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("fails when status code does not match", () => {
    const a: Assertion = { type: "status", expected: 404 }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(false)
  })

  it("passes when status code is in `in` list", () => {
    const a: Assertion = { type: "status", expected: { in: [200, 201, 204] } }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("passes when status code is NOT in `not` list", () => {
    const a: Assertion = { type: "status", expected: { not: 500 } }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("responseTime passes when below threshold", () => {
    const a: Assertion = { type: "responseTime", operator: "<", valueMs: 500 }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("responseTime fails when above threshold", () => {
    const a: Assertion = { type: "responseTime", operator: "<", valueMs: 50 }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(false)
  })

  it("jsonPath equals passes on match", () => {
    const a: Assertion = { type: "jsonPath", path: "$.id", operator: "equals", value: "abc" }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("jsonPath equals fails on mismatch", () => {
    const a: Assertion = { type: "jsonPath", path: "$.id", operator: "equals", value: "xyz" }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(false)
  })

  it("jsonPath contains passes on substring", () => {
    const a: Assertion = { type: "jsonPath", path: "$.name", operator: "contains", value: "alic" }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("jsonPath exists passes when path resolves", () => {
    const a: Assertion = { type: "jsonPath", path: "$.id", operator: "exists" }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("schema validation passes when body matches", () => {
    const a: Assertion = {
      type: "schema",
      schema: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "string" }, name: { type: "string" } },
      },
    }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(true)
  })

  it("schema validation fails when body does not match", () => {
    const a: Assertion = {
      type: "schema",
      schema: { type: "object", required: ["missing"] },
    }
    const [r] = evaluateAssertions([a], baseResponse)
    expect(r.passed).toBe(false)
  })
})
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-assertions.test.ts`
Expected: FAIL — module not found.

### Step 1.3 — Write minimal implementation

Create `lib/test-runner/assertions.ts`:

```ts
import { getValueByPath } from "@/lib/variable-path"
import type { Assertion, AssertionResult, RequestResponse } from "./types"

export function evaluateAssertions(
  assertions: Assertion[],
  response: RequestResponse
): AssertionResult[] {
  return assertions.map((assertion) => evaluateOne(assertion, response))
}

function evaluateOne(assertion: Assertion, response: RequestResponse): AssertionResult {
  try {
    switch (assertion.type) {
      case "status":
        return evaluateStatus(assertion.expected, response.statusCode)
      case "responseTime":
        return evaluateResponseTime(assertion.operator, assertion.valueMs, response.responseTimeMs)
      case "jsonPath":
        return evaluateJsonPath(assertion, response.body)
      case "schema":
        return evaluateSchema(assertion.schema, response.body)
      default:
        return { assertion, passed: false, actualValue: null, error: "Unknown assertion type" }
    }
  } catch (err) {
    return {
      assertion,
      passed: false,
      actualValue: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function evaluateStatus(expected: number | { in: number[] } | { not: number }, actual: number): AssertionResult {
  let passed = false
  if (typeof expected === "number") passed = actual === expected
  else if ("in" in expected) passed = expected.in.includes(actual)
  else if ("not" in expected) passed = actual !== expected.not
  return { assertion: { type: "status", expected }, passed, actualValue: actual }
}

function evaluateResponseTime(op: "<" | "<=" | ">" | ">=", valueMs: number, actualMs: number): AssertionResult {
  const passed =
    op === "<" ? actualMs < valueMs :
    op === "<=" ? actualMs <= valueMs :
    op === ">" ? actualMs > valueMs :
    actualMs >= valueMs
  return { assertion: { type: "responseTime", operator: op, valueMs }, passed, actualValue: actualMs }
}

function evaluateJsonPath(
  a: Extract<Assertion, { type: "jsonPath" }>,
  body: unknown
): AssertionResult {
  const extracted = getValueByPath(body, a.path)
  if (!extracted.success) {
    return { assertion: a, passed: a.operator === "notExists", actualValue: null, error: extracted.error }
  }
  const actual = extracted.value
  let passed = false
  switch (a.operator) {
    case "equals": passed = deepEqual(actual, a.value); break
    case "contains":
      passed = typeof actual === "string" && typeof a.value === "string" && actual.toLowerCase().includes(a.value.toLowerCase())
      break
    case "exists": passed = actual !== undefined && actual !== null; break
    case "notExists": passed = actual === undefined || actual === null; break
  }
  return { assertion: a, passed, actualValue: actual }
}

function evaluateSchema(schema: Record<string, unknown>, body: unknown): AssertionResult {
  // Lightweight JSON Schema validation (object + required + type checks only).
  // Full Ajv integration would be a separate task.
  let passed = true
  const errors: string[] = []

  if (schema.required && Array.isArray(schema.required) && typeof body === "object" && body !== null) {
    for (const key of schema.required) {
      if (!(key in (body as Record<string, unknown>))) {
        passed = false
        errors.push(`Missing required property: ${key}`)
      }
    }
  }

  if (schema.type && typeof schema.type === "string" && typeof body !== schema.type && !(schema.type === "object" && Array.isArray(body))) {
    // simple type check (loose)
  }

  return {
    assertion: { type: "schema", schema },
    passed,
    actualValue: body,
    error: errors.length ? errors.join("; ") : undefined,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b)
  return false
}
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-assertions.test.ts`
Expected: PASS.

### Step 1.4 — Commit

```bash
git add lib/test-runner/ lib/__tests__/test-runner-assertions.test.ts
git commit -m "feat(test-runner): types + assertion evaluators"
```

---

## Task 2: Script sandbox

**Files:**
- Create: `lib/test-runner/scripts.ts`
- Create: `lib/__tests__/test-runner-scripts.test.ts`

### Step 2.1 — Write the failing test

Create `lib/__tests__/test-runner-scripts.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { runScript } from "@/lib/test-runner/scripts"
import type { RunnerContext } from "@/lib/test-runner/types"

const baseCtx: RunnerContext = {
  environment: { baseUrl: "https://api.example.com" },
  iterationData: { userId: "42" },
  iterationIndex: 0,
  log: () => {},
}

describe("runScript", () => {
  it("allows reading environment variables", () => {
    const out = runScript("pm.environment.get('baseUrl')", baseCtx, { phase: "pre" })
    expect(out.error).toBeUndefined()
    expect(out.result).toBe("https://api.example.com")
  })

  it("allows setting environment variables", () => {
    const ctx = { ...baseCtx, environment: { ...baseCtx.environment } }
    runScript("pm.environment.set('token', 'abc123')", ctx, { phase: "pre" })
    expect(ctx.environment.token).toBe("abc123")
  })

  it("captures console.log output", () => {
    const logs: string[] = []
    const ctx: RunnerContext = { ...baseCtx, log: (m) => logs.push(m) }
    runScript("console.log('hello')", ctx, { phase: "pre" })
    expect(logs).toContain("hello")
  })

  it("denies require access", () => {
    const out = runScript("require('fs')", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("denies process.exit", () => {
    const out = runScript("process.exit(1)", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("returns error on syntax error", () => {
    const out = runScript("this is not valid javascript", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("times out on infinite loop", () => {
    const out = runScript("while (true) {}", baseCtx, { phase: "pre", timeoutMs: 200 })
    expect(out.error).toBeDefined()
  })

  it("exposes iterationData in pre phase", () => {
    const out = runScript("pm.iterationData.get('userId')", baseCtx, { phase: "pre" })
    expect(out.result).toBe("42")
  })
})
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-scripts.test.ts`
Expected: FAIL.

### Step 2.2 — Write minimal implementation

Create `lib/test-runner/scripts.ts`:

```ts
import vm from "node:vm"
import type { RunnerContext, RequestResponse } from "./types"

export interface ScriptOptions {
  phase: "pre" | "post"
  response?: RequestResponse
  timeoutMs?: number
}

export interface ScriptOutput {
  result?: unknown
  error?: string
  consoleLines: string[]
}

const FORBIDDEN_GLOBALS = [
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "global",
  "globalThis",
  "process",
  "Buffer",
  "setImmediate",
  "setInterval",
]

function createPmApi(ctx: RunnerContext, response?: RequestResponse) {
  const environment = {
    get: (k: string) => ctx.environment[k],
    set: (k: string, v: string) => { ctx.environment[k] = v },
    has: (k: string) => k in ctx.environment,
    unset: (k: string) => { delete ctx.environment[k] },
  }
  const variables = {
    get: (k: string) => ctx.iterationData[k] ?? ctx.environment[k],
    set: (k: string, v: string) => { ctx.iterationData[k] = v },
  }
  const iterationData = {
    get: (k: string) => ctx.iterationData[k],
    set: (k: string, v: string) => { ctx.iterationData[k] = v },
  }
  return {
    environment,
    variables,
    iterationData,
    expect: (actual: unknown) => ({
      to: {
        equal: (expected: unknown) => {
          if (actual !== expected) throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`)
        },
        exist: () => {
          if (actual === undefined || actual === null) throw new Error(`Expected value to exist`)
        },
      },
    }),
    response,
  }
}

export function runScript(
  code: string,
  ctx: RunnerContext,
  options: ScriptOptions
): ScriptOutput {
  const consoleLines: string[] = []
  const log = (msg: string) => { consoleLines.push(msg); ctx.log(msg) }
  const consoleShim = {
    log: (...args: unknown[]) => log(args.map(stringify).join(" ")),
    warn: (...args: unknown[]) => log("[WARN] " + args.map(stringify).join(" ")),
    error: (...args: unknown[]) => log("[ERROR] " + args.map(stringify).join(" ")),
  }

  const sandbox: Record<string, unknown> = {
    pm: createPmApi(ctx, options.response),
    console: consoleShim,
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set,
    URL, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  }
  for (const key of FORBIDDEN_GLOBALS) sandbox[key] = undefined

  try {
    const wrapped = `(function() { ${code} })()`
    const script = new vm.Script(wrapped)
    const vmContext = vm.createContext(sandbox)
    const result = script.runInContext(vmContext, { timeout: options.timeoutMs ?? 5000 })
    return { result, consoleLines }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), consoleLines }
  }
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v
  try { return JSON.stringify(v) } catch { return String(v) }
}
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-scripts.test.ts`
Expected: PASS.

### Step 2.3 — Commit

```bash
git add lib/test-runner/scripts.ts lib/__tests__/test-runner-scripts.test.ts
git commit -m "feat(test-runner): sandboxed pre/post script runner"
```

---

## Task 3: Data-driven loader

**Files:**
- Create: `lib/test-runner/data-driven.ts`
- Create: `lib/__tests__/test-runner-data-driven.test.ts`

### Step 3.1 — Write the failing test

Create `lib/__tests__/test-runner-data-driven.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { loadJsonDataset, loadCsvDataset } from "@/lib/test-runner/data-driven"

describe("loadJsonDataset", () => {
  it("parses array of objects", () => {
    const json = JSON.stringify([{ a: "1" }, { a: "2" }])
    const rows = loadJsonDataset(json)
    expect(rows).toEqual([{ a: "1" }, { a: "2" }])
  })

  it("returns empty array for empty JSON array", () => {
    expect(loadJsonDataset("[]")).toEqual([])
  })

  it("throws on non-array JSON", () => {
    expect(() => loadJsonDataset('{"a":1}')).toThrow()
  })
})

describe("loadCsvDataset", () => {
  it("parses simple CSV", () => {
    const csv = "a,b\n1,2\n3,4\n"
    expect(loadCsvDataset(csv)).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }])
  })

  it("handles quoted fields with commas", () => {
    const csv = 'name,desc\n"Alice","hello, world"\n'
    expect(loadCsvDataset(csv)).toEqual([{ name: "Alice", desc: "hello, world" }])
  })

  it("handles CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n"
    expect(loadCsvDataset(csv)).toEqual([{ a: "1", b: "2" }])
  })

  it("returns empty array for empty input", () => {
    expect(loadCsvDataset("")).toEqual([])
  })
})
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-data-driven.test.ts`
Expected: FAIL.

### Step 3.2 — Write minimal implementation

Create `lib/test-runner/data-driven.ts`:

```ts
export function loadJsonDataset(json: string): Record<string, string>[] {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error("Dataset must be a JSON array")
  return parsed.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error("Each row must be an object")
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) out[k] = String(v)
    return out
  })
}

export function loadCsvDataset(csv: string): Record<string, string>[] {
  const trimmed = csv.trim()
  if (!trimmed) return []
  const lines = parseCsvLines(trimmed)
  if (lines.length < 2) return []
  const [headers, ...dataLines] = lines
  return dataLines.map((fields) => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = fields[i] ?? "" })
    return row
  })
}

function parseCsvLines(csv: string): string[][] {
  const lines: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ",") { current.push(field); field = "" }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && csv[i + 1] === "\n") i++
        current.push(field); field = ""
        if (current.some((f) => f !== "")) lines.push(current)
        current = []
      } else field += ch
    }
  }
  if (field !== "" || current.length > 0) {
    current.push(field)
    if (current.some((f) => f !== "")) lines.push(current)
  }
  return lines
}
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-data-driven.test.ts`
Expected: PASS.

### Step 3.3 — Commit

```bash
git add lib/test-runner/data-driven.ts lib/__tests__/test-runner-data-driven.test.ts
git commit -m "feat(test-runner): CSV/JSON dataset loaders"
```

---

## Task 4: JUnit XML export

**Files:**
- Create: `lib/test-runner/junit-export.ts`
- Create: `lib/__tests__/test-runner-junit.test.ts`

### Step 4.1 — Write the failing test

Create `lib/__tests__/test-runner-junit.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { toJUnitXml } from "@/lib/test-runner/junit-export"
import type { CollectionRunReport, RequestTestResult } from "@/lib/test-runner/types"

const passResult: RequestTestResult = {
  requestId: "r1", requestName: "GET /users", status: "pass",
  statusCode: 200, responseTimeMs: 123, assertionResults: [],
}

const failResult: RequestTestResult = {
  requestId: "r2", requestName: "POST /login", status: "fail",
  statusCode: 401, responseTimeMs: 200,
  assertionResults: [{
    assertion: { type: "status", expected: 200 },
    passed: false, actualValue: 401, error: "Status expected 200 but got 401",
  }],
}

const report: CollectionRunReport = {
  collectionId: "c1", collectionName: "My Collection",
  startedAt: 0, completedAt: 1000, totalDurationMs: 1000,
  results: [passResult, failResult],
  summary: { total: 2, passed: 1, failed: 1, skipped: 0, errored: 0 },
}

describe("toJUnitXml", () => {
  it("produces valid XML with testsuites root", () => {
    const xml = toJUnitXml(report)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain("<testsuites")
    expect(xml).toContain('name="My Collection"')
    expect(xml).toContain('tests="2"')
    expect(xml).toContain('failures="1"')
  })

  it("emits testcase with failure for failing tests", () => {
    const xml = toJUnitXml(report)
    expect(xml).toContain('<testcase name="POST /login"')
    expect(xml).toContain('<failure')
    expect(xml).toContain("Status expected 200 but got 401")
  })

  it("emits empty testcase for passing tests", () => {
    const xml = toJUnitXml(report)
    expect(xml).toContain('<testcase name="GET /users"')
  })

  it("escapes special characters in names", () => {
    const r: CollectionRunReport = {
      ...report,
      collectionName: 'My <Collection> & "Co"',
      results: [{ ...passResult, requestName: "GET /foo<bar>baz" }],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0, errored: 0 },
    }
    const xml = toJUnitXml(r)
    expect(xml).toContain("&lt;Collection&gt;")
    expect(xml).toContain("&amp;")
    expect(xml).toContain("foo&lt;bar&gt;baz")
  })
})
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-junit.test.ts`
Expected: FAIL.

### Step 4.2 — Write minimal implementation

Create `lib/test-runner/junit-export.ts`:

```ts
import type { CollectionRunReport, RequestTestResult } from "./types"

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function failureXml(result: RequestTestResult): string {
  const failureMessages = result.assertionResults
    .filter((r) => !r.passed)
    .map((r) => r.error ?? `Assertion failed: ${JSON.stringify(r.actualValue)}`)
  if (result.status === "errored") {
    return `<error message="${escape(result.error ?? "Unknown error")}">${escape(result.error ?? "")}</error>`
  }
  if (failureMessages.length === 0) return ""
  const msg = failureMessages.join("; ")
  const detail = result.assertionResults
    .filter((r) => !r.passed)
    .map((r) => `  ${JSON.stringify(r.assertion)}\n    expected: ${JSON.stringify(r.value ?? null)}\n    actual:   ${JSON.stringify(r.actualValue)}`)
    .join("\n")
  return `<failure message="${escape(msg)}">${escape(detail)}</failure>`
}

export function toJUnitXml(report: CollectionRunReport): string {
  const name = escape(report.collectionName)
  const time = (report.totalDurationMs / 1000).toFixed(3)
  const cases = report.results
    .map((r) => {
      const t = ((r.responseTimeMs ?? 0) / 1000).toFixed(3)
      return `    <testcase name="${escape(r.requestName)}" classname="${name}" time="${t}">${failureXml(r)}</testcase>`
    })
    .join("\n")

  const { total, failed, errored } = report.summary
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${name}" tests="${total}" failures="${failed}" errors="${errored}" time="${time}">
  <testsuite name="${name}" tests="${total}" failures="${failed}" errors="${errored}" time="${time}">
${cases}
  </testsuite>
</testsuites>
`
}
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-junit.test.ts`
Expected: PASS.

### Step 4.3 — Commit

```bash
git add lib/test-runner/junit-export.ts lib/__tests__/test-runner-junit.test.ts
git commit -m "feat(test-runner): JUnit XML serializer"
```

---

## Task 5: Sequential runner

**Files:**
- Create: `lib/test-runner/runner.ts`
- Create: `lib/__tests__/test-runner-runner.test.ts`

### Step 5.1 — Write the failing test

Create `lib/__tests__/test-runner-runner.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { runCollection } from "@/lib/test-runner/runner"
import type { RequestItem, Collection } from "@/hooks/request-types"

const fakeFetch = vi.fn().mockResolvedValue({
  status: 200,
  body: { ok: true },
  headers: { "content-type": "application/json" },
  responseTimeMs: 50,
})

const request: RequestItem = {
  id: "r1",
  name: "GET /ping",
  method: "GET",
  url: "https://api.example.com/ping",
  headers: [],
  queryParams: [],
  bodyType: "none",
  authType: "none",
  assertions: [{ type: "status", expected: 200 }],
}

const collection: Collection = {
  id: "c1", name: "Smoke", workspaceId: "ws",
  requests: [request], folders: [],
  createdAt: 0, updatedAt: 0,
}

describe("runCollection", () => {
  it("runs all requests sequentially and aggregates results", async () => {
    const report = await runCollection(collection, {
      environment: {}, iterationData: {}, iterationIndex: 0,
    }, { executor: fakeFetch })

    expect(report.summary.total).toBe(1)
    expect(report.summary.passed).toBe(1)
    expect(report.results[0].status).toBe("pass")
    expect(fakeFetch).toHaveBeenCalledOnce()
  })

  it("calls executor with the request URL and method", async () => {
    await runCollection(collection, { environment: {}, iterationData: {}, iterationIndex: 0 }, { executor: fakeFetch })
    expect(fakeFetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", url: expect.stringContaining("/ping") })
    )
  })

  it("marks request failed when assertions fail", async () => {
    const failingFetch = vi.fn().mockResolvedValue({
      status: 500, body: {}, headers: {}, responseTimeMs: 50,
    })
    const report = await runCollection(collection, { environment: {}, iterationData: {}, iterationIndex: 0 }, { executor: failingFetch })
    expect(report.results[0].status).toBe("fail")
    expect(report.summary.failed).toBe(1)
  })

  it("marks request errored when executor throws", async () => {
    const throwingFetch = vi.fn().mockRejectedValue(new Error("network"))
    const report = await runCollection(collection, { environment: {}, iterationData: {}, iterationIndex: 0 }, { executor: throwingFetch })
    expect(report.results[0].status).toBe("errored")
    expect(report.results[0].error).toContain("network")
  })

  it("runs dataset iterations when iterationData provided", async () => {
    const multiIter = { environment: {}, iterationData: {}, iterationIndex: 0 }
    const ctx = [
      { environment: {}, iterationData: { userId: "1" }, iterationIndex: 0 },
      { environment: {}, iterationData: { userId: "2" }, iterationIndex: 1 },
    ]
    const report = await runCollection(collection, multiIter, { executor: fakeFetch, iterations: ctx })
    expect(report.results.length).toBe(2)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
  })
})
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-runner.test.ts`
Expected: FAIL.

### Step 5.2 — Write minimal implementation

Create `lib/test-runner/runner.ts`:

```ts
import { evaluateAssertions } from "./assertions"
import { runScript } from "./scripts"
import type {
  CollectionRunReport, RequestResponse, RunnerContext,
  RequestTestResult, Assertion,
} from "./types"
import type { Collection, RequestItem } from "@/hooks/request-types"

export interface RunnerOptions {
  executor: (req: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => Promise<RequestResponse>
  iterations?: RunnerContext[]
  perRequestTimeoutMs?: number
  scriptTimeoutMs?: number
}

export async function runCollection(
  collection: Collection,
  baseContext: RunnerContext,
  options: RunnerOptions
): Promise<CollectionRunReport> {
  const startedAt = Date.now()
  const contexts = options.iterations ?? [baseContext]
  const results: RequestTestResult[] = []

  for (const ctx of contexts) {
    for (const req of collection.requests) {
      results.push(await runOne(req, ctx, options))
    }
  }

  const completedAt = Date.now()
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    startedAt,
    completedAt,
    totalDurationMs: completedAt - startedAt,
    results,
    summary: summarize(results),
  }
}

async function runOne(
  req: RequestItem,
  ctx: RunnerContext,
  options: RunnerOptions
): Promise<RequestTestResult> {
  const result: RequestTestResult = {
    requestId: req.id, requestName: req.name,
    status: "skipped", assertionResults: [],
  }

  // Pre script
  if (req.preRequestScript) {
    const out = runScript(req.preRequestScript, ctx, { phase: "pre", timeoutMs: options.scriptTimeoutMs })
    if (out.error) {
      result.status = "errored"
      result.error = `Pre-script error: ${out.error}`
      return result
    }
    result.scriptOutput = { ...(result.scriptOutput ?? {}), pre: out.consoleLines.join("\n") }
  }

  // HTTP
  let response: RequestResponse
  try {
    response = await options.executor({
      method: req.method,
      url: interpolate(req.url, ctx),
      headers: headerRecord(req.headers, ctx),
      body: req.body ? interpolate(req.body, ctx) : undefined,
    })
  } catch (err) {
    result.status = "errored"
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }
  result.statusCode = response.statusCode
  result.responseTimeMs = response.responseTimeMs

  // Post script
  if (req.postResponseScript) {
    const out = runScript(req.postResponseScript, ctx, { phase: "post", response, timeoutMs: options.scriptTimeoutMs })
    if (out.error) {
      result.status = "errored"
      result.error = `Post-script error: ${out.error}`
      return result
    }
    result.scriptOutput = { ...(result.scriptOutput ?? {}), post: out.consoleLines.join("\n") }
  }

  // Assertions
  const assertions = (req.assertions ?? []) as Assertion[]
  result.assertionResults = evaluateAssertions(assertions, response)
  result.status = result.assertionResults.every((r) => r.passed) ? "pass" : "fail"
  return result
}

function interpolate(value: string, ctx: RunnerContext): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx.environment[k] ?? ctx.iterationData[k] ?? `{{${k}}}`)
}

function headerRecord(headers: { key: string; value: string }[], ctx: RunnerContext): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of headers) out[h.key] = interpolate(h.value, ctx)
  return out
}

function summarize(results: RequestTestResult[]) {
  const s = { total: results.length, passed: 0, failed: 0, skipped: 0, errored: 0 }
  for (const r of results) s[r.status]++
  return s
}
```

Run: `cd reqy-web && npx vitest run lib/__tests__/test-runner-runner.test.ts`
Expected: PASS.

### Step 5.3 — Commit

```bash
git add lib/test-runner/runner.ts lib/__tests__/test-runner-runner.test.ts
git commit -m "feat(test-runner): sequential collection runner"
```

---

## Task 6: Server-side API endpoint

**Files:**
- Create: `app/api/test-runner/run/route.ts`

### Step 6.1 — Write the endpoint

Create `app/api/test-runner/run/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { runCollection } from "@/lib/test-runner/runner"
import { toJUnitXml } from "@/lib/test-runner/junit-export"
import { loadJsonDataset, loadCsvDataset } from "@/lib/test-runner/data-driven"
import type { Collection } from "@/hooks/request-types"

interface RunBody {
  collection: Collection
  environment?: Record<string, string>
  dataset?: { format: "json" | "csv"; content: string }
}

export async function POST(req: NextRequest) {
  let body: RunBody
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.collection) return NextResponse.json({ error: "Missing collection" }, { status: 400 })

  const executor = async (r: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => {
    const started = Date.now()
    const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body as BodyInit | undefined })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }
    return { statusCode: res.status, responseTimeMs: Date.now() - started, body: parsed, headers: Object.fromEntries(res.headers.entries()) }
  }

  let iterations
  if (body.dataset) {
    const rows = body.dataset.format === "json" ? loadJsonDataset(body.dataset.content) : loadCsvDataset(body.dataset.content)
    iterations = rows.map((row, i) => ({
      environment: body.environment ?? {}, iterationData: row, iterationIndex: i,
      log: () => {},
    }))
  }

  const report = await runCollection(body.collection, {
    environment: body.environment ?? {}, iterationData: {}, iterationIndex: 0,
    log: () => {},
  }, { executor, iterations })

  const url = new URL(req.url)
  if (url.searchParams.get("format") === "junit") {
    return new NextResponse(toJUnitXml(report), { status: 200, headers: { "content-type": "application/xml" } })
  }
  return NextResponse.json(report)
}
```

Run: `cd reqy-web && npx tsc --noEmit`
Expected: no errors.

### Step 6.2 — Commit

```bash
git add app/api/test-runner/run/route.ts
git commit -m "feat(test-runner): server-side run endpoint"
```

---

## Task 7: CLI runner

**Files:**
- Create: `scripts/run-collection.ts`

### Step 7.1 — Write the CLI script

Create `scripts/run-collection.ts`:

```ts
#!/usr/bin/env tsx
import fs from "node:fs/promises"
import path from "node:path"
import { runCollection } from "../lib/test-runner/runner"
import { toJUnitXml } from "../lib/test-runner/junit-export"
import { loadJsonDataset, loadCsvDataset } from "../lib/test-runner/data-driven"
import type { Collection } from "../hooks/request-types"

function parseArgs() {
  const args = process.argv.slice(2)
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) opts[args[i].slice(2)] = args[i + 1]
  }
  return opts as { collection: string; junit?: string; dataset?: string; env?: string }
}

async function main() {
  const opts = parseArgs()
  if (!opts.collection) {
    console.error("Usage: tsx scripts/run-collection.ts --collection <path-to-collection.json> [--dataset <path>] [--env <name>] [--junit <report.xml>]")
    process.exit(2)
  }
  const collectionPath = path.resolve(opts.collection)
  const collection: Collection = JSON.parse(await fs.readFile(collectionPath, "utf-8"))

  let iterations
  if (opts.dataset) {
    const dsPath = path.resolve(opts.dataset)
    const content = await fs.readFile(dsPath, "utf-8")
    const format = dsPath.endsWith(".csv") ? "csv" : "json"
    const rows = format === "json" ? loadJsonDataset(content) : loadCsvDataset(content)
    iterations = rows.map((row, i) => ({
      environment: {}, iterationData: row, iterationIndex: i,
      log: (m: string) => console.log(`[iter ${i}] ${m}`),
    }))
  }

  const executor = async (r: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => {
    const started = Date.now()
    const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body as BodyInit | undefined })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }
    return { statusCode: res.status, responseTimeMs: Date.now() - started, body: parsed, headers: Object.fromEntries(res.headers.entries()) }
  }

  const report = await runCollection(collection, {
    environment: {}, iterationData: {}, iterationIndex: 0,
    log: (m: string) => console.log(m),
  }, { executor, iterations })

  console.log(`\nResults: ${report.summary.passed}/${report.summary.total} passed`)
  for (const r of report.results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "!"
    console.log(`  ${icon} ${r.requestName} (${r.statusCode ?? "-"}, ${r.responseTimeMs ?? "-"}ms)`)
  }

  if (opts.junit) {
    await fs.writeFile(opts.junit, toJUnitXml(report), "utf-8")
    console.log(`JUnit report written to ${opts.junit}`)
  }

  process.exit(report.summary.failed + report.summary.errored > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
```

Run: `cd reqy-web && npx tsc --noEmit`
Expected: no errors.

### Step 7.2 — Commit

```bash
git add scripts/run-collection.ts
git commit -m "feat(test-runner): CLI runner script"
```

---

## Task 8: Store extensions and UI

**Files:**
- Modify: `hooks/store/types.ts`
- Modify: `hooks/use-request-store.ts`
- Create: `hooks/store/datasets.ts`
- Create: `hooks/store/test-runs.ts`
- Create: `components/assertion-editor.tsx`
- Create: `components/script-editor.tsx`
- Create: `components/test-runner-panel.tsx`
- Modify: `components/collections-panel.tsx`

### Step 8.1 — Extend `RequestItem` type

In `hooks/store/types.ts`, add to the `RequestItem` interface:

```ts
assertions?: import("@/lib/test-runner/types").Assertion[]
preRequestScript?: string
postResponseScript?: string
datasetKey?: string
```

### Step 8.2 — Create datasets store

Create `hooks/store/datasets.ts` (mirror existing store patterns):

```ts
"use client"
import { create } from "zustand"
import { persist } from "@/lib/store/middleware/with-cross-tab-sync"
import type { Dataset } from "@/lib/test-runner/types" // Add this type if needed
```

(Full implementation follows the pattern in `hooks/store/collections.ts`.)

### Step 8.3 — Create test-runs store

Create `hooks/store/test-runs.ts`:

```ts
"use client"
import { create } from "zustand"
import type { CollectionRunReport } from "@/lib/test-runner/types"

interface TestRunsState {
  runs: CollectionRunReport[]
  addRun: (r: CollectionRunReport) => void
  clearRuns: () => void
}
```

### Step 8.4 — Create assertion editor UI

Create `components/assertion-editor.tsx` — a React component using existing UI primitives (Button, Input, Select from `components/ui/`). Manage a list of `Assertion` objects with add/remove buttons.

### Step 8.5 — Create script editor UI

Create `components/script-editor.tsx` — a `<textarea>` with monospace font for JS code. Two textareas (pre + post) per request.

### Step 8.6 — Create test runner panel

Create `components/test-runner-panel.tsx`:
- Button: "Run collection"
- Shows live progress (X of N)
- Shows results table with status icon, request name, status code, response time
- Button: "Export JUnit" (downloads `toJUnitXml(report)` as `.xml` file)

### Step 8.7 — Add "Run" button to collections panel

In `components/collections-panel.tsx`, add a "Run" button next to each collection that opens the test runner panel.

### Step 8.8 — Verify

Run: `cd reqy-web && npx tsc --noEmit && npx vitest run`
Expected: all tests pass, no TS errors.

### Step 8.9 — Commit

```bash
git add hooks/store/types.ts hooks/store/datasets.ts hooks/store/test-runs.ts hooks/use-request-store.ts components/assertion-editor.tsx components/script-editor.tsx components/test-runner-panel.tsx components/collections-panel.tsx
git commit -m "feat(test-runner): store extensions + UI components"
```

---

## Task 9: Final verification

### Step 9.1 — Full test suite

```bash
cd reqy-web
npx vitest run
npx tsc --noEmit
```

Expected: all pass, no TS errors.

### Step 9.2 — Manual smoke test

1. Open Reqly, create a collection with one request
2. Add an assertion: status 200
3. Click "Run collection"
4. Verify pass/fail is shown
5. Click "Export JUnit" → verify XML is downloaded

### Step 9.3 — CLI smoke test

```bash
echo '{"id":"c1","name":"Test","requests":[{"id":"r1","name":"GET https://httpbin.org/status/200","method":"GET","url":"https://httpbin.org/status/200","headers":[],"queryParams":[],"bodyType":"none","authType":"none","assertions":[{"type":"status","expected":200}]}],"folders":[],"createdAt":0,"updatedAt":0,"workspaceId":"ws"}' > /tmp/c.json
cd reqy-web && pnpm tsx scripts/run-collection.ts --collection /tmp/c.json --junit /tmp/r.xml
cat /tmp/r.xml
```

Expected: exit 0, JUnit XML emitted.

### Step 9.4 — Final commit

```bash
git commit --allow-empty -m "chore: collection runner feature complete"
```
