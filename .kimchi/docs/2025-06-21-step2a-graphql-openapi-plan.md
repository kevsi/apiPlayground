# Step 2a — GraphQL + OpenAPI Inference — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Pure-function chunks can run in parallel. Integration chunks require both pure-function chunks to complete first.

**Goal:** Add GraphQL native support (queries + mutations + introspection) and OpenAPI schema inference from history.

**Architecture:** Two independent modules — `lib/graphql/` and `lib/openapi-inference/` — with integration into existing `lib/openapi-export.ts`, `lib/types.ts`, and `components/`.

**Tech Stack:** TypeScript 5.7, existing patterns from step 1, Vitest, existing Zustand stores.

---

## File Map

### New files
| File | Role |
|---|---|
| `lib/graphql/types.ts` | GraphQL request/response types |
| `lib/graphql/execute.ts` | Run GraphQL query via fetch |
| `lib/graphql/introspect.ts` | Run `__schema` query |
| `lib/graphql/__tests__/execute.test.ts` | |
| `lib/graphql/__tests__/introspect.test.ts` | |
| `lib/openapi-inference/infer-schema.ts` | JSON → OpenAPI schema |
| `lib/openapi-inference/merge-schemas.ts` | allOf merge |
| `lib/openapi-inference/examples.ts` | Extract example |
| `lib/openapi-inference/__tests__/infer-schema.test.ts` | |
| `lib/openapi-inference/__tests__/merge-schemas.test.ts` | |
| `components/graphql-body-editor.tsx` | Query + variables editor |
| `components/graphql-introspect-button.tsx` | Introspection button + status |
| `hooks/store/graphql-schemas.ts` | Zustand store for cached SDLs |

### Modified files
| File | Change |
|---|---|
| `lib/types.ts` | Add `protocol?: "rest" \| "graphql"` and `graphql?: { query, variables, operationName? }` to `RequestItem` |
| `lib/openapi-export.ts` | Accept optional `inferredSchemas` and merge via allOf |
| `components/request-panel.tsx` | Add protocol tab selector + GraphQL body editor |
| `components/openapi-export-modal.tsx` | Add "Infer schemas from history" checkbox |
| `hooks/use-request-store.ts` | Wire graphql-schemas store (if not already wired) |

---

## Chunk 1: GraphQL pure functions (parallel-safe)

**Files:**
- Create: `lib/graphql/types.ts`
- Create: `lib/graphql/execute.ts`
- Create: `lib/graphql/introspect.ts`
- Create: `lib/graphql/__tests__/execute.test.ts`
- Create: `lib/graphql/__tests__/introspect.test.ts`

### Step 1.1 — Create `lib/graphql/types.ts`

```ts
import type { RequestResponse } from "@/lib/test-runner/types"

export interface GraphQLRequest {
  endpoint: string
  query: string
  variables?: Record<string, unknown>
  operationName?: string
  headers?: Record<string, string>
}

export interface GraphQLError {
  message: string
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}

export interface GraphQLExecuteResult extends Omit<RequestResponse, "body"> {
  data?: unknown
  errors?: GraphQLError[]
  graphqlBody: { data?: unknown; errors?: GraphQLError[] } | unknown
}
```

### Step 1.2 — Create `lib/graphql/execute.ts`

```ts
import type { GraphQLExecuteResult, GraphQLRequest } from "./types"

export async function executeGraphQL(input: GraphQLRequest): Promise<GraphQLExecuteResult> {
  const started = Date.now()
  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...input.headers,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
      operationName: input.operationName,
    }),
  })
  const json = await res.json().catch(() => ({}))
  return {
    statusCode: res.status,
    responseTimeMs: Date.now() - started,
    headers: Object.fromEntries(res.headers.entries()),
    graphqlBody: json,
    data: (json && typeof json === "object" && "data" in json) ? json.data : json,
    errors: (json && typeof json === "object" && "errors" in json) ? json.errors : undefined,
  }
}
```

### Step 1.3 — Create `lib/graphql/introspect.ts`

```ts
const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      fields {
        name
        args { name type { kind name ofType { kind name } } }
        type { kind name ofType { kind name } }
      }
    }
  }
}`

export const INTROSPECTION_QUERY_STRING = INTROSPECTION_QUERY

export async function introspectSchema(endpoint: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  })
  const json = await res.json().catch(() => ({}))
  return JSON.stringify(json?.data ?? json ?? {})
}

export function endpointHash(endpoint: string): string {
  let hash = 0
  for (let i = 0; i < endpoint.length; i++) {
    hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0
  }
  return `gql-${Math.abs(hash).toString(36)}`
}
```

### Step 1.4 — Tests

Create `lib/graphql/__tests__/execute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { executeGraphQL } from "@/lib/graphql/execute"

