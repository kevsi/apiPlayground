# Step 2a — GraphQL + OpenAPI Inference — Design

## Context
Step 1 (collection runner) shipped in commit `ec4f9cc`. Step 2a adds two features:
1. **GraphQL native support** — differentiate Reqly from Postman/Insomnia for GraphQL workflows
2. **OpenAPI schema inference** — improve export quality by inferring schemas from actual response history

## Scope (recommended defaults)

### GraphQL (MVP)
- ✅ Queries + Mutations (text + JSON variables)
- ✅ Schema introspection (`__schema` query → cached SDL)
- ✅ Variable interpolation (`{{var}}` like REST)
- ✅ Response panel unchanged
- ❌ Subscriptions (WebSocket complexity — defer to v2)
- ❌ Visual explorer / autocomplete (UI effort — defer to v2)

### OpenAPI inference (MVP)
- ✅ On-demand: button in OpenAPI export modal
- ✅ Inference from response bodies in `history[]` per request
- ✅ Merge with existing generic schemas via `allOf`
- ✅ Include `example` from latest successful response
- ❌ Auto-inference on each request (too noisy — defer)
- ❌ JSON Schema draft-07 export (OpenAPI 3.0 schema objects only)

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│ Request Panel (existing)                                 │
│   ├─ [REST tab] [GraphQL tab] ← new tab selector       │
│   └─ Body editor switches based on protocol             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ GraphQL module (lib/graphql/) — new                     │
│   ├─ types.ts — GraphQLRequest, GraphQLResponse         │
│   ├─ execute.ts — query/mutation via fetch              │
│   ├─ introspect.ts — __schema query, SDL cache          │
│   └─ store/graphql-cache.ts — Zustand store for SDLs    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ OpenAPI inference (lib/openapi-inference/) — new        │
│   ├─ infer-schema.ts — JSON body → OpenAPI schema       │
│   ├─ merge-schemas.ts — allOf merge logic               │
│   └─ examples.ts — extract example from response        │
└─────────────────────────────────────────────────────────┘
```

## Data model

### GraphQL request (extends RequestItem)
```ts
interface RequestItem {
  // ... existing fields
  protocol?: "rest" | "graphql"  // defaults to "rest"
  graphql?: {
    query: string           // SDL query/mutation text
    variables: string       // JSON string
    operationName?: string
  }
}
```

### GraphQL schema cache
```ts
interface GraphQLSchema {
  id: string                // hash of endpoint URL
  endpoint: string          // GraphQL endpoint URL
  sdl: string               // introspection result as SDL string
  fetchedAt: number
  workspaceId: string
}
```

### OpenAPI inference (no new types — operates on existing Collection + HistoryItem)

## File map

| File | Action | Role |
|---|---|---|
| `lib/graphql/types.ts` | **Create** | GraphQLRequest, GraphQLResponse, GraphQLError |
| `lib/graphql/execute.ts` | **Create** | Pure function: run GraphQL query against endpoint |
| `lib/graphql/introspect.ts` | **Create** | Run `__schema` introspection, return SDL string |
| `lib/graphql/sdl-cache.ts` | **Create** | In-memory + localStorage cache for SDLs |
| `lib/graphql/index.ts` | **Create** | Barrel export |
| `lib/graphql/__tests__/execute.test.ts` | **Create** | Tests for execute |
| `lib/graphql/__tests__/introspect.test.ts` | **Create** | Tests for introspect |
| `lib/openapi-inference/infer-schema.ts` | **Create** | Pure function: JSON → OpenAPI 3.0 schema |
| `lib/openapi-inference/merge-schemas.ts` | **Create** | Pure function: schema A + schema B → allOf merge |
| `lib/openapi-inference/examples.ts` | **Create** | Extract example from response body |
| `lib/openapi-inference/__tests__/infer-schema.test.ts` | **Create** | |
| `lib/openapi-inference/__tests__/merge-schemas.test.ts` | **Create** | |
| `lib/openapi-export.ts` | **Modify** | Accept optional `inferredSchemas` and merge into output |
| `lib/types.ts` | **Modify** | Add `protocol` and `graphql` to RequestItem |
| `hooks/store/graphql-schemas.ts` | **Create** | Zustand store for cached SDLs |
| `hooks/use-request-store.ts` | **Modify** | Wire graphql-schemas store |
| `components/request-panel.tsx` | **Modify** | Add protocol tab selector + GraphQL body editor |
| `components/graphql-body-editor.tsx` | **Create** | Query textarea + variables JSON textarea |
| `components/graphql-introspect-button.tsx` | **Create** | Button + status indicator |
| `components/openapi-export-modal.tsx` | **Modify** | Add "Infer schemas from history" checkbox |

## GraphQL execute

```ts
// lib/graphql/execute.ts
import type { RequestResponse } from "@/lib/test-runner/types"

