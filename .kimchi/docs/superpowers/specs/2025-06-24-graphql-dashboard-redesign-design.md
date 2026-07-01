# Design Spec — GraphQL Dashboard Redesign

## Goal

Refactor the `/graphql` page so it matches the visual structure and UX of the main API endpoint page (`/`). Integrate all essential, necessary, and bonus GraphQL features while keeping REST functionality isolated and safe.

## Decision

Use **Approach C**: a dedicated `GraphqlTabsManager` that mirrors `RequestTabsManager` visually, but keeps GraphQL logic separate. Reuse common layout components (`ApiSidebar`, `ApiHeader`, `ResizablePanelGroup`, `CollectionsModal`, `RequestSaveDialog`). Integrate GraphQL requests into existing collections by extending `RequestItem` with a `GRAPHQL` type.

## Scope

### In scope
- `/graphql` page rebuilt with resizable request/response panes.
- Multi-tab GraphQL workspace with save/close/duplicate.
- Native GraphQL editor (`cm6-graphql`) with schema-based autocompletion and validation.
- Visual query builder recursive tree from introspected schema.
- Variables and headers panels with JSON validation.
- Improved response viewer with copy, error highlighting, subscription stream.
- Schema browser with search and inline docs.
- Introspection + localStorage cache.
- Prettify, run/stop, operation auto-detection.
- Save GraphQL requests into existing collections (`type: "GRAPHQL"`).
- Export to cURL / JS fetch / TypeScript types.
- WebSocket subscriptions (repackage existing `subscribe.ts`).
- AI query assistant hooking into `lib/ai-engine.ts`.
- Schema diff between cached introspections.

### Out of scope
- Merging GraphQL tabs into the main REST tab bar (`RequestTabsManager`).
- Backend schema registry or federation runtime.
- Persisted queries security router.
- Team cloud collaboration features beyond existing Supabase sync.

## Architecture

```
app/graphql/page.tsx
└── GraphqlTabsManager
    ├── ApiHeader (reused)
    ├── GraphqlTabBar (new)
    ├── GraphqlActiveToolbar (new)
    ├── ResizablePanelGroup horizontal
    │   ├── GraphqlRequestPanel
    │   │   ├── GraphqlAddressBar
    │   │   ├── GraphqlToolbar
    │   │   ├── GraphqlQueryEditor (cm6-graphql)
    │   │   ├── GraphqlQueryBuilder (optional toggle)
    │   │   ├── VariablesPanel
    │   │   └── HeadersPanel
    │   └── GraphqlResponsePanel
    │       ├── ResponseViewer
    │       ├── SubscriptionViewer
    │       ├── GraphqlCodeGenerator
    │       └── SchemaDiffViewer
    └── CollectionsModal (reused, extended)
```

## State Model

```ts
interface GraphqlTab {
  id: string
  name: string
  endpoint: string
  query: string
  variables: string   // JSON string
  headers: string     // JSON string
  operationName?: string
  schema?: IntrospectionQuery
  schemaLoading?: boolean
  response?: GraphQLExecuteResult
  subscriptionMessages?: SubscriptionMessageView[]
  saved?: boolean
  dirty?: boolean
}
```

Managed by `useGraphqlTabsState`:
- `addTab`, `closeTab`, `updateTab`, `duplicateTab`
- `saveTab` → persists into `useRequestStore` collections
- `executeQuery`, `executeSubscription`, `stopSubscription`
- `introspectEndpoint`, `prettifyQuery`, `generateCode`

## Components

| Component | Responsibility |
|---|---|
| `GraphqlTabsManager` | Top-level orchestration, owns state hook |
| `GraphqlTabBar` | Tabs UI: add, close, switch, unsaved indicator |
| `GraphqlActiveToolbar` | Name input, save, export, run/stop, AI assistant |
| `GraphqlRequestPanel` | Left resizable pane container |
| `GraphqlResponsePanel` | Right resizable pane container |
| `GraphqlQueryEditor` | CodeMirror with `cm6-graphql`, autocompletion, validation |
| `GraphqlQueryBuilder` | Recursive visual tree to select fields/args |
| `GraphqlSchemaBrowser` | Drawer/pane with searchable schema tree |
| `GraphqlCodeGenerator` | Generates TS/fetch/cURL snippets |
| `GraphqlSchemaDiff` | Compares two introspections |