describe("executeGraphQL", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it("POSTs to endpoint with query, variables, operationName", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { user: { id: "1" } } }), { status: 200 })
    )
    await executeGraphQL({
      endpoint: "https://api.example.com/graphql",
      query: "query GetUser($id: ID!) { user(id: $id) { id } }",
      variables: { id: "1" },
      operationName: "GetUser",
    })
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/graphql", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        query: "query GetUser($id: ID!) { user(id: $id) { id } }",
        variables: { id: "1" },
        operationName: "GetUser",
      }),
    }))
  })

  it("returns data on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { hello: "world" } }), { status: 200 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ hello }" })
    expect(result.data).toEqual({ hello: "world" })
    expect(result.errors).toBeUndefined()
  })

  it("returns errors array on GraphQL errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: null, errors: [{ message: "Not found" }] }), { status: 200 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ bad }" })
    expect(result.errors).toEqual([{ message: "Not found" }])
  })

  it("handles HTTP errors (non-2xx)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ x }" })
    expect(result.statusCode).toBe(500)
  })

  it("merges custom headers with defaults", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response("{}", { status: 200 })
    )
    await executeGraphQL({ endpoint: "https://x", query: "{ x }", headers: { Authorization: "Bearer abc" } })
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers.Authorization).toBe("Bearer abc")
  })
})
```

Create `lib/graphql/__tests__/introspect.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { introspectSchema, endpointHash, INTROSPECTION_QUERY_STRING } from "@/lib/graphql/introspect"

describe("introspectSchema", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it("POSTs introspection query", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { __schema: { queryType: { name: "Query" } } } }), { status: 200 })
    )
    await introspectSchema("https://api.example.com/graphql")
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/graphql", expect.objectContaining({
      body: JSON.stringify({ query: INTROSPECTION_QUERY_STRING }),
    }))
  })

  it("returns the JSON-stringified data field", async () => {
    const data = { __schema: { queryType: { name: "Query" } } }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data }), { status: 200 })
    )
    const sdl = await introspectSchema("https://x")
    expect(JSON.parse(sdl)).toEqual(data)
  })
})

describe("endpointHash", () => {
  it("produces stable hash for same endpoint", () => {
    expect(endpointHash("https://x")).toBe(endpointHash("https://x"))
  })

  it("produces different hashes for different endpoints", () => {
    expect(endpointHash("https://x")).not.toBe(endpointHash("https://y"))
  })

  it("starts with 'gql-' prefix", () => {
    expect(endpointHash("https://x")).toMatch(/^gql-/)
  })
})
```

Run: `cd reqy-web && npx vitest run lib/graphql/__tests__/ && npx tsc --noEmit`
Expected: 8 tests pass, TS clean.

Commit:
```bash
git add lib/graphql/
git commit -m "feat(graphql): types + execute + introspect (queries, mutations, schema introspection)"
```

---

## Chunk 2: OpenAPI inference pure functions (parallel-safe)

**Files:**
- Create: `lib/openapi-inference/infer-schema.ts`
- Create: `lib/openapi-inference/merge-schemas.ts`
- Create: `lib/openapi-inference/examples.ts`
- Create: `lib/openapi-inference/__tests__/infer-schema.test.ts`
- Create: `lib/openapi-inference/__tests__/merge-schemas.test.ts`

### Step 2.1 — Create `lib/openapi-inference/infer-schema.ts`

```ts
export function inferSchemaFromValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: "null" }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} }
    const itemSchemas = value.map(inferSchemaFromValue)
    if (itemSchemas.length === 1) return { type: "array", items: itemSchemas[0] }
    return { type: "array", items: { allOf: dedupeSchemas(itemSchemas) } }
  }
  if (typeof value === "object") {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = inferSchemaFromValue(v)
      required.push(k)
    }
    return { type: "object", properties, required }
  }
  if (typeof value === "number") return { type: "number" }
  if (typeof value === "boolean") return { type: "boolean" }
  return { type: "string" }
}

