# Collection Runner — Design

## Context
Reqly is a Next.js + Tauri API testing playground. It currently supports manual request execution, history, collections, environments, variable chaining, and an AI assistant — but has no automated testing capabilities. Users have asked for a "collection runner" (à la Postman Runner / Newman / Bruno) so they can execute an entire collection automatically and verify responses.

## Goal
Add a complete collection runner that turns Reqly from a manual testing tool into an automated testing platform.

## User-confirmed scope

### 4 Assertion types
1. **Status code** — `200`, `in: [200,201]`, `not: 500`
2. **Response time** — `< 500ms`
3. **JSON path** — `jsonPath("$.user.id") equals "abc123"`
4. **Schema validation** — body matches a JSON Schema fragment

### 4 Features
1. **Pre/post scripts** — JavaScript executed before/after each request (sandboxed)
2. **Data-driven testing** — iterate over CSV / JSON datasets
3. **JUnit XML export** — for CI/CD integration (Jenkins, GitHub Actions, GitLab)
4. **CLI runner** (`reqly-cli`) — headless execution from the command line

### Execution mode
**Sequential only** (MVP) — preserves variable chaining between requests.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ UI: Test Runner Panel + Assertion Editor (per request)   │
│   - View run progress (live)                             │
│   - View pass/fail per assertion                         │
│   - Export JUnit XML button                              │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│ Collection Runner Engine (lib/test-runner/)              │
│   - Sequential executor (uses existing proxy)            │
│   - Assertion evaluator                                  │
│   - Script sandbox (vm module)                           │
│   - Data-driven iterator                                 │
│   - Report aggregator                                    │
└────┬─────────────────────┬────────────────────┬──────────┘
     │                     │                    │
     ▼                     ▼                    ▼
┌─────────────┐    ┌─────────────────┐   ┌──────────────┐
│ HTTP proxy  │    │ JUnit XML export│   │ CLI runner   │
│ (existing)  │    │                 │   │ (tsx script) │
└─────────────┘    └─────────────────┘   └──────────────┘
```

## Data model

### Assertion (added to RequestItem)
```ts
type Assertion =
  | { type: "status"; expected: number | { in: number[] } | { not: number } }
  | { type: "responseTime"; operator: "<" | "<=" | ">" | ">=", valueMs: number }
  | { type: "jsonPath"; path: string; operator: "equals" | "contains" | "exists" | "notExists"; value?: unknown }
  | { type: "schema"; schema: object /* JSON Schema */ }
```

### Pre/post scripts (added to RequestItem)
```ts
interface RequestItem {
  // ... existing fields
  preRequestScript?: string    // JS code
  postResponseScript?: string  // JS code
  datasetKey?: string          // reference to a dataset in the workspace
}
```

### Dataset (new store)
```ts
interface Dataset {
  id: string
  name: string
  format: "json" | "csv"
  rows: Record<string, string>[]
  workspaceId: string
}
```

### Test result (transient, computed per run)
```ts
interface RequestTestResult {
  requestId: string
  requestName: string
  status: "pass" | "fail" | "skipped" | "errored"
  statusCode?: number
  responseTimeMs?: number
  assertionResults: Array<{
    assertion: Assertion
    passed: boolean
    actualValue: unknown
    error?: string
  }>
  scriptOutput?: { pre?: string; post?: string }
  error?: string
}
```

### Collection run report
```ts
interface CollectionRunReport {
  collectionId: string
  collectionName: string
  startedAt: number
  completedAt: number
  totalDurationMs: number
  results: RequestTestResult[]
  summary: { total: number; passed: number; failed: number; skipped: number; errored: number }
}
```

## File map

| File | Action | Role |
|---|---|---|
| `lib/test-runner/types.ts` | **Create** | All TypeScript types above |
| `lib/test-runner/assertions.ts` | **Create** | Pure-function assertion evaluators |
| `lib/test-runner/scripts.ts` | **Create** | JS sandbox using Node `vm` module |
| `lib/test-runner/data-driven.ts` | **Create** | CSV/JSON dataset loader & iterator |
| `lib/test-runner/runner.ts` | **Create** | Sequential runner that orchestrates everything |
| `lib/test-runner/junit-export.ts` | **Create** | JUnit XML serializer |
| `lib/test-runner/cli.ts` | **Create** | CLI entry point |
| `hooks/store/datasets.ts` | **Create** | Zustand store for datasets |
| `hooks/store/types.ts` | **Modify** | Add `assertions`, `preRequestScript`, `postResponseScript`, `datasetKey` to `RequestItem` |
| `hooks/store/test-runs.ts` | **Create** | Store for run history |
| `app/api/test-runner/run/route.ts` | **Create** | Server-side run endpoint (for CI/CD use) |
| `components/assertion-editor.tsx` | **Create** | UI to edit assertions per request |
| `components/script-editor.tsx` | **Create** | UI to edit pre/post scripts |
| `components/test-runner-panel.tsx` | **Create** | UI to view run progress + results |
| `components/collections-panel.tsx` | **Modify** | Add "Run collection" button |
| `scripts/run-collection.ts` | **Create** | CLI entry (invoke via `pnpm tsx`) |
| `lib/__tests__/test-runner-assertions.test.ts` | **Create** | Unit tests for assertions |
| `lib/__tests__/test-runner-scripts.test.ts` | **Create** | Sandbox safety tests |
| `lib/__tests__/test-runner-junit.test.ts` | **Create** | JUnit XML format tests |
| `lib/__tests__/test-runner-data-driven.test.ts` | **Create** | Dataset loader tests |

## Pre/post script sandbox

The sandbox uses Node's `vm` module for isolation. Provided API:

```js
// Available in preRequestScript:
pm.environment.set("token", "abc123")
pm.environment.get("baseUrl")
pm.variables.set("nonce", Math.random().toString())
pm.request.headers.add({ key: "X-Nonce", value: pm.variables.get("nonce") })
console.log("running request to", pm.request.url)

