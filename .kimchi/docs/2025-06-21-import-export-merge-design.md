# Import/Export Merge Conflicts — Design

## Context
Reqly currently has 3 import paths (Postman, OpenAPI, JSON) and 1 export path. When importing collections that already exist locally, the existing code likely **overwrites** without warning or simply **appends duplicates** depending on the implementation. The README explicitly lists "Pas de résolution de conflits lors du merge d'import/export" as a 🟡 Moyenne missing feature.

## Goal
When importing, detect entities that already exist locally (by ID) and apply **Last-Write-Wins** (LWW) resolution consistently. Report what happened to the user.

## Scope (MVP)

| Element | Scope |
|---|---|
| **Entities covered** | Collections + Environments (folders/requests are nested inside collections, handled implicitly) |
| **Conflict detection** | By entity `id` field |
| **Resolution** | Last-Write-Wins by `updatedAt` timestamp (newer wins) |
| **UI** | Import summary banner: `{added: N, updated: N, skipped: N, conflicts: N}` |
| **Import paths** | All 3 (Postman, OpenAPI, JSON) — they all flow through the same store mutations |
| **NOT in scope** | Field-level diff, manual merge UI, sync server integration (already handled separately) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Import flow (existing)                                   │
│   importPostman() / importOpenAPI() / importJSON()       │
│       └─→ parseToEntities()                              │
│               └─→ addCollection() / addEnvironment()    │
└────────────────┬────────────────────────────────────────┘
                 │ (modified)
                 ▼
┌─────────────────────────────────────────────────────────┐
│ NEW: Merge layer                                         │
│   mergeImport(localEntities, importedEntities)          │
│       ├─ For each imported entity:                       │
│       │     ├─ if !local → ADD                          │
│       │     ├─ if local && imported.updatedAt > local:  │
│       │     │     → UPDATE (LWW)                        │
│       │     └─ if local && imported.updatedAt <= local: │
│       │           → SKIP (local wins)                   │
│       └─ Return {added, updated, skipped, conflicts}    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ UI: Import summary banner                                │
│   Shows counts + "Dismiss" button                        │
│   Lives in import-export-modal.tsx                        │
└─────────────────────────────────────────────────────────┘
```

## Data model

```ts
// lib/import-merge/types.ts
export interface ImportSummary {
  added: number
  updated: number
  skipped: number
  conflicts: Array<{
    entityType: "collection" | "environment"
    entityId: string
    localUpdatedAt: number
    importedUpdatedAt: number
    resolution: "added" | "updated" | "skipped"
  }>
}

export interface MergeInput {
  local: Array<{ id: string; updatedAt: number; [k: string]: unknown }>
  imported: Array<{ id: string; updatedAt: number; [k: string]: unknown }>
}
```

## LWW resolution logic

```ts
function mergeImport({ local, imported }: MergeInput): {
  toUpsert: typeof imported
  summary: ImportSummary
} {
  const localMap = new Map(local.map((e) => [e.id, e]))
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, conflicts: [] }
  const toUpsert = []

  for (const imp of imported) {
    const loc = localMap.get(imp.id)
    if (!loc) {
      // New entity — add
      toUpsert.push(imp)
      summary.added++
      summary.conflicts.push({ entityType: "collection", entityId: imp.id, localUpdatedAt: 0, importedUpdatedAt: imp.updatedAt, resolution: "added" })
    } else if (imp.updatedAt > loc.updatedAt) {
      // Imported newer — overwrite (LWW)
      toUpsert.push(imp)
      summary.updated++
      summary.conflicts.push({ entityType: "collection", entityId: imp.id, localUpdatedAt: loc.updatedAt, importedUpdatedAt: imp.updatedAt, resolution: "updated" })
    } else {
      // Local newer or equal — skip
      summary.skipped++
      summary.conflicts.push({ entityType: "collection", entityId: imp.id, localUpdatedAt: loc.updatedAt, importedUpdatedAt: imp.updatedAt, resolution: "skipped" })
    }
  }

  return { toUpsert, summary }
}
```

## File map

| File | Action | Role |
|---|---|---|
| `lib/import-merge/merge.ts` | **Create** | Pure merge function |
| `lib/import-merge/types.ts` | **Create** | ImportSummary, MergeInput interfaces |
| `lib/import-merge/__tests__/merge.test.ts` | **Create** | ~10 unit tests |
| `lib/openapi-import.ts` | **Modify** | Use mergeImport for collections + environments |
| `components/import-export-modal.tsx` | **Modify** | Show summary banner |
| `components/postman-import-modal.tsx` (if exists) | **Modify** | Use merge |
| `components/import-openapi-modal.tsx` | **Modify** | Use merge |

## Error handling

- **Missing updatedAt**: entities without `updatedAt` default to `Date.now()` (treated as newest) — import wins
- **Empty import**: return empty summary, no banner shown
- **Parse errors**: existing error handling preserved (summary not shown)

## Testing strategy

Unit tests covering:
- All-new entities → all added
- All-same entities → all skipped
- Mix of new + same → correct counts
- Imported newer → updated
- Local newer → skipped
- Equal timestamps → skipped (local wins ties)
- Missing updatedAt on imported → treated as newest
- Missing updatedAt on local → treated as oldest (imported wins)

## Non-goals

- Field-level diff / 3-way merge UI
- Undo / rollback
- Merge audit log
- Cloud sync integration (separate feature)

## Risks

- Existing import code may have its own merge logic that needs removal
- `updatedAt` field may not be set on imported entities from Postman (needs fallback to `Date.now()`)
- Collections may contain nested folders/requests — these are handled by the entity-level merge, no special logic needed