## Integration with Collections

Extend `RequestItem` union in `lib/types.ts`:

```ts
type RequestItem = RestRequestItem | GraphqlRequestItem

interface GraphqlRequestItem {
  id: string
  type: "GRAPHQL"
  name: string
  endpoint: string
  query: string
  variables: string
  headers: string
  createdAt: string
  updatedAt: string
}
```

- `collections-panel.tsx` already has `GRAPHQL` style tokens.
- `RequestSaveDialog` is reused; save path detects `type` and writes GraphQL fields.
- Loading a saved GraphQL request opens a new tab in `GraphqlTabsManager`.

## Data Flow

1. User opens `/graphql`.
2. `GraphqlTabsManager` initializes with one default tab.
3. User enters endpoint and clicks Introspect.
4. `introspectSchema` fetches `__schema`, stores in tab state + localStorage cache.
5. Editor receives schema via props/context and enables autocompletion.
6. User runs query; `executeGraphQL` POSTs and writes response to tab state.
7. Save writes the tab as a `GraphqlRequestItem` into the active collection.
8. CollectionsModal lists it and can reopen it.

## Testing Strategy

- Unit tests for `query-builder.ts`, `codegen.ts`, `schema-diff.ts`.
- Hook tests for `useGraphqlTabsState` (add/close/save/run).
- E2E Playwright: open `/graphql`, introspect mock endpoint, run query, save to collection.
- Smoke test: query builder generates valid query from schema.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Breaking REST behavior | Keep `RequestTabsManager` untouched; no shared mutable state |
| Large schema crashes UI | Virtualize schema browser tree, limit introspection cache size |
| cm6-graphql version mismatch | Pin version compatible with installed `graphql` v17 |
| Type errors from extended RequestItem | Update all switch statements on `type` |

## Files

### New
- `reqy-web/components/graphql/graphql-tabs-manager.tsx`
- `reqy-web/components/graphql/graphql-tab-bar.tsx`
- `reqy-web/components/graphql/graphql-active-toolbar.tsx`
- `reqy-web/components/graphql/graphql-request-panel.tsx`
- `reqy-web/components/graphql/graphql-response-panel.tsx`
- `reqy-web/components/graphql/graphql-query-editor.tsx`
- `reqy-web/components/graphql/graphql-query-builder.tsx`
- `reqy-web/components/graphql/graphql-schema-browser.tsx`
- `reqy-web/components/graphql/graphql-code-generator.tsx`
- `reqy-web/components/graphql/graphql-schema-diff.tsx`
- `reqy-web/hooks/use-graphql-tabs-state.ts`
- `reqy-web/hooks/use-graphql-execution.ts`
- `reqy-web/lib/graphql/query-builder.ts`
- `reqy-web/lib/graphql/codegen.ts`
- `reqy-web/lib/graphql/schema-diff.ts`
- `reqy-web/lib/graphql/__tests__/query-builder.test.ts`
- `reqy-web/lib/graphql/__tests__/codegen.test.ts`

### Modified
- `reqy-web/app/graphql/page.tsx`
- `reqy-web/hooks/use-request-store.ts`
- `reqy-web/lib/types.ts`
- `reqy-web/components/collections-panel.tsx`
- `reqy-web/components/request-save-dialog.tsx`

## Success Criteria

1. `/graphql` displays resizable request/response panes matching the API endpoint layout.
2. User can create, close, and save multiple GraphQL tabs.
3. Introspection loads schema and enables editor autocompletion.
4. Query builder can generate a valid query from the schema.
5. GraphQL requests can be saved into and loaded from existing collections.
6. Subscriptions run via WebSocket and display messages.
7. Code generation produces valid cURL / fetch / TypeScript snippets.
8. All new unit tests pass.
9. E2E smoke test passes.
10. REST page behavior remains unchanged.
