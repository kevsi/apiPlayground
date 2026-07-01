# Step 2b-i — E2E Tests — Design

## Context
Reqly is a Next.js 16 + Tauri API testing playground. It currently has:
- 7 vitest unit tests for pure logic
- Playwright configured (`playwright.config.ts` exists)
- 1 broken E2E file: `tests/e2e/api-request.spec.ts` (TypeScript errors with `Promise<Locator[]>`)
- **No working E2E coverage** — regression risk is high for a 24-feature app

Step 2b-i adds a working E2E smoke suite + CI to catch regressions.

## Scope (approved)

1. **Fix** the broken `tests/e2e/api-request.spec.ts` (TypeScript errors)
2. **Add 12 smoke scenarios** covering critical user flows
3. **GitHub Actions CI** workflow running E2E on PRs
4. **No new dependencies** — Playwright already installed

## Architecture

```
tests/e2e/
├── api-request.spec.ts           (FIXED: currently broken)
├── collections.spec.ts            (NEW)
├── history.spec.ts                (NEW)
├── environments.spec.ts           (NEW)
├── collection-runner.spec.ts      (NEW)
├── graphql.spec.ts                (NEW)
├── openapi-export.spec.ts         (NEW)
├── auth.spec.ts                   (NEW)
├── fixtures/
│   ├── mock-server.ts             (NEW: local HTTP mock for tests)
│   └── test-data.ts               (NEW: collection/request fixtures)
└── helpers/
    ├── page-objects.ts            (NEW: typed page selectors)
    └── auth.ts                    (NEW: login helpers)

.github/workflows/
└── e2e.yml                        (NEW: GitHub Actions workflow)
```

## Scenarios (12 total)

### Group 1 — Page smoke (3 tests)
1. **Home page loads** — navigate to `/`, expect URL bar visible
2. **Collections page loads** — navigate to `/collections`, expect collections panel visible
3. **Dashboard page loads** — navigate to `/dashboard`, expect metrics cards visible

### Group 2 — Request execution (2 tests)
4. **Create and execute a request** — type URL `http://localhost:PORT/mock`, click Send, expect 200 status
5. **Save to history** — execute a request, navigate to history panel, expect entry visible

### Group 3 — Collections (2 tests)
6. **Create a collection** — click "New collection", enter name, expect in list
7. **Add request to collection** — open collection, drag request into it, expect in collection

### Group 4 — Environments (1 test)
8. **Create environment with variable** — create env with `baseUrl=http://localhost:PORT`, use `{{baseUrl}}/mock` in URL, execute, expect 200

### Group 5 — Collection runner (2 tests)
9. **Run a collection** — collection with 1 request, click Run, expect "1/1 passed"
10. **Export JUnit** — click JUnit button, expect download initiated

### Group 6 — GraphQL (1 test)
11. **Introspect + execute GraphQL** — set protocol to GraphQL, click Introspect, run a simple query, expect data field present

### Group 7 — OpenAPI (1 test)
12. **Export OpenAPI with inference** — execute a request, open OpenAPI export modal, check "Infer from history", export, expect inferred schema in YAML

## Test infrastructure

### Mock server fixture
A small local HTTP server started by Playwright globalSetup that responds to `/mock` with `{ "ok": true }`. This avoids network dependencies in tests.

```ts
// tests/e2e/fixtures/mock-server.ts
import { Server } from "http"

let server: Server | null = null
export async function startMockServer(port = 9999): Promise<string> {
  // returns base URL like "http://localhost:9999"
}
export async function stopMockServer(): Promise<void> { ... }
```

### Page objects (lightweight)
```ts
// tests/e2e/helpers/page-objects.ts
export const homePage = {
  urlInput: () => page.locator('[data-testid="url-input"]'),
  sendButton: () => page.getByRole("button", { name: /send/i }),
  statusBadge: () => page.locator('[data-testid="status-code"]'),
}
```

NOTE: This requires adding `data-testid` attributes to key components. The implementation agent will need to add these (e.g., to `request-panel.tsx`, `collections-panel.tsx`, etc.). If too disruptive, the agent can use `getByRole` / `getByText` selectors instead.

### Auth helper
```ts
// tests/e2e/helpers/auth.ts
export async function loginAsTestUser(page: Page): Promise<void> {
  // Use Supabase test user or skip auth via test cookie
}
```

For the MVP, skip actual auth in most tests (most E2E flows don't require auth). The `auth.spec.ts` test (#13) covers login itself with a mock.

## GitHub Actions CI

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --dir reqy-web exec playwright install --with-deps chromium
      - run: pnpm --dir reqy-web build
      - run: pnpm --dir reqy-web test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: reqy-web/playwright-report/
```

## Error handling

- **Test failures**: Playwright captures screenshots + traces on failure (already configured in `playwright.config.ts`)
- **Flaky tests**: Use `test.retry(1)` for network-dependent scenarios (Group 2-5)
- **Mock server crash**: globalSetup/teardown ensures clean state

## Testing strategy

- **Local dev**: `pnpm --dir reqy-web test:e2e` (headless)
- **Local debug**: `pnpm --dir reqy-web test:e2e -- --headed` + `--debug`
- **CI**: runs on every PR, posts report artifact
- **Browser**: Chromium only (Firefox/Webkit can be added later)

## Non-goals (out of scope)

- Visual regression testing
- Performance / load testing
- Cross-browser matrix (Chromium only for MVP)
- Mobile viewport testing
- Tauri desktop testing (E2E is web only)
- Auth flow with real OAuth (mocked)
- WebSocket / GraphQL subscriptions testing

## File map

| File | Action | Complexity |
|---|---|---|
| `tests/e2e/api-request.spec.ts` | **Fix** | simple |
| `tests/e2e/fixtures/mock-server.ts` | **Create** | simple |
| `tests/e2e/fixtures/test-data.ts` | **Create** | simple |
| `tests/e2e/helpers/page-objects.ts` | **Create** | simple |
| `tests/e2e/helpers/auth.ts` | **Create** | simple |
| `tests/e2e/collections.spec.ts` | **Create** | simple |
| `tests/e2e/history.spec.ts` | **Create** | simple |
| `tests/e2e/environments.spec.ts` | **Create** | simple |
| `tests/e2e/collection-runner.spec.ts` | **Create** | simple |
| `tests/e2e/graphql.spec.ts` | **Create** | simple |
| `tests/e2e/openapi-export.spec.ts` | **Create** | simple |
| `tests/e2e/auth.spec.ts` | **Create** | simple |
| `tests/e2e/home.spec.ts` | **Create** (groups 1) | simple |
| `.github/workflows/e2e.yml` | **Create** | simple |
| `components/request-panel.tsx` | **Modify** (add data-testid) | simple (optional) |

## Plan structure (3 chunks)

- **Chunk 1**: Fix broken spec + create infrastructure (mock server, helpers, fixtures)
- **Chunk 2**: Write 12 test scenarios (6 spec files)
- **Chunk 3**: GitHub Actions CI + verify + commit

## Dependencies

- No new packages — `@playwright/test` already in devDependencies
- Chromium browser (installed via `playwright install`)

## Risks

- **Existing app has no data-testid attributes** — agent may need to add some or use role/text selectors (slower + more brittle)
- **Tauri desktop app not testable via Playwright** — out of scope, documented
- **Mock server needs different port** than the dev server (use 9999)
- **Auth-dependent flows** require test user or mocking — keep MVP simple by skipping auth for most scenarios
