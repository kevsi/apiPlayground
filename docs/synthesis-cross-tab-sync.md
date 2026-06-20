# Candidate-AB: Cross-Tab Sync — Keep It Localized

## Decision

1. **`useRequestStore`'s `BroadcastChannel` stays inline in `commit`** — no middleware extraction.
2. **`useMockStore` does NOT get cross-tab sync** — Tauri is the source of truth.
3. **`storage` event fallback stays in `useRequestStore`** — it is specific to that store's persistence model.

## Rationale

### 1. BroadcastChannel is ~5 lines; extracting does not pay

In `use-request-store.ts:381-385`, the sync logic is:

```
storeGen++;
saveToStorageAsync(globalStore);
notifyListeners();
if (syncChannel) syncChannel.postMessage({ type: "update", gen: storeGen });
```

Wrapping this in a `withCrossTabSync` middleware would require:
- A higher-order store factory or a composable wrapper
- Threading `syncChannel` setup/teardown through it
- Handling the `gen` counter outside the store

None of these reduce complexity — they relocate it. The inline approach is transparent and easy to reason about. Extracting pays only when *three or more* stores share the same pattern. We have two, and the second doesn't need it.

### 2. `useMockStore` does not need cross-tab sync

`use-mock-store.ts` already treats Tauri as the single source of truth:
- On load: routes are read from `getMockRoutes()` (Tauri invoke)
- On change: `syncToBackend` writes to `setMockRoutes()` (Tauri invoke)

Every tab reads from and writes to the same Rust backend. There is no stale-local-copy problem because there is no local cache that diverges — the `useState` is a transient rendering copy, re-hydrated on each mount. If two tabs are open, both render the same Tauri state.

Without Tauri (pure web), `useMockStore` persists to `localStorage` and syncs to a Next.js API route. Cross-tab sync *could* be added, but the mock store is a development tool, not a source-truth for user data. The risk of stale state is low, and the user impact of a stale mock route is negligible. Complexity is not justified.

### 3. `storage` event fallback is specific to `useRequestStore`

`use-request-store.ts:353-358` listens for `window.addEventListener("storage", ...)`. This fires when *another tab* modifies `localStorage` via the same key. It works because `storageAdapter` writes through `idb-keyval` which internally can trigger `storage` events on the same origin.

This is intimately tied to:
- The `STORAGE_KEY` constant (`"reqly-request-store"`)
- `storageAdapter`'s IndexedDB → localStorage fallback chain
- The global-store + `notifyListeners()` subscription model

`useMockStore` uses raw `persistence.setItem` (which writes to `localStorage` directly), but it has no global-store pattern and no `notifyListeners` mechanism. Adding a `storage` listener there would require retrofitting a subscription model onto a `useState`-based hook — more churn than value.

## What We Keep

| Aspect | Location | Why |
|---|---|---|
| `BroadcastChannel` setup | `use-request-store.ts` module level (lines 280-298) | One-time init, module scope |
| `syncChannel.postMessage` | `commit()` (line 385) | Inline, coupled with save+notify |
| `storage` event listener | `useRequestStore` effect (lines 353-358) | Tied to storage adapter model |
| No cross-tab sync in mock | `use-mock-store.ts` (omitted) | Tauri is truth; low value/risk |

## What We Don't Do

- ❌ Extract `withCrossTabSync` middleware
- ❌ Add `BroadcastChannel` to `useMockStore`
- ❌ Add `storage` event listener to `useMockStore`
- ❌ Unify the two stores into one (out of scope for this decision)