// Available in postResponseScript:
pm.expect(pm.response.code).to.equal(200)
pm.environment.set("lastId", pm.response.json().id)
console.log("response time", pm.response.responseTime)
```

**Security**:
- No `require`, no `import` of external modules
- No `fs`, `child_process`, `net`, `http` (outbound network)
- No `process.exit`, no global mutation
- 5-second timeout per script
- Console output captured for the report

## Data-driven format

**JSON**:
```json
[
  { "userId": 1, "expectedName": "Alice" },
  { "userId": 2, "expectedName": "Bob" }
]
```

**CSV** (first row = headers):
```csv
userId,expectedName
1,Alice
2,Bob
```

Variables accessible via `pm.iterationData.get("userId")`.

## JUnit XML format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="My Collection" tests="3" failures="1" time="1.234">
  <testsuite name="My Collection" tests="3" failures="1" time="1.234">
    <testcase name="GET /users" classname="My Collection" time="0.456"/>
    <testcase name="POST /login" classname="My Collection" time="0.789">
      <failure message="Status expected 200 but got 401">...</failure>
    </testcase>
  </testsuite>
</testsuites>
```

## CLI usage

```bash
# Run a collection by ID (from saved collection file)
pnpm tsx scripts/run-collection.ts --collection <id> --junit report.xml

# Run with dataset
pnpm tsx scripts/run-collection.ts --collection <id> --dataset users.json

# Run against a specific environment
pnpm tsx scripts/run-collection.ts --collection <id> --env staging
```

Exit codes: 0 = all passed, 1 = failures, 2 = error.

## Error handling

- **Script error** — caught and reported as `errored`, runner continues to next request
- **Assertion failure** — request marked `fail`, runner continues
- **Network error** — request marked `errored`, runner continues
- **Per-request timeout** — 30s default, configurable per collection
- **Global runner timeout** — 5min default, configurable

## Testing strategy

- **Unit tests**: assertions, scripts sandbox, JUnit export, data-driven loader (no I/O)
- **Integration tests**: runner with mock HTTP server
- **E2E (Playwright)**: deferred to step 2 of this plan
- **Type safety**: full coverage with `tsc --noEmit`

## Non-goals (out of scope)

- Parallel execution mode (sequential only for MVP)
- Visual regression testing
- Performance / load testing (would need a separate module)
- Server-side scheduler
- Reporting dashboards
- Diff between two runs (only pass/fail per request)
- Sharing collections with cloud sync (covered in step 2)

## Dependencies

- No new external packages needed
- Node `vm` module (built-in) for sandbox
- Built-in `JSON.parse` for JSON datasets
- Lightweight CSV parser (write inline, ~30 lines) — avoids adding `papaparse`
- `tsx` already in dev deps for the CLI runner

## Risks

- **Sandbox escape**: vm isn't a hard sandbox. Mitigated by stripping dangerous globals and 5s timeout.
- **Performance**: 100+ requests with assertions + scripts could be slow. Sequential is fine for MVP.
- **Backwards compat**: existing RequestItem data without assertions/scripts must keep working.