function dedupeSchemas(schemas: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  return schemas.filter((s) => {
    const key = JSON.stringify(s)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

### Step 2.2 — Create `lib/openapi-inference/merge-schemas.ts`

```ts
export function mergeInferredWithGeneric(
  inferred: Record<string, unknown>,
  generic: Record<string, unknown>
): Record<string, unknown> {
  if (JSON.stringify(inferred) === JSON.stringify(generic)) return inferred
  return { allOf: [generic, inferred] }
}
```

### Step 2.3 — Create `lib/openapi-inference/examples.ts`

```ts
export function extractExample(responseBody: unknown): unknown {
  if (responseBody === null || typeof responseBody !== "object") return responseBody
  if (Array.isArray(responseBody)) return responseBody[0] ?? null
  return responseBody
}
```

### Step 2.4 — Tests

Create `lib/openapi-inference/__tests__/infer-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { inferSchemaFromValue } from "@/lib/openapi-inference/infer-schema"

describe("inferSchemaFromValue", () => {
  it("infers string", () => {
    expect(inferSchemaFromValue("hello")).toEqual({ type: "string" })
  })

  it("infers number", () => {
    expect(inferSchemaFromValue(42)).toEqual({ type: "number" })
  })

  it("infers boolean", () => {
    expect(inferSchemaFromValue(true)).toEqual({ type: "boolean" })
  })

  it("infers null", () => {
    expect(inferSchemaFromValue(null)).toEqual({ type: "null" })
  })

  it("infers object with required fields", () => {
    const schema = inferSchemaFromValue({ id: "1", name: "Alice" })
    expect(schema).toEqual({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    })
  })

  it("infers nested object", () => {
    const schema = inferSchemaFromValue({ user: { id: 1, tags: ["a", "b"] } })
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    })
  })

  it("infers array of objects with allOf merge", () => {
    const schema = inferSchemaFromValue([{ a: 1 }, { a: 2, b: "x" }])
    expect(schema.type).toBe("array")
    const items = schema.items as { allOf: Record<string, unknown>[] }
    expect(items.allOf).toHaveLength(2)
  })

  it("infers empty array", () => {
    expect(inferSchemaFromValue([])).toEqual({ type: "array", items: {} })
  })

  it("deduplicates identical schemas in array", () => {
    const schema = inferSchemaFromValue([{ a: 1 }, { a: 1 }])
    const items = schema.items as { allOf?: unknown[] }
    expect(items.allOf).toHaveLength(1)
  })
})
```

Create `lib/openapi-inference/__tests__/merge-schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { mergeInferredWithGeneric } from "@/lib/openapi-inference/merge-schemas"

describe("mergeInferredWithGeneric", () => {
  it("returns inferred as-is when identical", () => {
    const s = { type: "object", properties: { id: { type: "string" } } }
    expect(mergeInferredWithGeneric(s, s)).toBe(s)
  })

  it("combines via allOf when different", () => {
    const inferred = { type: "object", properties: { id: { type: "string" } } }
    const generic = { type: "object" }
    expect(mergeInferredWithGeneric(inferred, generic)).toEqual({ allOf: [generic, inferred] })
  })
})
```

Run: `cd reqy-web && npx vitest run lib/openapi-inference/__tests__/ && npx tsc --noEmit`
Expected: 11 tests pass, TS clean.

Commit:
```bash
git add lib/openapi-inference/
git commit -m "feat(openapi): infer schema from response + merge with generic via allOf"
```

---

## Chunk 3: Integration (depends on chunks 1 + 2)

**Files:**
- Modify: `lib/types.ts` — add `protocol` and `graphql` to `RequestItem`
- Modify: `lib/openapi-export.ts` — accept optional `inferredSchemas`
- Create: `components/graphql-body-editor.tsx`
- Create: `components/graphql-introspect-button.tsx`
- Modify: `components/request-panel.tsx` — add protocol tab selector
- Modify: `components/openapi-export-modal.tsx` — add "Infer from history" checkbox
- Create: `hooks/store/graphql-schemas.ts` (optional — can defer if too complex)

### Step 3.1 — Extend `RequestItem` type

Read `lib/types.ts`. Add to the `RequestItem` interface:

```ts
protocol?: "rest" | "graphql"
graphql?: {
  query: string
  variables: string  // JSON string
  operationName?: string
}
```

### Step 3.2 — Update `lib/openapi-export.ts`

Read the current file. Find the function that builds response schemas. Add an optional parameter:

```ts
import { inferSchemaFromValue } from "@/lib/openapi-inference/infer-schema"
import { mergeInferredWithGeneric } from "@/lib/openapi-inference/merge-schemas"
import { extractExample } from "@/lib/openapi-inference/examples"

interface ExportOptions {
  inferredResponses?: Record<string, { body: unknown }>  // requestId → response body
  enableInference?: boolean
}
```

Pass `options` through to the schema-generation function. When `options.enableInference && options.inferredResponses[req.id]`, generate schema from `inferSchemaFromValue(body)` and merge with the generic schema via `mergeInferredWithGeneric`. Also add `example: extractExample(body)` to the schema if defined.

(Exact integration depends on the existing function structure — adapt accordingly.)

### Step 3.3 — Create GraphQL body editor component

Create `components/graphql-body-editor.tsx`:

```tsx
"use client"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface Props {
  query: string
  variables: string
  operationName?: string
  onQueryChange: (next: string) => void
  onVariablesChange: (next: string) => void
  onOperationNameChange: (next: string) => void
  variablesError?: string
}

export function GraphQLBodyEditor({
  query, variables, operationName,
  onQueryChange, onVariablesChange, onOperationNameChange, variablesError,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Operation name (optional)</Label>
        <Input
          value={operationName ?? ""}
          onChange={(e) => onOperationNameChange(e.target.value)}
          placeholder="GetUser"
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Query / Mutation</Label>
        <Textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="query GetUser($id: ID!) { user(id: $id) { id name } }"
          className="font-mono text-xs min-h-32"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Variables (JSON)</Label>
        <Textarea
          value={variables}
          onChange={(e) => onVariablesChange(e.target.value)}
          placeholder='{ "id": "1" }'
          className="font-mono text-xs min-h-20"
        />
        {variablesError && (
          <p className="text-xs text-red-500">{variablesError}</p>
        )}
      </div>
    </div>
  )
}
```

### Step 3.4 — Create introspection button

Create `components/graphql-introspect-button.tsx`:

```tsx
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"
import { introspectSchema, endpointHash } from "@/lib/graphql/introspect"

interface Props {
  endpoint: string
  onSchemaFetched?: (sdl: string, hash: string) => void
}

export function GraphQLIntrospectButton({ endpoint, onSchemaFetched }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const sdl = await introspectSchema(endpoint)
      const hash = endpointHash(endpoint)
      onSchemaFetched?.(sdl, hash)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Introspection failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={loading || !endpoint}>
        {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
        Introspect schema
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
```

### Step 3.5 — Wire into request panel

Read `components/request-panel.tsx`. Add a protocol tab selector at the top of the body section:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

// Inside the body section:
<Tabs value={request.protocol ?? "rest"} onValueChange={(v) => update({ protocol: v as "rest" | "graphql" })}>
  <TabsList>
    <TabsTrigger value="rest">REST</TabsTrigger>
    <TabsTrigger value="graphql">GraphQL</TabsTrigger>
  </TabsList>
  <TabsContent value="rest">
    {/* existing REST body editor */}
  </TabsContent>
  <TabsContent value="graphql">
    <GraphQLBodyEditor
      query={request.graphql?.query ?? ""}
      variables={request.graphql?.variables ?? "{}"}
      operationName={request.graphql?.operationName}
      onQueryChange={(q) => update({ graphql: { ...request.graphql, query: q, variables: request.graphql?.variables ?? "{}", operationName: request.graphql?.operationName } })}
      onVariablesChange={(v) => update({ graphql: { ...request.graphql, query: request.graphql?.query ?? "", variables: v, operationName: request.graphql?.operationName } })}
      onOperationNameChange={(o) => update({ graphql: { ...request.graphql, query: request.graphql?.query ?? "", variables: request.graphql?.variables ?? "{}", operationName: o } })}
    />
  </TabsContent>
</Tabs>
```

(Exact integration depends on existing component structure — adapt accordingly.)

### Step 3.6 — Add "Infer from history" to OpenAPI export modal

Read `components/openapi-export-modal.tsx`. Add a checkbox:

```tsx
import { inferSchemaFromValue } from "@/lib/openapi-inference/infer-schema"

// In the modal state:
const [inferFromHistory, setInferFromHistory] = useState(true)

// In the modal UI, before the export button:
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    id="infer-from-history"
    checked={inferFromHistory}
    onChange={(e) => setInferFromHistory(e.target.checked)}
  />
  <Label htmlFor="infer-from-history" className="text-xs">
    Infer schemas from history (merge with generic via allOf)
  </Label>
</div>
```

And pass `enableInference: inferFromHistory` plus the latest response bodies from history to the export function.

### Step 3.7 — Verify and commit

```bash
cd reqy-web && npx tsc --noEmit && npx vitest run
```

If new tests fail or TS errors appear, fix and re-run.

```bash
git add lib/types.ts lib/openapi-export.ts components/graphql-body-editor.tsx components/graphql-introspect-button.tsx components/request-panel.tsx components/openapi-export-modal.tsx
git commit -m "feat(graphql+openapi): integrate into request panel and export modal"
```

---

## Final verification

```bash
cd reqy-web
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass (no regression on previous 257/258), TS clean.

Final commit if needed:
```bash
git commit --allow-empty -m "chore: step 2a (GraphQL + OpenAPI inference) complete"
```
