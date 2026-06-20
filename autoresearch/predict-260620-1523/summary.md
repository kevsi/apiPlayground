# Predict Analysis Summary — Reqly

**Date:** 2026-06-20
**Scope:** All source code (components/, hooks/, lib/, app/)
**Depth:** Standard (5 personas, 2 rounds)
**Personas:** Architect, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate
**Total findings (raw):** 59
**Total findings (after dedup):** 23

---

## Top 10 Findings (ranked by severity × confidence × agreement)

### 1. Python subprocess blocks event loop + enables code injection
**Severity:** Critical | **Confidence:** 96% | **Agreement:** Security + Reliability + Devil's Advocate
**File:** `lib/detect-shared.ts:2424`
**Issue:** `spawnSync("python", ["-c", ...])` blocks the Node.js event loop with no timeout. The 300-line Python script is passed as an inline string argument (unescaped, untyped), and the subprocess receives untrusted file content from GitHub imports via stdin. A malicious repository could exploit `ast.parse` edge cases.
**Recommendation:** Replace with async `spawn` + 10s timeout. Move Python script to `scripts/detect-python-routes.py` with proper error propagation. Sandbox the subprocess.

### 2. Flat store architecture — full re-render on every mutation
**Severity:** Critical | **Confidence:** 100% | **Agreement:** Architect + Performance + Devil's Advocate
**File:** `hooks/use-request-store.ts:307-470`
**Issue:** The hook returns the entire `RequestStore` (~40 mutation functions + all state) as a flat spread. Any `commit()` triggers `notifyListeners()` for ALL subscribers. No selectors, no granular subscriptions. `saveToStorageAsync` fires unconditionally without debounce.
**Recommendation:** Use `useSyncExternalStoreWithSelector` or Zustand-style selectors. Debounce persistence (500ms). Batch rapid mutations.

### 3. detect-shared.ts — 2712-line monolith
**Severity:** Critical | **Confidence:** 100% | **Agreement:** Architect + Security + Devil's Advocate
**File:** `lib/detect-shared.ts:1`
**Issue:** Contains 30+ framework detectors, a Python AST subprocess call, and TypeScript compiler imports in a single file. No tree-shaking. Python script passed as CLI string argument. Mutable shared state (`routes` array, `seen` Set) breaks detector isolation.
**Recommendation:** Extract each detector into `lib/detectors/<framework>.ts`. Move Python script to a standalone file. Use async subprocess.

### 4. In-memory rate limiting + mock config lost on restart
**Severity:** High | **Confidence:** 96% | **Agreement:** Performance + Reliability + Devil's Advocate
**Files:** `app/api/proxy/route.ts:23`, `app/api/mock/config/route.ts:26-31`, `lib/mock-resolver.ts:40`
**Issue:** Rate limiting (`rateLimitMap`) and mock configuration (`mockRoutes`, `mockServers`) are plain in-memory maps/module variables. Lost on server restart, HMR, or serverless cold starts. Rate limiting is non-functional in serverless deployments.
**Recommendation:** Persist mock config to storage. Use external KV store (Vercel KV, Redis) for rate limiting. Document serverless limitations.

### 5. BroadcastChannel crashes in incognito + full reload on every sync
**Severity:** High | **Confidence:** 95% | **Agreement:** Architect + Performance + Reliability + Devil's Advocate
**File:** `hooks/use-request-store.ts:253-263`
**Issue:** `new BroadcastChannel(...)` throws in Firefox incognito and some mobile browsers — not caught. On receiving "update", the entire store is re-loaded from IndexedDB (full JSON.parse + deep copy). No `window.addEventListener("storage")` fallback exists. Race condition on concurrent writes between tabs can cause data loss.
**Recommendation:** Wrap in try/catch, add `storage` event fallback. Implement differential sync (broadcast mutation payload, not just "update" trigger). Add generation counter for conflict detection.

### 6. No test coverage for core logic
**Severity:** Critical | **Confidence:** 100% | **Agreement:** Architect + Devil's Advocate
**Files:** Only 6 test files under `lib/__tests__/`
**Issue:** Zero test coverage for: 8 store factories (~40 mutation functions), 20 hook files, 44 component files, 10 API route handlers, mock config validation schemas, storage adapter with retry/fallback logic.
**Recommendation:** Add unit tests for each store factory (mock `CommitFn`), API routes (`vi.mock` Supabase), hooks (`renderHook`), and property-based tests for Zod schemas. Prioritize store factories — they have clear input/output contracts.

