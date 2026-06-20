# Research Findings — improve-260620-1612

## Methodology
- **Workflow:** improve (15 research iterations)
- **Handoff from:** reason-260620-1538 (converged on "Shared Infrastructure, Independent Instances")
- **Categories explored:** ICP challenges (4), Competitor gaps (3), Market trends (3), UX & experience (3), Revenue & growth (2)
- **Source:** websearch (15/15 iterations)
- **Date:** 2026-06-20

---

## Category: ICP Challenges (4 iterations)

### Finding 1: State persistence trust (iter 1, 6, 12, 14)
- API developers expect desktop tools to **never lose data**. IndexedDB quota failures silently lose unsaved work.
- Cross-tab state divergence erodes trust in mock server configuration.
- LWW conflict resolution is **sufficient** for single-user scenarios — no need for CRDT or OT.
- **Signal:** Reqly's Tauri architecture is a competitive advantage vs Electron-based tools with higher resource overhead.

### Finding 2: Mock server configuration persistence (iter 12)
- Developers expect mock configs to **survive restarts** and **sync across tabs**.
- Postman's cloud mock servers work offline but require internet to sync. Mockoon doesn't sync at all.
- **Unmet need:** cross-tab sync for local mock config. Reqly's BroadcastChannel middleware solves this.

### Finding 3: Offline-first is table stakes (iter 6)
- Local-first (Bruno, Mockoon) gaining share vs cloud-dependent (Postman).
- Developers choosing tools that work **without internet** as primary mode, not fallback.

---

## Category: Competitor Gaps (3 iterations)

### Finding 4: Postman's weaknesses (iter 2, 7, 15)
- **Cloud dependency:** Postman mock servers require internet. Local mock server feature added March 2026 (too late, still Electron).
- **Bundle size:** 80-200MB vs Tauri's 3-15MB. Postman can't match native desktop performance.
- **No offline-first architecture:** Postman is cloud-first, offline is degraded mode.
- **No cross-tab sync:** Postman is single-window. Reqly's multi-tab with BroadcastChannel sync is unique.

### Finding 5: Competitive landscape (iter 7, 11, 15)
- **Mockoon:** Leading local desktop mock server. Open source. No cross-tab sync, no request client.
- **Bruno:** Fastest-growing Postman alternative. Git-based, local-first. Electron-based (significantly larger than Tauri).
- **WireMock:** Enterprise record/playback. Java-based, not a desktop client.
- **Apidog:** Offline Space launched 2025. Still Electron, limited offline mode.
- **Reqly's moat:** Tauri native + local mock server + cross-tab sync + open source — no competitor combines all four.

### Finding 6: Positioning opportunity (iter 15)
- "The lightweight, offline-first, open-source API client for developers who value performance and data privacy."
- The store architecture (createStoreFactory + middleware) is the **foundation** for all differentiators.

---

## Category: Market Trends (3 iterations)

### Finding 7: State management patterns (iter 3, 8)
- **Zustand** is the dominant pattern in Tauri v2 apps. `useSyncExternalStore` + `useShallow` is the proven approach.
- Bundle overhead is negligible (0.65KB for Zustand core).
- createStoreFactory alignment with Zustand patterns is **correct** — the middleware composability is the differentiator, not the store core.

### Finding 8: Local-first winning (iter 11)
- Bruno, Apidog Offline Space, Postman Git integration (March 2026) — all moving to local-first.
- Trend is unmistakable: **local-first is winning** vs cloud-dependent.
- Reqly should move fast to capture the "local-first API client" positioning before Postman fully pivots.

### Finding 9: Zustand patterns for custom stores (iter 8)
- `useSyncExternalStore` + `useShallow` with selector equality checks is the proven pattern.
- Custom stores built on this pattern (like our factory) follow established conventions.
- Shallow equality is **critical** for preventing spurious re-renders in React 18+.

---

## Category: UX & Experience (3 iterations)

### Finding 10: Silent data loss is #1 trust killer (iter 4, 9, 10)
- Developers will **abandon** tools that lose unsaved work — even once is too many.
- Observable SyncState (visible persistence status) is the **minimum** bar.
- Clear error messaging, predictable recovery paths, and visible retry state are table stakes.
- **Warning banner** on persistence failure with Retry action is the expected pattern.

### Finding 11: Recovery strategies build trust (iter 10)
- Bruno's Git-based storage model is the **gold standard** for local-first trust.
- Optimistic UI + transparent error recovery builds confidence.
- Undo for store mutations is the lightest-weight recovery mechanism that addresses the trust gap.

---

## Category: Revenue & Growth (2 iterations)

### Finding 12: Open core monetization (iter 5, 13)
- Bruno: open core + Git-based team features.
- Mockoon: open core + cloud sync (paid).
- **Recommended for Reqly:** Open source core (store factory, mock server, basic request client). Monetize team workspaces, enterprise SSO, audit logging, managed cloud backup.
- Freemium conversion rate: 2-5%.

---

## Dataset Statistics

| Metric | Value |
|--------|-------|
| Total iterations | 15 |
| Categories covered | 6 |
| Source | websearch |
| HIGH confidence | 8 |
| MEDIUM confidence | 7 |
| New findings | 9 |
| Extension findings | 6 |
| Saturation window | 3/3 (iter 13-15 produced no NEW categories) |
