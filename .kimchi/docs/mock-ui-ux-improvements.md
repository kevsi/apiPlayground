# Mock Server UI/UX Improvements Plan

**Goal:** Make the Mock Server interface clearer and easier to use after the switch to Mockoon CLI.

**Target file:** `reqy-web/app/(app)/mocks/page.tsx`
**Supporting file:** `reqy-web/hooks/use-mock-store.ts`

---

## Pain Points

1. **No sidecar status indicator** — users can't tell if Mockoon is running.
2. **Server "Actif/Inactif" badge is misleading** — it reflects `server.enabled`, not whether the sidecar is serving requests.
3. **Base URL is just a code block** — not actionable or explained.
4. **Test dialog still says "Simulation en cours…"** — but tests now hit the real sidecar.
5. **No per-route test loading state** — a single `isTesting` flag disables all route tests.
6. **No inline help** — new users won't understand the `localPrefix` / sidecar URL relationship.
7. **No sidecar error feedback** — if reload fails, the error only appears in the console.

---

## Changes

### 1. Track sidecar status in `useMockStore`

Add `sidecarStatus` state with values `"idle" | "loading" | "running" | "error"` and `sidecarError` string.

Update `syncToBackend`:
- Set `sidecarStatus = "loading"` before reload.
- On success: `sidecarStatus = "running"`, `sidecarBaseUrl = result.baseUrl`, clear error.
- On failure: `sidecarStatus = "error"`, `sidecarError = result.error`.

Expose both from the hook return value.

### 2. Add a clear sidecar status card at the top of the page

Show:
- A colored dot + label: "Mockoon actif" (green), "Démarrage…" (amber), "Erreur" (red), "Inactif" (gray).
- The current base URL with a copy button.
- A short helper text: "Vos endpoints sont servis localement par Mockoon CLI."
- On error, display the error message.

### 3. Rename and clarify server badge

- Change server badge from "Actif/Inactif" to "Activé/Désactivé" to clarify it's about route inclusion, not sidecar health.

### 4. Improve base URL display

- Label: "URL de base du mock server" instead of just "URL de base".
- Add a small info icon or tooltip explaining that routes are reachable at `{baseUrl}/{prefix}/{path}`.
- Make the URL a clickable/external link (open in new tab) when the sidecar is running.

### 5. Per-route test loading

- Replace global `isTesting` with a `testingRouteId` state.
- Only the tested route shows a spinner.
- Disable the "Tester" menu item only for the route currently being tested.

### 6. Fix test dialog wording

- Change "Simulation en cours…" to "Appel du mock server…".
- Show the actual response status, body, and headers.
- Keep the formatted JSON display.

### 7. Better empty states

- When no servers: show a clear "Créer votre premier serveur mock" CTA.
- When no routes: explain how to add an endpoint or import from a collection.

### 8. Inline route URL copy

- Add a "Copier l'URL" action next to each route (in addition to Test).
- Use the sidecar base URL + prefix + path.

### 9. Server creation helper

- Improve the local prefix explanation tooltip.
- Make the base URL field optional or remove it if unused (Mockoon ignores it).

---

## Implementation Tasks

### Task 1: Add sidecar status to `useMockStore`

Modify `reqy-web/hooks/use-mock-store.ts`:
- Add `sidecarStatus` and `sidecarError` state.
- Update `syncToBackend` to set status/error.
- Return `sidecarStatus` and `sidecarError`.

### Task 2: Improve `mocks/page.tsx`

Modify `reqy-web/app/(app)/mocks/page.tsx`:
- Add status card component.
- Update labels, badges, and helper text.
- Replace global `isTesting` with `testingRouteId`.
- Add per-route copy URL action.
- Improve empty states and dialogs.

### Task 3: Verify

Run:

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
npx tsc --noEmit
npx vitest run lib/mockoon/__tests__/adapter.test.ts lib/mockoon/__tests__/sidecar.test.ts lib/__tests__/mockoon-reload.test.ts
pnpm lint
```

Expected: no new TypeScript/lint errors; mockoon tests pass.

---

## Acceptance Criteria

- [ ] User can see at a glance whether the Mockoon sidecar is running.
- [ ] Server badge clearly distinguishes "enabled/disabled" from sidecar health.
- [ ] Base URL is explained and copyable.
- [ ] Testing a route shows a per-route spinner and correct dialog text.
- [ ] Error messages from sidecar reload are surfaced in the UI.
