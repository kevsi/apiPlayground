# Reason Summary

**Task:** Should we unify useRequestStore and useMockStore into a single store with a Tauri sync layer, or keep them separate with shared CommitFn infrastructure?

**Domain:** Software Architecture

**Mode:** Convergent (target 3 consecutive)

**Total Rounds:** 5 (converged at round 5)

---

## Final Answer

**Keep separate stores, with shared infrastructure.** Migrate `useRequestStore` to a pure `createStoreFactory` with composable middleware (`withTauriSync`, `withCrossTabSync`). Do NOT migrate `useMockStore` — instead, add a ~30-line adapter (`getMockState`, `useMockSelector`, `CommitFn` bridge) that provides synchronous state reads and cross-store coordination. The two stores have fundamentally different mutation shapes (request: fire-and-forget via `commit`; mock: return-value-producing actions via raw `useState`), and unifying them would require forcing the mock store into an incompatible abstraction.

## Core Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Pure `createStoreFactory` — zero sync baked in | CONVERGED |
| 2 | Composable middleware: `withTauriSync`, `withCrossTabSync` | CONVERGED |
| 3 | `commit` as sole write primitive (no `createMutator`) | CONVERGED |
| 4 | `shallowEqual` + `useCallback` selector memoization | CONVERGED |
| 5 | `flush()` for async effect draining | CONVERGED |
| 6 | `hydrate()` + `<StoreHydrator>` for init ordering | CONVERGED |
| 7 | Observable `SyncState` with warning banner | CONVERGED |
| 8 | Write-through LWW (no version gating) | CONVERGED |
| 9 | `getMockState()` synchronous read adapter | CONVERGED |
| 10 | Two-phase migration: zero-import-change → codemod | CONVERGED |
| 11 | Backwards compat shim with `@deprecated` | CONVERGED |
| 12 | `useMocksPageData()` composable for cross-store | CONVERGED |
| 13 | Honest bundle: +0.65 KB gzipped | CONVERGED |
| 14 | Cross-tab sync as composable middleware | CONVERGED |

## Convergence Trajectory

| Round | Winner | Conv Count | Notes |
|-------|--------|-----------|-------|
| 1 | AB (Shared Infrastructure) | 1 | Unanimous rejection of both unified and fully separate |
| 2 | AB (Synthesized Hybrid) | 2 | Majority; pure factory + middleware pattern solidifies |
| 3 | AB (Factory + adapter) | 1* | Substantive refinement (adapter vs full migration) |
| 4 | A (Extract withCrossTabSync) | 1* | Consistent with middleware pattern, extends to BroadcastChannel |
| 5 | CONVERGED | 3 | All decisions stable, no contradictions |

*Reset due to substantive refinement of the proposal.

## Judge Agreement Rate

- Round 1: 3/3 unanimous
- Round 2: 2/3 majority
- Round 3: 3/3 unanimous
- Round 4: 3/3 unanimous
- **Overall: 11/12 (92%)**

## Key Insights

1. **Selectors make file layout irrelevant** — `useSyncExternalStore` with `shallowEqual` provides identical re-render isolation whether stores are unified or separate.
2. **Mock store's return-value mutations are the dealbreaker** — `addRoute()` returns `id`; `addServer()` returns `id`. A factory built on `commit(() => void)` can't express this without leaky wrappers.
3. **Bundle impact is negligible** — +0.65 KB gzipped for significant architectural improvement.
4. **Cross-tab sync for mock store is unnecessary** — Tauri backend is the source of truth across tabs.
5. **Two-phase migration is critical** — Phase 1 rewrites internals with zero import changes. Phase 2 is an optional codemod.
