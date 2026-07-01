# 4 Dedicated Tools Pages — Design

## Context
Many features in Reqly are scattered across modals, tabs, and panels — hard to discover for new users. This creates dedicated pages for the most important "tools" with prominent sidebar links.

## Approved scope (user choice)

| Page | Route | What it does |
|---|---|---|
| **Collection Runner** | `/runner` | Run collections with assertions + scripts + JUnit export, view run history |
| **GraphQL Explorer** | `/graphql` | Schema tree-view, saved queries, query editor + response in large format |
| **Workspaces** | `/workspaces` | Manage workspaces, members, invitations, activity feed, sync status |
| **SDK Generator** | `/sdks` | List exportable collections, pick language, preview, download SDKs |

## Sidebar structure (approved: "Add at top in Tools section")

```
┌─────────────────────────┐
│ TOOLS                    │
│  ▶ Runner       [Play]   │  ← NEW
│  ◊ GraphQL      [Code]   │  ← NEW
│  👥 Workspaces   [Users]  │  ← NEW
│  📦 SDKs         [Pkg]    │  ← NEW
├─────────────────────────┤
│ MAIN                     │
│  🏠 Home                 │
│  📁 Collections          │
│  🕐 History              │
│  🎭 Mocks                │
│  📊 Dashboard            │
│  🤖 AI Insights          │
├─────────────────────────┤
│ WORKSPACE                │
│  [+ New workspace]       │
│  [Join workspace]        │
│  [Invite]                │
│  📁 My Workspace         │
├─────────────────────────┤
│ SYSTEM                   │
│  📂 My Projects          │
│  ⚙️ Settings             │
│  📖 Documentation        │
└─────────────────────────┘
```

## Per-page design

### 1. `/runner` — Collection Runner

```
┌─────────────────────────────────────────────────────────┐
│  Collection Runner                          [+ New Run] │
├─────────────────────────────────────────────────────────┤
│  COLLECTIONS                                               │
│  📁 Pet Store API          [Run]   Last run: 2h ago ✓    │
│  📁 Auth Tests             [Run]   Last run: 1d ago ✗    │
│  📁 Smoke Tests            [Run]   Never run              │
│  📁 + Add collection                                        │
├─────────────────────────────────────────────────────────┤
│  RECENT RUNS (last 10)                                    │
│  ✓ Pet Store API       3/3 pass    1.2s    2h ago    [📋]│
│  ✗ Auth Tests          1/2 fail    0.8s    1d ago    [📋]│
│  ✓ Smoke Tests         5/5 pass    2.1s    3d ago    [📋]│
├─────────────────────────────────────────────────────────┤
│  ACTIVE RUN                                                │
│  Running "Pet Store API"... [████░░░░░░] 40% (2/5)      │
│  ✓ GET /pets                                              │
│  ✓ GET /pets/1                                            │
│  ⟳ POST /pets (running...)                               │
└─────────────────────────────────────────────────────────┘
```

**Components** : `CollectionListSection`, `RunHistorySection`, `ActiveRunProgress`, `RunDetailsDialog`
**Uses** : `lib/test-runner/runner.ts`, `test-runner-panel.tsx`
**Storage** : Run history in `useRequestStore` (new `runHistory` slice)

---

### 2. `/graphql` — GraphQL Explorer

```
┌─────────────────────────────────────────────────────────┐
│  GraphQL Explorer                                         │
├──────────────────┬──────────────────────────────────────┤
│  SCHEMA          │  ENDPOINT                            │
│  ▸ Query         │  [https://api.example.com/graphql]  │
│    • countries   │  [Introspect] [Saved queries ▾]      │
│    • country     │                                       │
│  ▸ Mutation      │  ┌──────────────────────────────┐  │
│  ▸ Country       │  │ query { countries { code } }  │  │
│    • code        │  │                               │  │
│    • name        │  └──────────────────────────────┘  │
│    • capital     │                                       │
│                  │  Variables:                          │
│                  │  ┌──────────────────────────────┐  │
│                  │  │ {}                            │  │
│                  │  └──────────────────────────────┘  │
│                  │                                       │
│                  │  [▶ Send]   [Save]   [Format]         │
│                  │                                       │
│                  │  RESPONSE                            │
│                  │  ┌──────────────────────────────┐  │
│                  │  │ { "data": { "countries": ... }} │  │
│                  │  └──────────────────────────────┘  │
└──────────────────┴──────────────────────────────────────┘
```

**Components** : `SchemaTreeView`, `QueryEditor`, `ResponseViewer`, `SavedQueriesDropdown`
**Uses** : `lib/graphql/execute.ts`, `lib/graphql/introspect.ts`
**Storage** : Saved queries in `useRequestStore` (new `savedGraphqlQueries` slice)

---

### 3. `/workspaces` — Workspace Management

