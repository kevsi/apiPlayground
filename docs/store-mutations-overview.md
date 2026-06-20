# Store Mutations — `reqy-web/hooks/store/`

## Purpose
Domain-specific mutation factories for the `useRequestStore`. Each file exports a factory function that takes a `CommitFn` and returns mutation functions that operate on the global store via the `commit` primitive.

## Architecture
All mutations follow the same pattern:

```typescript
// Each factory receives the commit function as a dependency
export function createXxxMutations(commit: CommitFn) {
  return {
    addXxx: (...) => commit(prev => ({ ...prev, xxx: [...] })),
    updateXxx: (...) => commit(prev => ({ ...prev, ... })),
    deleteXxx: (...) => commit(prev => ({ ...prev, ... })),
  }
}
```

This ensures:
- Single mutation primitive (`commit(updater)`)
- Immutable state updates
- Automatic persistence (commit triggers save)
- Cross-tab sync (commit broadcasts via middleware)

## Files

| File | Mutations |
|------|-----------|
| `collections.ts` | `addCollection`, `renameCollection`, `deleteCollection`, `reorderCollections`, `addRequestToCollection`, `removeRequestFromCollection`, `updateRequestInCollection`, `reorderRequestsInCollection` |
| `environments.ts` | `setEnvironments`, `addEnvironment`, `updateEnvironment`, `deleteEnvironment`, `setActiveEnvironmentId`, `addVariable`, `updateVariable`, `deleteVariable`, `toggleVariable` |
| `folders.ts` | `addFolder`, `renameFolder`, `deleteFolder`, `moveRequestToFolder`, `moveFolder`, `reorderRequestsInCollection`, `reorderFolders` |
| `history.ts` | `addHistoryEntry`, `clearHistory`, `deleteHistoryEntry` |
| `notifications.ts` | `addNotification`, `dismissNotification`, `clearNotifications`, `setNotificationPreferences` |
| `projects.ts` | `addProject`, `updateProject`, `deleteProject`, `selectProject` |
| `variable-mappings.ts` | `setVariableMappings`, `addVariableMapping`, `updateVariableMapping`, `deleteVariableMapping` |
| `workspaces.ts` | `addWorkspace`, `updateWorkspace`, `deleteWorkspace`, `setActiveWorkspaceId` |

## Types

| File | Purpose |
|------|---------|
| `types.ts` | `CommitFn` type definition and `WORKSPACE_PERSONAL_ID` constant. |

## Dependencies
- `@/hooks/request-types` — `RequestStore` and related types
- `@/hooks/store/types` — `CommitFn` type