### 7. saveToStorageAsync fire-and-forget — data silently lost on write failure
**Severity:** High | **Confidence:** 100% | **Agreement:** Performance + Reliability
**File:** `hooks/use-request-store.ts:330-338`
**Issue:** The `commit` function updates `globalStore` synchronously then calls `saveToStorageAsync` without `await`. If the IndexedDB/Tauri FS write fails, the in-memory cache is already updated — UI shows saved state but data is lost on reload. The catch block only logs a warning.
**Recommendation:** Make `commit` async. Add retry queue with exponential backoff. Implement optimistic UI with rollback on persistence failure.

### 8. MockHeaderChip — dead component with real side-effect cost
**Severity:** High | **Confidence:** 100% | **Agreement:** Performance + Devil's Advocate
**File:** `components/mock-header-chip.tsx:49-52`
**Issue:** Component unconditionally returns `null` after executing: 3 imports, 2 `useEffect` calls, 1 `useState`, an async `fetch("/api/mock/config")`, and a `window` event listener registration. It never renders anything. The side effects trigger unnecessary re-renders in parent `ApiHeader` via `useRequestStore` and `useMockStore` subscriptions.
**Recommendation:** Convert to a `useMockStatus()` hook or remove entirely. If future UI is planned, add a TODO comment and remove effectful behavior until needed.

### 9. Encrypted API keys — passphrase stored alongside ciphertext
**Severity:** High | **Confidence:** 100% | **Agreement:** Security + Devil's Advocate
**File:** `lib/secure-storage.ts:42-48`
**Issue:** AES-256-GCM passphrase is stored in localStorage under key `reqly-crypto-passphrase` (plaintext). Salt under `reqly-crypto-salt` (base64). Any XSS or browser extension with storage access can trivially read both and decrypt all API keys. Module is named `secure-storage` which is misleading.
**Recommendation:** Either derive passphrase from user-provided master password (per-session), or rename module to `obfuscated-storage` and document it as a deterrent, not a security boundary.

### 10. useRequestTabsState — 23 useState calls in one hook
**Severity:** High | **Confidence:** 95% | **Agreement:** Performance + Devil's Advocate
**File:** `hooks/use-request-tabs-state.ts:24-50`
**Issue:** Manages 23 independent state variables returning 52 properties. Two dead `useState` variables (`setIsRequestCollapsed`, `setIsResponseCollapsed`) produce state setters that are stored in closure but whose values are never read. Any state change triggers re-render of all consumers of the hook's return.
**Recommendation:** Split into domain-specific hooks: `useTabNavigation`, `useTabSaveDialog`, `useCollectionBatchRun`, `usePanelLayout`. Child components should own their own UI state.

---

## Cross-Cutting Themes

| Theme | Findings | Severity Spread |
|-------|----------|----------------|
| **State management fragility** | #2, #5, #7, #13 | Critical → Medium |
| **detect-shared.ts monolith** | #3, #1 | Critical |
| **Missing tests** | #6 | Critical |
| **In-memory state loss** | #4 | High |
| **Dead/obsolete code** | #8, #12 | High → Medium |
| **Security theater (encryption)** | #9 | High |
| **Component/hook bloat** | #10, #11 | High → Medium |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Python subprocess exploit | Server compromise | Low (requires malicious GitHub repo) | Move to async, sandbox, add timeout |
| Data loss on storage write failure | User data loss | Medium (IndexedDB quota errors) | Make commit async, add retry queue |
| Rate limiting bypass in serverless | Abuse | High (Vercel deployment) | Document limitation, add external KV store |
| Re-render performance degradation | UI jank with 1000+ items | Medium | Implement selectors |
| Cross-tab data loss | Silent data loss | Low (rare race condition) | Add generation counter |
| Session secret rotation invalidation | All users logged out | Low (ops change) | Add grace period / multi-key validation |

---

## Anti-Herd Check

All 5 personas agreed on the severity of the flat store re-render issue (#2) and the detect-shared.ts monolith (#3). Counter-argument found:

**Counter-argument:** The dual store pattern (`useRequestStore` vs `useMockStore`) may be intentional — mock server state needs to be synced to a Tauri Rust backend via IPC, while the main request store only persists locally. The divergence in patterns reflects different synchronization requirements. However, this should be documented and the mock store should still use the same CommitFn infrastructure for local state, with an additional Tauri sync layer on top.