```
┌─────────────────────────────────────────────────────────┐
│  Workspaces                          [+ Create] [Join]   │
├─────────────────────────────────────────────────────────┤
│  MY WORKSPACES                                            │
│  📁 Team Alpha                  [Active] [Open] [⚙️]     │
│     3 members · 12 collections · Synced 2m ago          │
│     Role: owner                                           │
│  📁 Personal                    [Active] [Open] [⚙️]     │
│     1 member · 5 collections · Local only                │
│     Role: owner                                           │
│  📁 Staging Mirror              [Open] [⚙️]                │
│     2 members · 8 collections · Synced 1h ago            │
│     Role: editor                                          │
├─────────────────────────────────────────────────────────┤
│  PENDING INVITATIONS (2)                                  │
│  📩 From alice@team.io — "Team Beta"       [Accept] [✗]│
│  📩 From bob@team.io   — "Sandbox"         [Accept] [✗]│
├─────────────────────────────────────────────────────────┤
│  RECENT ACTIVITY                                          │
│  • Alice edited "POST /users"      2m ago                 │
│  • Bob joined "Team Alpha"          1h ago                 │
│  • Sync conflict resolved          3h ago                 │
└─────────────────────────────────────────────────────────┘
```

**Components** : `WorkspaceListSection`, `PendingInvitationsSection`, `ActivityFeedSection`, `WorkspaceSettingsDialog`
**Uses** : Existing `WorkspaceCreateDialog`, `WorkspaceJoinDialog`, `WorkspaceInviteDialog` (extract their logic to be reusable here)
**API** : `GET /api/workspaces`, `GET /api/memberships` (need to add activity feed endpoint)

---

### 4. `/sdks` — SDK Generator

```
┌─────────────────────────────────────────────────────────┐
│  SDK Generator                                            │
├─────────────────────────────────────────────────────────┤
│  SOURCE COLLECTION                                        │
│  [📁 Pet Store API          ▾]                          │
│                                                           │
│  LANGUAGE                                                 │
│  [TypeScript ●]  [Python ○]  [Go ○]                      │
│                                                           │
│  [Generate SDK]   [Download .ts]                         │
├─────────────────────────────────────────────────────────┤
│  PREVIEW                                                   │
│  ┌──────────────────────────────┬──────────────────┐   │
│  │ // types.ts                     │ // client.ts      │   │
│  │ export interface User {         │ async function...  │   │
│  │   id: number;                   │                    │   │
│  │   email: string;                │                    │   │
│  │   ...                           │                    │   │
│  └──────────────────────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Components** : `SourceCollectionPicker`, `LanguagePicker`, `SdkPreview`, `DownloadButton`
**Uses** : `lib/sdk-codegen/typescript-generator.ts` (existing)
**Storage** : Generated SDKs cached in memory (re-generate on demand)

---

## File map

### New files

| File | Role |
|---|---|
| `reqy-web/app/runner/page.tsx` | Collection Runner page |
| `reqy-web/app/graphql/page.tsx` | GraphQL Explorer page |
| `reqy-web/app/workspaces/page.tsx` | Workspaces page |
| `reqy-web/app/sdks/page.tsx` | SDK Generator page |
| `reqy-web/components/runner/collection-list-section.tsx` | Collection list with Run buttons |
| `reqy-web/components/runner/run-history-section.tsx` | Recent runs list |
| `reqy-web/components/runner/active-run-progress.tsx` | Active run progress bar |
| `reqy-web/components/graphql/schema-tree-view.tsx` | Collapsible schema tree |
| `reqy-web/components/graphql/query-editor.tsx` | Large query editor |
| `reqy-web/components/graphql/response-viewer.tsx` | Response display |
| `reqy-web/components/workspaces/workspace-list-section.tsx` | Workspace cards |
| `reqy-web/components/workspaces/pending-invitations-section.tsx` | Pending invites |
| `reqy-web/components/workspaces/activity-feed-section.tsx` | Recent activity |
| `reqy-web/components/sdks/source-collection-picker.tsx` | Collection dropdown |
| `reqy-web/components/sdks/language-picker.tsx` | Language radio |
| `reqy-web/components/sdks/sdk-preview.tsx` | Code preview tabs |
| `reqy-web/lib/sidebar/tools-section.tsx` | New sidebar section with 4 entries |

### Modified files

| File | Change |
|---|---|
| `reqy-web/components/api-sidebar.tsx` | Add `<ToolsSection />` at top with 4 nav links |

---

## Plan execution (2 chunks)

### Chunk 1: Sidebar + 4 page routes (1 commit)
- Add `/runner`, `/graphql`, `/workspaces`, `/sdks` route pages (minimal stubs)
- Add `<ToolsSection />` to sidebar
- Each page renders a "Coming soon" placeholder with a description

### Chunk 2: Full implementations (1 commit per page = 4 commits)
- `/runner` page with collection list + run history + active run progress
- `/graphql` page with schema tree + query editor + response viewer + saved queries
- `/workspaces` page with workspace list + pending invites + activity feed
- `/sdks` page with collection picker + language picker + preview + download

---

## Testing strategy

- Each page gets a smoke E2E test (just navigation)
- Runner page gets deeper tests (run + verify results)
- TS + vitest must stay clean

## Non-goals

- Mobile-optimized layouts (desktop-first)
- Per-user page customization
- Saving page state across navigation
- Permission management UI (deferred to v2)
- Billing/quotas (not in scope)

## Risks

- **Sidebar becomes too tall** if 4 entries are added → mitigate with collapsible sections
- **Each page adds navigation overhead** → mitigate with breadcrumbs + back button
- **Runner page run history grows unbounded** → mitigate with last 10 + total count