export interface GraphQLExecuteInput {
  endpoint: string
  query: string
  variables?: Record<string, unknown>
  operationName?: string
  headers?: Record<string, string>
}

export interface GraphQLExecuteResult extends RequestResponse {
  graphqlErrors?: Array<{ message: string; path?: (string | number)[] }>
}

export async function executeGraphQL(input: GraphQLExecuteInput): Promise<GraphQLExecuteResult> {
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
  const json = await res.json()
  return {
    statusCode: res.status,
    responseTimeMs: Date.now() - started,
    body: json.data ?? json,
    headers: Object.fromEntries(res.headers.entries()),
    graphqlErrors: json.errors,
  }
}
```

## GraphQL introspect

```ts
// lib/graphql/introspect.ts
const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind name
      fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name } } }
    }
  }
}`

export async function introspectSchema(endpoint: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  })
  const json = await res.json()
  // For MVP, store the raw JSON response — SDL serialization (graphql-js) is out of scope
  return JSON.stringify(json.data ?? json)
}

export function endpointHash(endpoint: string): string {
  // Simple stable hash for cache key
  let hash = 0
  for (let i = 0; i < endpoint.length; i++) {
    hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0
  }
  return `gql-${Math.abs(hash).toString(36)}`
}
```

## OpenAPI schema inference

```ts
// lib/openapi-inference/infer-schema.ts
export function inferSchemaFromValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: "null" }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} }
    // Merge schemas from all items (allOf)
    const itemSchemas = value.map(inferSchemaFromValue)
    if (itemSchemas.length === 1) return { type: "array", items: itemSchemas[0] }
    return { type: "array", items: { allOf: dedupeSchemas(itemSchemas) } }
  }
  if (typeof value === "object") {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [k, v] of Object.entries(value)) {
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

## OpenAPI schema merging

```ts
// lib/openapi-inference/merge-schemas.ts
export function mergeInferredWithGeneric(
  inferred: Record<string, unknown>,
  generic: Record<string, unknown>
): Record<string, unknown> {
  // If they're identical, return as-is
  if (JSON.stringify(inferred) === JSON.stringify(generic)) return inferred
  // Otherwise combine via allOf
  return { allOf: [generic, inferred] }
}
```

## Example extraction

```ts
// lib/openapi-inference/examples.ts
export function extractExample(responseBody: unknown): unknown {
  if (responseBody === null || typeof responseBody !== "object") return responseBody
  if (Array.isArray(responseBody)) return responseBody[0] ?? null
  return responseBody
}
```

## Error handling

- **GraphQL execute** — surface both HTTP errors (statusCode) and GraphQL errors (`errors` array) in the response panel
- **Introspect** — on failure, show user-friendly error message ("Schema introspection failed — is the endpoint a GraphQL server?")
- **Infer schema** — on non-JSON response, skip inference and fall back to generic schema
- **Cache** — invalidate cache on endpoint URL change

## Testing strategy

- Unit tests for all pure functions (execute, introspect, infer-schema, merge-schemas, examples)
- Mock fetch in tests (no real network calls)
- Type-safety: `tsc --noEmit` clean

## Non-goals (out of scope)

- GraphQL subscriptions (WebSocket)
- Visual GraphQL explorer / autocomplete
- Auto-inference on every request
- JSON Schema draft-07 export (OpenAPI 3.0 only)
- SDL generation from introspection JSON (store raw JSON for MVP)
- Multi-file .graphql support

## Dependencies

- No new packages needed
- Uses `fetch` (built-in), existing Zustand, existing localStorage adapter

## Risks

- **Introspection on large schemas** can be slow (>1MB response). Mitigated by caching.
- **Inferred schema drift**: if response shape changes, inference might generate overly permissive `allOf`. Mitigated by using the most recent N=5 responses and merging them.
- **GraphQL in proxy**: the existing `app/api/proxy/route.ts` handles HTTP transparently — no changes needed.
