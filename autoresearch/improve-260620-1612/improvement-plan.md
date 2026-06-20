# Improvement Plan

## Overview
Based on 15 research iterations across 6 categories, this plan prioritizes features that directly serve API developers using Reqly desktop (ICP). The research confirmed the reason session's architecture decisions (createStoreFactory + composable middleware) and identified three P0 features that address ICP needs unmet by competitors.

---

## P0 — Core ICP Need (must ship)

### 1. F3: Tauri native fs persistence integration
**PRD ID:** P0-001

**Problem:** IndexedDB has quota failures (~5MB in some contexts), silent write errors, and no native Tauri integration. Developers lose unsaved mock configs and request collections without warning.

**Solution:** Replace IndexedDB as the primary persistence backend with Tauri's native filesystem API. Use `@tauri-apps/plugin-fs` for atomic writes to `appDataDir`. Keep IndexedDB as a fallback for web-only mode.

**Acceptance Criteria:**
- Store state is written to `appDataDir` JSON files atomically
- Read/write latency < 10ms for typical store sizes (< 1MB)
- IndexedDB fallback activates automatically when Tauri API is unavailable (web mode)
- No silent write failures — all errors propagate to SyncState
- Migration path: existing IndexedDB data migrates to filesystem on first launch

**Dependencies:**
- `@tauri-apps/plugin-fs` (check version compat with current Tauri)
- createStoreFactory `persist` middleware must accept backend adapter

**Research Signal:** iter 1 (quota failures), iter 6 (Tauri fs as competitive advantage), iter 12 (mock config persistence)

---

### 2. F2: withCrossTabSync middleware for mock state
**PRD ID:** P0-002

**Problem:** No competitor combines local mock servers with real-time cross-tab state sync. Developers managing mock configs across multiple tabs face state divergence — they manually refresh or duplicate config.

**Solution:** Implement `withCrossTabSync` middleware for the store factory (already designed in reason session). Uses BroadcastChannel as primary transport, `storage` event as fallback. LWW (last-writer-wins) is sufficient for single-user scenario.

**Acceptance Criteria:**
- State changes in tab A propagate to tab B within < 100ms
- Fallback to `storage` event when BroadcastChannel is unavailable
- LWW conflict resolution — latest write wins (sufficient for single-user)
- Sync is opt-in per store instance (middleware composability)
- Does not trigger infinite update loops (guard: skip re-broadcast if source is BroadcastChannel)

**Dependencies:**
- createStoreFactory middleware stack must support `withCrossTabSync` as composable middleware
- Tauri backend must not interfere with BroadcastChannel (Tauri v2 allows it in webview)

**Research Signal:** iter 7 (unique moat vs Postman/Mockoon), iter 12 (unmet ICP need), iter 14 (BroadcastChannel + storage event validated)

---

### 3. F1: SyncState observable UI component
**PRD ID:** P0-003

**Problem:** Persistence failures are invisible to the user. When IndexedDB quota fills, write-to-disk fails, or sync errors occur, the user only discovers when data is lost on next launch.

**Solution:** Expose a `SyncState` enum (Synced | Syncing | Error | Offline) from the store factory's persist middleware. Surface it via a small UI indicator (footer bar or toolbar icon) with tooltip detail. On Error state, show a warning banner with retry action.

**Acceptance Criteria:**
- SyncState is accessible via `useStore(s => s.syncState)` selector
- UI indicator shows color-coded status: green (Synced), yellow (Syncing), red (Error), gray (Offline)
- Error state triggers persistent warning banner with "Retry" button
- Banner auto-dismisses when state returns to Synced
- SyncState updates within 50ms of persistence state change

**Dependencies:**
- createStoreFactory persist middleware must emit SyncState transitions
- Tauri fs backend must report success/failure synchronously to update SyncState
- Bundled with: auto-retry with exponential backoff (already implemented in saveToStorageAsync)

**Research Signal:** iter 1, 4, 9 (silent data loss is #1 trust killer), iter 14 (visible sync is table stakes)

---

## P1 — High Value (ship next)

### 4. F5: Undo for store mutations
**PRD ID:** P1-001

**Problem:** Developers accidentally delete requests, collections, or mock configs with no recovery path. Undo is a standard UX expectation in desktop applications.

**Solution:** Add an undo stack to the store factory. Each mutation pushes the previous state snapshot onto a bounded stack (max 50 entries). Expose `undo()` action. Keyboard shortcut: Ctrl+Z.

**Acceptance Criteria:**
- Undo restores previous state for any store mutation
- Stack depth of 50, LRU eviction
- Ctrl+Z fires `undo()` via registered keyboard handler
- Undo stack is cleared on explicit save only (not on auto-persist)
- SyncState shows "Undo available" indicator when stack is non-empty

**Dependencies:**
- createStoreFactory core must support undo middleware
- Middleware stack order: undo must be innermost (wraps state reducer) to snapshot before middleware transforms

**Research Signal:** iter 10 (recovery strategies build trust), iter 9 (Git-based storage is gold standard, undo is lighter alternative)

---

## P2 — Nice to Have (future roadmap)

### 5. F6: Git-based history export
**PRD ID:** P2-001

**Problem:** Developers want version control for API collections and mock configs. Git is the standard tool for this, but Reqly stores are opaque JSON files.

**Solution:** Add "Export to Git" feature that writes store state as version-controlled JSON files in a user-specified directory. Not real-time — manual export on milestone events.

**Acceptance Criteria:**
- Export writes all request collections and mock configs as individual JSON files
- User specifies target git repository path
- Generates organized directory structure (collections/, mocks/)
- Does not auto-commit — leaves staging for user

**Research Signal:** iter 10 (Bruno's Git-based model is gold standard), iter 11 (Git-based local-first is winning)

---

## Implementation Sequence

```
Phase 1 (Foundation):   F3 (Tauri fs) + F1 (SyncState) — both depend on persist middleware
Phase 2 (Differentiator): F2 (withCrossTabSync) — builds on persist middleware
Phase 3 (UX Polish):    F5 (Undo) — builds on store factory core
Phase 4 (Future):       F6 (Git export)
```

**Verification:** After each phase, run `npm run lint` and `npm run typecheck`. Test persistence with actual Tauri build (not just web dev server). Verify BroadcastChannel fallback path in incognito mode.
