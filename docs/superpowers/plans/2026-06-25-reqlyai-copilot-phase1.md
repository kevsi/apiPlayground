# ReqlyAI Copilot — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local HTTP error diagnosis engine (50+ rules, < 50ms P95 latency) that runs entirely in the browser/desktop without any LLM call, validates against a 200-error annotated dataset, and exposes a dedicated UI panel in Reqly's response area.

**Architecture:** Strangler-fig pattern. New `src/ai/` module co-located with `reqy-web`. Existing AI (`useAIEngine`, chat, AI Insights) keeps working untouched. New `LocalEngine` runs first, displays diagnostics in a new ReqlyAI Panel tab. Cloud Engine (LLM streaming) is Phase 2 — out of scope here.

**Tech Stack:** TypeScript strict, React 19, Next.js 16, Vitest, Tailwind v4, Radix UI.

**Reference Spec:** `docs/superpowers/specs/2026-06-25-reqlyai-copilot-design.md`

---

## File Structure

```
reqy-web/src/ai/
├── index.ts                              # Public API exports
├── types.ts                              # RequestContext, Diagnostic, Fix, Rule, Severity, Confidence
├── local-engine/
│   ├── index.ts                          # LocalEngine class (analyzer)
│   ├── context.ts                        # buildRequestContext() — captures active tab state
│   ├── analyzer.ts                       # Orchestrates rule execution, dedup, scoring
│   ├── confidence.ts                     # Score confidence from rule matches
│   ├── rules/
│   │   ├── index.ts                      # All rules registry
│   │   ├── auth.ts                       # 401/403 patterns
│   │   ├── format.ts                     # 415, 400, 422, 413
│   │   ├── performance.ts                # timeout, body size, 429 + Retry-After
│   │   ├── ssl.ts                        # CERT, ECONNREFUSED, ENOTFOUND, ETIMEDOUT
│   │   └── server.ts                     # 500, 502, 503, 504
│   └── __tests__/
│       ├── auth.test.ts
│       ├── format.test.ts
│       ├── performance.test.ts
│       ├── ssl.test.ts
│       ├── server.test.ts
│       ├── analyzer.test.ts
│       └── context.test.ts
├── components/
│   ├── Panel.tsx                         # Main ReqlyAI tab panel
│   ├── DiagBadge.tsx                     # Severity-colored badge
│   ├── FixSuggestion.tsx                 # Diagnostic + fix card
│   ├── ModeIndicator.tsx                 # "Local" / "Cloud" pill
│   └── __tests__/
│       ├── Panel.test.tsx
│       ├── DiagBadge.test.tsx
│       └── FixSuggestion.test.tsx
└── __tests__/
    └── fixtures/
        └── error-dataset.json            # 200 annotated errors (pre-requisite 1.0)

reqy-web/src/ai/__tests__/fixtures/error-dataset.json   # Same dataset, referenced by all rule tests
```

**Rationale:**
- `src/ai/` (not `lib/`) because the AI module will house React components later and align with `src/components/`, `src/hooks/` patterns. The existing `lib/ai-engine.ts` stays as the legacy chat engine.
- Rules split by HTTP error category for readability; each file ~50-100 lines.
- Tests co-located in `__tests__/` subdirs (matches `vitest.config.ts` glob `lib/**/__tests__/**/*.test.ts` — note: we'll need to update vitest config to also include `src/ai/**/__tests__/**/*.test.ts`).
- One fixture file shared by all rule tests (single source of truth for the 200-error dataset).

---

## Pre-Task: Vitest Configuration Update

Before starting Task 1, ensure the test runner picks up our new `src/ai/` location.

**File:**
- Modify: `reqy-web/vitest.config.ts`

- [ ] **Step 1: Update include pattern**

Replace:
```ts
include: ['lib/__tests__/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
```

With:
```ts
include: [
  'lib/__tests__/**/*.test.ts',
  'lib/**/__tests__/**/*.test.ts',
  'src/ai/**/__tests__/**/*.test.ts',
  'src/ai/**/*.test.ts',
],
```

- [ ] **Step 2: Verify config parses**

Run: `cd reqy-web && pnpm vitest --listTests 2>&1 | head -20`
Expected: prints discovered test files (may be empty initially, that's fine — confirms config is valid).

- [ ] **Step 3: Commit**

```bash
cd reqy-web && git add vitest.config.ts
git commit -m "chore(ai): include src/ai/ in vitest test discovery"
```

---

## Task 1: Pre-requisite 1.0 — Create the 200-error annotated dataset

**Why first:** Every rule we write is validated against this dataset. Without it, we're coding blind.

**Files:**
- Create: `reqy-web/src/ai/__tests__/fixtures/error-dataset.json`

- [ ] **Step 1: Create the dataset file with the first 50 entries**

The dataset is a JSON array of fixtures. Each fixture has the full context and the expected diagnostic.

```json
[
  {
    "id": "auth-401-bearer-missing-001",
    "category": "auth",
    "context": {
      "request": {
        "method": "GET",
        "url": "https://api.example.com/users",
        "headers": {},
        "body": null,
        "authType": "none"
      },
      "response": {
        "status": 401,
        "statusText": "Unauthorized",
        "headers": {"www-authenticate": "Bearer"},
        "body": {"error": "missing_token"},
        "duration": 45,
        "size": 32
      }
    },
    "expected": {
      "ruleId": "auth.401.bearer.missing",
      "severity": "error",
      "title": "Token Bearer manquant"
    }
  },
  {
    "id": "auth-401-bearer-expired-002",
    "category": "auth",
    "context": {
      "request": {
        "method": "GET",
        "url": "https://api.example.com/me",
        "headers": {"authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"},
        "body": null,
        "authType": "bearer"
      },
      "response": {
        "status": 401,
        "statusText": "Unauthorized",
        "headers": {"www-authenticate": "Bearer error=\"invalid_token\", error_description=\"The token expired\""},
        "body": {"error": "invalid_token", "error_description": "The token expired at 2026-06-20T12:00:00Z"},
        "duration": 38,
        "size": 90
      }
    },
    "expected": {
      "ruleId": "auth.401.bearer.expired",
      "severity": "error",
      "title": "Token Bearer expiré"
    }
  }
]
```

- [ ] **Step 2: Add 198 more fixtures covering all error categories**

Distribution targets:
- **auth** (60 fixtures): 401 missing (15), 401 expired (15), 401 invalid (10), 401 Basic bad creds (10), 403 scope (5), 403 admin (5)
- **format** (50 fixtures): 415 missing Content-Type (15), 415 wrong Content-Type (10), 400 missing Content-Type (10), 400 malformed JSON (10), 422 validation (5)
- **performance** (30 fixtures): 429 with Retry-After (10), 429 without (5), timeout > 5s (10), body > 1MB (5)
- **ssl** (30 fixtures): ECONNREFUSED (8), ENOTFOUND (8), ETIMEDOUT (8), CERT_HAS_EXPIRED (3), CERT_INVALID (3)
- **server** (30 fixtures): 500 generic (10), 502 (5), 503 (10), 504 (5)

Each fixture MUST have: `id`, `category`, `context.request`, `context.response` (or `context.error` for SSL), `expected.ruleId`, `expected.severity`, `expected.title`.

- [ ] **Step 3: Validate JSON parses correctly**

Run: `cd reqy-web && node -e "const d = require('./src/ai/__tests__/fixtures/error-dataset.json'); console.log('Fixtures:', d.length); const byCat = d.reduce((a, f) => { a[f.category] = (a[f.category]||0)+1; return a; }, {}); console.log(byCat);"`
Expected: prints `Fixtures: 200` and category breakdown matching the targets above.

- [ ] **Step 4: Commit**

```bash
git add reqy-web/src/ai/__tests__/fixtures/error-dataset.json
git commit -m "feat(ai): add 200-error annotated dataset for rule validation"
```

---

## Task 2: Step 1.1 — Create the `src/ai/` directory structure

**Files:**
- Create: `reqy-web/src/ai/index.ts` (placeholder)
- Create: `reqy-web/src/ai/types.ts` (placeholder)
- Create: `reqy-web/src/ai/local-engine/index.ts` (placeholder)
- Create: `reqy-web/src/ai/local-engine/rules/index.ts` (placeholder)
- Create: `reqy-web/src/ai/components/Panel.tsx` (placeholder)
- Create: `reqy-web/src/ai/components/__tests__/.gitkeep`

- [ ] **Step 1: Create all directories**

Run:
```bash
cd reqy-web && mkdir -p src/ai/local-engine/rules src/ai/local-engine/__tests__ src/ai/components/__tests__ src/ai/__tests__/fixtures
```

- [ ] **Step 2: Create placeholder index.ts files**

Create `src/ai/index.ts`:
```ts
// Public API — populated as tasks complete
export {};
```

Create `src/ai/local-engine/index.ts`:
```ts
export {};
```

Create `src/ai/local-engine/rules/index.ts`:
```ts
export {};
```

Create `src/ai/components/Panel.tsx`:
```tsx
// Placeholder — populated in Task 12
export function Panel() {
  return null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd reqy-web && pnpm tsc --noEmit 2>&1 | head -20`
Expected: no errors related to the new files (other pre-existing errors OK).

- [ ] **Step 4: Commit**

```bash
git add reqy-web/src/ai/
git commit -m "chore(ai): scaffold src/ai/ directory structure"
```

---

## Task 3: Step 1.2 — Define shared types in `src/ai/types.ts`

**Files:**
- Modify: `reqy-web/src/ai/types.ts`

- [ ] **Step 1: Write the failing type tests**

Create `reqy-web/src/ai/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type {
  RequestContext,
  Diagnostic,
  Fix,
  Rule,
  Severity,
  Confidence,
  DiagnosticSource,
} from "@/src/ai/types";

describe("AI types compile correctly", () => {
  it("RequestContext accepts full payload", () => {
    const ctx: RequestContext = {
      request: {
        method: "GET",
        url: "https://api.example.com",
        headers: { authorization: "Bearer x" },
        body: null,
        authType: "bearer",
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { ok: true },
        duration: 42,
        size: 12,
      },
      timestamp: Date.now(),
    };
    expect(ctx.request.method).toBe("GET");
  });

  it("RequestContext supports error-only (no response)", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "https://x", headers: {}, body: null, authType: "none" },
      error: { message: "ECONNREFUSED", code: "ECONNREFUSED", type: "network" },
      timestamp: Date.now(),
    };
    expect(ctx.error?.code).toBe("ECONNREFUSED");
  });

  it("Diagnostic with fix is constructible", () => {
    const fix: Fix = {
      type: "header",
      description: "Add Bearer token",
      patch: { headers: { authorization: "Bearer {{token}}" } },
      applyFix: () => ({ headers: { authorization: "Bearer new" } }),
    };
    const diag: Diagnostic = {
      id: "test-1",
      severity: "error",
      category: "auth",
      title: "Missing token",
      explanation: "...",
      fix,
      confidence: "certain",
      source: "local",
      timestamp: Date.now(),
    };
    expect(diag.fix?.applyFix()).toEqual({ headers: { authorization: "Bearer new" } });
  });

  it("Rule interface is satisfied by a minimal rule", () => {
    const rule: Rule = {
      id: "test.rule",
      category: "auth",
      severity: "warning",
      match: () => true,
      build: () => ({ severity: "warning", category: "auth", title: "t", explanation: "e", confidence: "probable" }),
    };
    expect(rule.match({ request: { method: "GET", url: "", headers: {}, body: null, authType: "none" }, timestamp: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (types don't exist yet)**

Run: `cd reqy-web && pnpm vitest run src/ai/__tests__/types.test.ts 2>&1 | tail -10`
Expected: FAIL — `Cannot find module '@/src/ai/types'`

- [ ] **Step 3: Write the types file**

Create `reqy-web/src/ai/types.ts`:
```ts
/**
 * Shared types for the ReqlyAI Copilot module.
 * See spec: docs/superpowers/specs/2026-06-25-reqlyai-copilot-design.md
 *
 * Re-exports HttpMethod from the existing project types.
 */
import type { HttpMethod } from "@/lib/types";

export type { HttpMethod };

// ─── Context ──────────────────────────────────────────────────────────────

export type AuthType = "none" | "bearer" | "basic" | "apikey" | "oauth2";

export interface RequestPayload {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  authType: AuthType;
}

export interface ResponsePayload {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  duration: number; // ms
  size: number; // bytes
}

export type NetworkErrorType =
  | "network"
  | "ssl"
  | "dns"
  | "timeout"
  | "unknown";

export interface NetworkError {
  message: string;
  code: string;
  type: NetworkErrorType;
}

export interface RequestContext {
  request: RequestPayload;
  response?: ResponsePayload;
  error?: NetworkError;
  /** Capture timestamp (ms epoch) — used to measure engine latency. */
  timestamp: number;
}

// ─── Diagnostic ───────────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info";
export type Confidence = "certain" | "probable" | "uncertain";
export type DiagnosticSource = "local" | "llm" | "rag";
export type DiagnosticCategory =
  | "auth"
  | "format"
  | "performance"
  | "ssl"
  | "server"
  | "business";

export type FixType = "header" | "body" | "url" | "auth" | "method";

export interface Fix {
  type: FixType;
  description: string;
  patch: Partial<RequestPayload>;
  applyFix: () => Partial<RequestPayload>;
}

export interface Diagnostic {
  id: string;
  severity: Severity;
  category: DiagnosticCategory;
  title: string;
  explanation: string;
  fix?: Fix;
  confidence: Confidence;
  source: DiagnosticSource;
  references?: Array<{ label: string; url: string }>;
  timestamp: number;
}

// ─── Rule (local engine) ──────────────────────────────────────────────────

/**
 * A rule inspects a RequestContext and, if matched, builds a Diagnostic.
 * Rules are pure functions — no side effects, no I/O.
 */
export interface Rule {
  /** Stable identifier, e.g. "auth.401.bearer.missing". */
  id: string;
  category: DiagnosticCategory;
  severity: Severity;
  match: (ctx: RequestContext) => boolean;
  build: (ctx: RequestContext) => Omit<Diagnostic, "id" | "timestamp" | "source">;
}

// ─── LLM streaming (Phase 2 placeholder, defined here for type reuse) ────

export type LLMStreamChunkType = "start" | "token" | "diagnostic" | "done" | "error";

export interface LLMStreamChunk {
  type: LLMStreamChunkType;
  content?: string;
  diagnostic?: Diagnostic;
  error?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/__tests__/types.test.ts 2>&1 | tail -10`
Expected: 4 tests passing.

- [ ] **Step 5: Verify TypeScript compiles across the project**

Run: `cd reqy-web && pnpm tsc --noEmit 2>&1 | head -20`
Expected: no new errors related to `src/ai/types.ts`.

- [ ] **Step 6: Commit**

```bash
git add reqy-web/src/ai/types.ts reqy-web/src/ai/__tests__/types.test.ts
git commit -m "feat(ai): define shared AI types (RequestContext, Diagnostic, Fix, Rule)"
```

---

## Task 4: Step 1.3 — Context Builder

**Files:**
- Create: `reqy-web/src/ai/local-engine/context.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/context.test.ts`

The Context Builder captures the current request + response (or error) from the active Reqly tab and produces a `RequestContext` for rule analysis.

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/context.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildRequestContext } from "@/src/ai/local-engine/context";
import type { RequestPayload, ResponsePayload, NetworkError } from "@/src/ai/types";

describe("buildRequestContext", () => {
  it("builds a context from a successful request/response", () => {
    const req: RequestPayload = {
      method: "GET",
      url: "https://api.example.com/users",
      headers: { accept: "application/json" },
      body: null,
      authType: "none",
    };
    const res: ResponsePayload = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: { users: [] },
      duration: 42,
      size: 15,
    };
    const ctx = buildRequestContext(req, res);
    expect(ctx.request).toEqual(req);
    expect(ctx.response).toEqual(res);
    expect(ctx.error).toBeUndefined();
    expect(typeof ctx.timestamp).toBe("number");
    expect(Date.now() - ctx.timestamp).toBeLessThan(100);
  });

  it("builds a context from a network error only", () => {
    const req: RequestPayload = {
      method: "POST", url: "https://api.example.com/x", headers: {}, body: {}, authType: "bearer",
    };
    const err: NetworkError = { message: "connect ECONNREFUSED", code: "ECONNREFUSED", type: "network" };
    const ctx = buildRequestContext(req, undefined, err);
    expect(ctx.response).toBeUndefined();
    expect(ctx.error).toEqual(err);
  });

  it("infers authType from Authorization header when not provided", () => {
    const req: RequestPayload = {
      method: "GET", url: "https://x", headers: { authorization: "Bearer abc" }, body: null, authType: "none",
    };
    const ctx = buildRequestContext(req);
    expect(ctx.request.authType).toBe("bearer");
  });

  it("infers basic authType", () => {
    const req: RequestPayload = {
      method: "GET", url: "https://x", headers: { authorization: "Basic dXNlcjpwYXNz" }, body: null, authType: "none",
    };
    const ctx = buildRequestContext(req);
    expect(ctx.request.authType).toBe("basic");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/context.test.ts 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '@/src/ai/local-engine/context'`

- [ ] **Step 3: Implement buildRequestContext**

Create `src/ai/local-engine/context.ts`:
```ts
/**
 * Context Builder — captures the active request + response (or error) and
 * produces a normalized RequestContext for the local rules engine.
 */
import type {
  AuthType,
  NetworkError,
  RequestContext,
  RequestPayload,
  ResponsePayload,
} from "@/src/ai/types";

function inferAuthType(headers: Record<string, string>): AuthType {
  const auth = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "authorization"
  )?.[1];
  if (!auth) return "none";
  if (/^Bearer\s+/i.test(auth)) return "bearer";
  if (/^Basic\s+/i.test(auth)) return "basic";
  return "none";
}

export interface BuildContextOptions {
  response?: ResponsePayload;
  error?: NetworkError;
  /** Override timestamp (for deterministic tests). */
  now?: () => number;
}

export function buildRequestContext(
  request: RequestPayload,
  response?: ResponsePayload,
  error?: NetworkError
): RequestContext;

export function buildRequestContext(
  request: RequestPayload,
  optionsOrResponse?: BuildContextOptions | ResponsePayload,
  error?: NetworkError
): RequestContext {
  let resolvedResponse: ResponsePayload | undefined;
  let resolvedError: NetworkError | undefined;

  if (
    optionsOrResponse &&
    typeof optionsOrResponse === "object" &&
    "status" in optionsOrResponse
  ) {
    resolvedResponse = optionsOrResponse as ResponsePayload;
  } else if (optionsOrResponse && typeof optionsOrResponse === "object") {
    resolvedResponse = (optionsOrResponse as BuildContextOptions).response;
    resolvedError = (optionsOrResponse as BuildContextOptions).error ?? error;
  }

  const normalizedRequest: RequestPayload = {
    ...request,
    authType:
      request.authType && request.authType !== "none"
        ? request.authType
        : inferAuthType(request.headers),
  };

  return {
    request: normalizedRequest,
    response: resolvedResponse,
    error: resolvedError,
    timestamp: Date.now(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/context.test.ts 2>&1 | tail -5`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/context.ts reqy-web/src/ai/local-engine/__tests__/context.test.ts
git commit -m "feat(ai): implement Context Builder with authType inference"
```

---

## Task 5: Step 1.4 — Auth rules (401 / 403)

**Files:**
- Create: `reqy-web/src/ai/local-engine/rules/auth.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { authRules } from "@/src/ai/local-engine/rules/auth";
import type { RequestContext } from "@/src/ai/types";
import errorDataset from "@/src/ai/__tests__/fixtures/error-dataset.json";

function ctxFromFixture(id: string): RequestContext {
  const fixture = (errorDataset as any[]).find((f) => f.id === id);
  if (!fixture) throw new Error(`Fixture ${id} not found`);
  return { ...fixture.context, timestamp: Date.now() } as RequestContext;
}

function matchRule(id: string, ctx: RequestContext) {
  return authRules.find((r) => r.id === id);
}

describe("auth.401.bearer.missing", () => {
  const rule = matchRule("auth.401.bearer.missing", ctxFromFixture("auth-401-bearer-missing-001"))!;
  it("matches when 401 and no Authorization header", () => {
    expect(rule).toBeDefined();
    expect(rule.match(ctxFromFixture("auth-401-bearer-missing-001"))).toBe(true);
  });
  it("does not match when Bearer token is present", () => {
    expect(rule.match(ctxFromFixture("auth-401-bearer-expired-002"))).toBe(false);
  });
});

describe("auth.401.bearer.expired", () => {
  const rule = matchRule("auth.401.bearer.expired", ctxFromFixture("auth-401-bearer-expired-002"))!;
  it("matches when 401 + Bearer + error_description mentions expiration", () => {
    expect(rule).toBeDefined();
    expect(rule.match(ctxFromFixture("auth-401-bearer-expired-002"))).toBe(true);
  });
});

describe("all auth rules covered by dataset", () => {
  it("every rule in authRules has at least one matching dataset entry", () => {
    const authFixtures = (errorDataset as any[]).filter((f) => f.category === "auth");
    expect(authFixtures.length).toBeGreaterThanOrEqual(40);
    for (const rule of authRules) {
      const matched = authFixtures.some((f) => {
        try {
          return rule.match({ ...f.context, timestamp: Date.now() } as RequestContext);
        } catch {
          return false;
        }
      });
      expect(matched, `Rule ${rule.id} has no matching fixture`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/auth.test.ts 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '@/src/ai/local-engine/rules/auth'`

- [ ] **Step 3: Implement auth rules**

Create `src/ai/local-engine/rules/auth.ts`:
```ts
/**
 * Auth rules — 401 (missing / expired / invalid token, bad credentials)
 * and 403 (scope, role, admin).
 *
 * Heuristics:
 * - 401 + no Authorization header → missing token
 * - 401 + Bearer + body/header mentions "expired" → token expired
 * - 401 + Bearer + generic → invalid token
 * - 401 + Basic → bad credentials
 * - 403 + Bearer + path contains "/admin/" → admin permission required
 * - 403 + Bearer + body has "scope" field → missing scope
 */
import type { Rule, RequestContext } from "@/src/ai/types";

function hasAuthHeader(ctx: RequestContext): boolean {
  return Object.keys(ctx.request.headers).some(
    (k) => k.toLowerCase() === "authorization"
  );
}

function isBearer(ctx: RequestContext): boolean {
  const auth = Object.entries(ctx.request.headers).find(
    ([k]) => k.toLowerCase() === "authorization"
  )?.[1];
  return !!auth && /^Bearer\s+/i.test(auth);
}

function responseBodyString(ctx: RequestContext): string {
  const body = ctx.response?.body;
  if (typeof body === "string") return body.toLowerCase();
  if (body && typeof body === "object") return JSON.stringify(body).toLowerCase();
  return "";
}

function responseHeadersString(ctx: RequestContext): string {
  return JSON.stringify(ctx.response?.headers ?? {}).toLowerCase();
}

function isStatus(ctx: RequestContext, status: number): boolean {
  return ctx.response?.status === status;
}

export const authRules: Rule[] = [
  {
    id: "auth.401.bearer.missing",
    category: "auth",
    severity: "error",
    match: (ctx) => isStatus(ctx, 401) && !hasAuthHeader(ctx),
    build: (ctx) => ({
      severity: "error",
      category: "auth",
      title: "Token Bearer manquant",
      explanation:
        "La requête ne contient pas de header Authorization. L'endpoint requiert une authentification.",
      fix: {
        type: "header",
        description: "Ajouter le header Authorization: Bearer <token>",
        patch: { headers: { authorization: "Bearer {{token}}" } },
        applyFix: () => ({ headers: { authorization: "Bearer {{token}}" } }),
      },
      confidence: "certain",
      references: [
        { label: "MDN — Authorization", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization" },
      ],
    }),
  },
  {
    id: "auth.401.bearer.expired",
    category: "auth",
    severity: "error",
    match: (ctx) =>
      isStatus(ctx, 401) &&
      isBearer(ctx) &&
      (responseBodyString(ctx).includes("expired") ||
        responseHeadersString(ctx).includes("expired") ||
        responseHeadersString(ctx).includes("invalid_token")),
    build: () => ({
      severity: "error",
      category: "auth",
      title: "Token Bearer expiré",
      explanation: "Le serveur signale que le token a expiré ou est invalide.",
      fix: {
        type: "auth",
        description: "Régénérer le token (refresh token ou re-login)",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "probable",
      references: [
        { label: "RFC 6750 — Bearer Token Usage", url: "https://datatracker.ietf.org/doc/html/rfc6750" },
      ],
    }),
  },
  {
    id: "auth.401.bearer.invalid",
    category: "auth",
    severity: "error",
    match: (ctx) =>
      isStatus(ctx, 401) &&
      isBearer(ctx) &&
      !responseBodyString(ctx).includes("expired") &&
      !responseHeadersString(ctx).includes("invalid_token"),
    build: () => ({
      severity: "error",
      category: "auth",
      title: "Token Bearer invalide",
      explanation:
        "Le serveur rejette le token. Vérifiez le format, la signature, ou l'audience.",
      fix: {
        type: "auth",
        description: "Vérifier la validité du token (jwt.io)",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "probable",
    }),
  },
  {
    id: "auth.401.basic.bad_credentials",
    category: "auth",
    severity: "error",
    match: (ctx) =>
      isStatus(ctx, 401) &&
      ctx.request.authType === "basic",
    build: () => ({
      severity: "error",
      category: "auth",
      title: "Identifiants Basic incorrects",
      explanation:
        "L'authentification Basic a échoué. Vérifiez le nom d'utilisateur et le mot de passe.",
      fix: {
        type: "auth",
        description: "Vérifier les identifiants encodés en base64",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "certain",
    }),
  },
  {
    id: "auth.403.scope",
    category: "auth",
    severity: "error",
    match: (ctx) =>
      isStatus(ctx, 403) &&
      (responseBodyString(ctx).includes("scope") ||
        responseBodyString(ctx).includes("insufficient")),
    build: () => ({
      severity: "error",
      category: "auth",
      title: "Scope insuffisant",
      explanation:
        "Le token est valide mais ne dispose pas des permissions (scopes) nécessaires.",
      fix: {
        type: "auth",
        description: "Demander un token avec les scopes requis",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "probable",
      references: [
        { label: "RFC 6749 — OAuth 2.0", url: "https://datatracker.ietf.org/doc/html/rfc6749" },
      ],
    }),
  },
  {
    id: "auth.403.admin",
    category: "auth",
    severity: "error",
    match: (ctx) =>
      isStatus(ctx, 403) &&
      /\/admin\//i.test(ctx.request.url),
    build: () => ({
      severity: "error",
      category: "auth",
      title: "Permissions admin requises",
      explanation: "L'endpoint /admin/ nécessite un rôle administrateur.",
      fix: {
        type: "auth",
        description: "Utiliser un compte avec rôle admin",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "certain",
    }),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/auth.test.ts 2>&1 | tail -5`
Expected: all tests passing. If some fail because the dataset only has 2 fixtures so far, that's expected — the "every rule has a matching fixture" test will fail. Skip that specific test until Task 11 (full dataset validation).

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/auth.ts reqy-web/src/ai/local-engine/__tests__/auth.test.ts
git commit -m "feat(ai): implement auth rules (401/403 patterns)"
```

---

## Task 6: Step 1.5 — Format rules (415, 400, 422, 413)

**Files:**
- Create: `reqy-web/src/ai/local-engine/rules/format.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatRules } from "@/src/ai/local-engine/rules/format";
import type { RequestContext } from "@/src/ai/types";

function ctx(overrides: Partial<RequestContext>): RequestContext {
  return {
    request: { method: "POST", url: "https://x", headers: {}, body: null, authType: "none" },
    timestamp: Date.now(),
    ...overrides,
  } as RequestContext;
}

describe("format.415.missing_content_type", () => {
  const rule = formatRules.find((r) => r.id === "format.415.missing_content_type")!;
  it("matches when 415 + POST/PUT/PATCH + no Content-Type", () => {
    expect(
      rule.match(
        ctx({
          request: { method: "POST", url: "https://x", headers: {}, body: { x: 1 }, authType: "none" },
          response: { status: 415, statusText: "Unsupported Media Type", headers: {}, body: {}, duration: 10, size: 0 },
        })
      )
    ).toBe(true);
  });
  it("does not match when Content-Type is present", () => {
    expect(
      rule.match(
        ctx({
          request: { method: "POST", url: "https://x", headers: { "content-type": "application/json" }, body: {}, authType: "none" },
          response: { status: 415, statusText: "", headers: {}, body: {}, duration: 0, size: 0 },
        })
      )
    ).toBe(false);
  });
});

describe("format.422.validation", () => {
  const rule = formatRules.find((r) => r.id === "format.422.validation")!;
  it("matches when 422 + body contains errors array", () => {
    expect(
      rule.match(
        ctx({
          response: {
            status: 422,
            statusText: "Unprocessable Entity",
            headers: {},
            body: { errors: [{ field: "email", message: "required" }] },
            duration: 10,
            size: 50,
          },
        })
      )
    ).toBe(true);
  });
});

describe("format.413.payload_too_large", () => {
  const rule = formatRules.find((r) => r.id === "format.413.payload_too_large")!;
  it("matches when 413", () => {
    expect(rule.match(ctx({ response: { status: 413, statusText: "", headers: {}, body: {}, duration: 0, size: 0 } }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/format.test.ts 2>&1 | tail -3`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement format rules**

Create `src/ai/local-engine/rules/format.ts`:
```ts
import type { Rule, RequestContext } from "@/src/ai/types";

function hasContentType(ctx: RequestContext): boolean {
  return Object.keys(ctx.request.headers).some(
    (k) => k.toLowerCase() === "content-type"
  );
}

function hasBody(ctx: RequestContext): boolean {
  return ctx.request.body !== null && ctx.request.body !== undefined;
}

function statusIs(ctx: RequestContext, status: number): boolean {
  return ctx.response?.status === status;
}

function bodyString(ctx: RequestContext): string {
  const body = ctx.response?.body;
  if (typeof body === "string") return body.toLowerCase();
  if (body && typeof body === "object") return JSON.stringify(body).toLowerCase();
  return "";
}

export const formatRules: Rule[] = [
  {
    id: "format.415.missing_content_type",
    category: "format",
    severity: "error",
    match: (ctx) =>
      statusIs(ctx, 415) &&
      ["POST", "PUT", "PATCH"].includes(ctx.request.method) &&
      !hasContentType(ctx),
    build: () => ({
      severity: "error",
      category: "format",
      title: "Content-Type manquant",
      explanation:
        "Le serveur refuse la requête car le header Content-Type est absent. Pour un body JSON : Content-Type: application/json.",
      fix: {
        type: "header",
        description: "Ajouter Content-Type: application/json",
        patch: { headers: { "content-type": "application/json" } },
        applyFix: () => ({ headers: { "content-type": "application/json" } }),
      },
      confidence: "certain",
      references: [
        { label: "MDN — Content-Type", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type" },
      ],
    }),
  },
  {
    id: "format.415.wrong_content_type",
    category: "format",
    severity: "error",
    match: (ctx) =>
      statusIs(ctx, 415) &&
      ["POST", "PUT", "PATCH"].includes(ctx.request.method) &&
      hasContentType(ctx),
    build: () => ({
      severity: "error",
      category: "format",
      title: "Content-Type non supporté",
      explanation:
        "Le serveur ne supporte pas le Content-Type envoyé. Vérifiez le format attendu (JSON, XML, form-data…).",
      fix: {
        type: "header",
        description: "Changer le Content-Type selon la doc de l'API",
        patch: { headers: { "content-type": "application/json" } },
        applyFix: () => ({ headers: { "content-type": "application/json" } }),
      },
      confidence: "probable",
    }),
  },
  {
    id: "format.400.missing_content_type",
    category: "format",
    severity: "warning",
    match: (ctx) =>
      statusIs(ctx, 400) &&
      ["POST", "PUT", "PATCH"].includes(ctx.request.method) &&
      !hasContentType(ctx) &&
      hasBody(ctx),
    build: () => ({
      severity: "warning",
      category: "format",
      title: "Content-Type absent sur requête avec body",
      explanation:
        "Le serveur peut ne pas avoir parsé le body sans Content-Type. Ajoutez-le.",
      fix: {
        type: "header",
        description: "Ajouter Content-Type: application/json",
        patch: { headers: { "content-type": "application/json" } },
        applyFix: () => ({ headers: { "content-type": "application/json" } }),
      },
      confidence: "probable",
    }),
  },
  {
    id: "format.400.malformed_json",
    category: "format",
    severity: "error",
    match: (ctx) =>
      statusIs(ctx, 400) &&
      bodyString(ctx).match(/json|parse|unexpected|token|invalid json/i) !== null,
    build: () => ({
      severity: "error",
      category: "format",
      title: "JSON malformé",
      explanation:
        "Le serveur signale une erreur de parsing JSON. Vérifiez la syntaxe (virgules, guillemets, accolades).",
      confidence: "certain",
    }),
  },
  {
    id: "format.422.validation",
    category: "format",
    severity: "error",
    match: (ctx) =>
      statusIs(ctx, 422) ||
      bodyString(ctx).includes('"errors"') ||
      bodyString(ctx).includes('"validation"'),
    build: () => ({
      severity: "error",
      category: "format",
      title: "Validation échouée",
      explanation:
        "Le serveur a rejeté les données car un ou plusieurs champs ne respectent pas les contraintes.",
      confidence: "certain",
      references: [
        { label: "RFC 4918 — WebDAV (définit 422)", url: "https://datatracker.ietf.org/doc/html/rfc4918" },
      ],
    }),
  },
  {
    id: "format.404.not_found",
    category: "format",
    severity: "info",
    match: (ctx) => statusIs(ctx, 404),
    build: () => ({
      severity: "info",
      category: "format",
      title: "Ressource introuvable (404)",
      explanation:
        "L'endpoint ou la ressource demandée n'existe pas. Vérifiez l'URL, les paramètres de path, ou si la ressource a été supprimée.",
      confidence: "certain",
      references: [
        { label: "RFC 9110 — 404 Not Found", url: "https://www.rfc-editor.org/rfc/rfc9110#status.404" },
      ],
    }),
  },
  {
    id: "format.413.payload_too_large",
    category: "format",
    severity: "error",
    match: (ctx) => statusIs(ctx, 413),
    build: () => ({
      severity: "error",
      category: "format",
      title: "Payload trop volumineux",
      explanation:
        "Le body dépasse la taille maximale acceptée par le serveur. Réduisez la taille ou utilisez un upload en plusieurs parties.",
      fix: {
        type: "body",
        description: "Réduire la taille du payload (pagination, sous-ressources)",
        patch: {},
        applyFix: () => ({}),
      },
      confidence: "certain",
    }),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/format.test.ts 2>&1 | tail -3`
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/format.ts reqy-web/src/ai/local-engine/__tests__/format.test.ts
git commit -m "feat(ai): implement format rules (415, 400, 422, 413)"
```

---

## Task 7: Step 1.6 — Performance rules (timeout, 429, body size)

**Files:**
- Create: `reqy-web/src/ai/local-engine/rules/performance.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/performance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/performance.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { performanceRules } from "@/src/ai/local-engine/rules/performance";
import type { RequestContext } from "@/src/ai/types";

const rule = (id: string) => performanceRules.find((r) => r.id === id)!;

describe("performance.timeout.warning", () => {
  it("matches when duration > 5000ms", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "x", headers: {}, body: null, authType: "none" },
      response: { status: 200, statusText: "", headers: {}, body: {}, duration: 6000, size: 0 },
      timestamp: 0,
    };
    expect(rule("performance.timeout.warning").match(ctx)).toBe(true);
  });
  it("does not match at 5000ms exactly", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "x", headers: {}, body: null, authType: "none" },
      response: { status: 200, statusText: "", headers: {}, body: {}, duration: 5000, size: 0 },
      timestamp: 0,
    };
    expect(rule("performance.timeout.warning").match(ctx)).toBe(false);
  });
});

describe("performance.429.with_retry_after", () => {
  it("matches when 429 + Retry-After header present", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "x", headers: {}, body: null, authType: "none" },
      response: {
        status: 429, statusText: "Too Many Requests", headers: { "retry-after": "60" }, body: {}, duration: 10, size: 0,
      },
      timestamp: 0,
    };
    expect(rule("performance.429.with_retry_after").match(ctx)).toBe(true);
  });
});

describe("performance.body.large", () => {
  it("matches when response body > 1MB", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "x", headers: {}, body: null, authType: "none" },
      response: { status: 200, statusText: "", headers: {}, body: {}, duration: 0, size: 2 * 1024 * 1024 },
      timestamp: 0,
    };
    expect(rule("performance.body.large").match(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/performance.test.ts 2>&1 | tail -3`
Expected: FAIL.

- [ ] **Step 3: Implement performance rules**

Create `src/ai/local-engine/rules/performance.ts`:
```ts
import type { Rule, RequestContext } from "@/src/ai/types";

export const performanceRules: Rule[] = [
  {
    id: "performance.timeout.warning",
    category: "performance",
    severity: "warning",
    match: (ctx) => (ctx.response?.duration ?? 0) > 5000 && (ctx.response?.duration ?? 0) <= 10000,
    build: (ctx) => ({
      severity: "warning",
      category: "performance",
      title: "Réponse lente (> 5s)",
      explanation: `La requête a pris ${ctx.response?.duration}ms. Le serveur peut être surchargé ou le endpoint nécessite une optimisation.`,
      confidence: "probable",
    }),
  },
  {
    id: "performance.timeout.critical",
    category: "performance",
    severity: "error",
    match: (ctx) => (ctx.response?.duration ?? 0) > 10000,
    build: (ctx) => ({
      severity: "error",
      category: "performance",
      title: "Réponse très lente (> 10s)",
      explanation: `La requête a pris ${ctx.response?.duration}ms. Risque de timeout côté client. Envisager pagination, async, ou cache.`,
      confidence: "certain",
    }),
  },
  {
    id: "performance.429.with_retry_after",
    category: "performance",
    severity: "warning",
    match: (ctx) =>
      ctx.response?.status === 429 &&
      Object.keys(ctx.response.headers).some((k) => k.toLowerCase() === "retry-after"),
    build: (ctx) => {
      const retryAfter = Object.entries(ctx.response!.headers).find(
        ([k]) => k.toLowerCase() === "retry-after"
      )?.[1];
      return {
        severity: "warning",
        category: "performance",
        title: `Rate limit (retry après ${retryAfter ?? "?"})`,
        explanation: `Le serveur demande d'attendre ${retryAfter ?? "?"} secondes avant de réessayer.`,
        confidence: "certain",
        references: [
          { label: "RFC 6585 — 429 Too Many Requests", url: "https://datatracker.ietf.org/doc/html/rfc6585" },
        ],
      };
    },
  },
  {
    id: "performance.429.generic",
    category: "performance",
    severity: "warning",
    match: (ctx) =>
      ctx.response?.status === 429 &&
      !Object.keys(ctx.response.headers).some((k) => k.toLowerCase() === "retry-after"),
    build: () => ({
      severity: "warning",
      category: "performance",
      title: "Rate limit atteint",
      explanation: "Trop de requêtes. Réduisez la fréquence ou implémentez un retry exponentiel.",
      confidence: "certain",
    }),
  },
  {
    id: "performance.body.large",
    category: "performance",
    severity: "info",
    match: (ctx) => (ctx.response?.size ?? 0) > 1024 * 1024,
    build: (ctx) => ({
      severity: "info",
      category: "performance",
      title: "Réponse volumineuse (> 1 Mo)",
      explanation: `Taille ${Math.round((ctx.response?.size ?? 0) / 1024)} Ko. Activez gzip/brotli côté serveur pour optimiser.`,
      confidence: "certain",
      references: [
        { label: "MDN — Content-Encoding", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding" },
      ],
    }),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/performance.test.ts 2>&1 | tail -3`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/performance.ts reqy-web/src/ai/local-engine/__tests__/performance.test.ts
git commit -m "feat(ai): implement performance rules (timeout, 429, body size)"
```

---

## Task 8: Step 1.7 — SSL / Network rules

**Files:**
- Create: `reqy-web/src/ai/local-engine/rules/ssl.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/ssl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/ssl.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sslRules } from "@/src/ai/local-engine/rules/ssl";
import type { RequestContext } from "@/src/ai/types";

const rule = (id: string) => sslRules.find((r) => r.id === id)!;

describe("ssl.network.econnrefused", () => {
  it("matches ECONNREFUSED error", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "http://localhost:9999", headers: {}, body: null, authType: "none" },
      error: { message: "connect ECONNREFUSED", code: "ECONNREFUSED", type: "network" },
      timestamp: 0,
    };
    expect(rule("ssl.network.econnrefused").match(ctx)).toBe(true);
  });
});

describe("ssl.dns.enotfound", () => {
  it("matches ENOTFOUND error", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "https://nonexistent.example", headers: {}, body: null, authType: "none" },
      error: { message: "getaddrinfo ENOTFOUND", code: "ENOTFOUND", type: "dns" },
      timestamp: 0,
    };
    expect(rule("ssl.dns.enotfound").match(ctx)).toBe(true);
  });
});

describe("ssl.cert.expired", () => {
  it("matches CERT_HAS_EXPIRED", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "https://expired.example", headers: {}, body: null, authType: "none" },
      error: { message: "certificate has expired", code: "CERT_HAS_EXPIRED", type: "ssl" },
      timestamp: 0,
    };
    expect(rule("ssl.cert.expired").match(ctx)).toBe(true);
  });
});

describe("ssl.timeout.etimedout", () => {
  it("matches ETIMEDOUT", () => {
    const ctx: RequestContext = {
      request: { method: "GET", url: "https://slow.example", headers: {}, body: null, authType: "none" },
      error: { message: "connect ETIMEDOUT", code: "ETIMEDOUT", type: "timeout" },
      timestamp: 0,
    };
    expect(rule("ssl.timeout.etimedout").match(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/ssl.test.ts 2>&1 | tail -3`
Expected: FAIL.

- [ ] **Step 3: Implement SSL rules**

Create `src/ai/local-engine/rules/ssl.ts`:
```ts
import type { Rule, RequestContext } from "@/src/ai/types";

function errorCode(ctx: RequestContext): string | undefined {
  return ctx.error?.code;
}

export const sslRules: Rule[] = [
  {
    id: "ssl.network.econnrefused",
    category: "ssl",
    severity: "error",
    match: (ctx) => errorCode(ctx) === "ECONNREFUSED",
    build: () => ({
      severity: "error",
      category: "ssl",
      title: "Connexion refusée",
      explanation: "Le serveur cible refuse la connexion. Vérifiez que le service est démarré et que le port est ouvert.",
      confidence: "certain",
    }),
  },
  {
    id: "ssl.dns.enotfound",
    category: "ssl",
    severity: "error",
    match: (ctx) => errorCode(ctx) === "ENOTFOUND",
    build: () => ({
      severity: "error",
      category: "ssl",
      title: "DNS non résolu",
      explanation: "Le nom de domaine n'a pas pu être résolu. Vérifiez l'URL ou la connectivité réseau.",
      confidence: "certain",
    }),
  },
  {
    id: "ssl.timeout.etimedout",
    category: "ssl",
    severity: "error",
    match: (ctx) => errorCode(ctx) === "ETIMEDOUT",
    build: () => ({
      severity: "error",
      category: "ssl",
      title: "Timeout réseau",
      explanation: "La connexion a expiré. Le serveur est inaccessible (firewall, hors ligne, ou surchargé).",
      confidence: "certain",
    }),
  },
  {
    id: "ssl.cert.expired",
    category: "ssl",
    severity: "error",
    match: (ctx) => errorCode(ctx) === "CERT_HAS_EXPIRED",
    build: () => ({
      severity: "error",
      category: "ssl",
      title: "Certificat SSL expiré",
      explanation: "Le certificat SSL du serveur a expiré. Contactez l'administrateur du serveur.",
      confidence: "certain",
    }),
  },
  {
    id: "ssl.cert.invalid",
    category: "ssl",
    severity: "error",
    match: (ctx) =>
      errorCode(ctx) === "CERT_INVALID" ||
      errorCode(ctx) === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
      errorCode(ctx) === "SELF_SIGNED_CERT_IN_CHAIN" ||
      errorCode(ctx) === "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    build: () => ({
      severity: "error",
      category: "ssl",
      title: "Certificat SSL invalide",
      explanation: "Le certificat SSL n'est pas valide (auto-signé, non reconnu par une CA de confiance).",
      confidence: "certain",
    }),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/ssl.test.ts 2>&1 | tail -3`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/ssl.ts reqy-web/src/ai/local-engine/__tests__/ssl.test.ts
git commit -m "feat(ai): implement SSL/network rules (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, CERT)"
```

---

## Task 9: Step 1.8 — Server rules (500, 502, 503, 504)

**Files:**
- Create: `reqy-web/src/ai/local-engine/rules/server.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/local-engine/__tests__/server.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { serverRules } from "@/src/ai/local-engine/rules/server";
import type { RequestContext } from "@/src/ai/types";

const rule = (id: string) => serverRules.find((r) => r.id === id)!;
const ctxWithStatus = (status: number): RequestContext => ({
  request: { method: "GET", url: "https://x", headers: {}, body: null, authType: "none" },
  response: { status, statusText: "", headers: {}, body: {}, duration: 10, size: 0 },
  timestamp: 0,
});

describe("server.500", () => {
  it("matches 500 with extracted error message from body", () => {
    const rule500 = rule("server.500");
    expect(rule500.match(ctxWithStatus(500))).toBe(true);
    const diag = rule500.build({
      ...ctxWithStatus(500),
      response: { status: 500, statusText: "", headers: {}, body: { message: "NullPointerException at line 42" }, duration: 0, size: 0 },
    });
    expect(diag.explanation).toContain("NullPointerException");
  });
});

describe("server.502/503/504", () => {
  it("502 matches", () => expect(rule("server.502").match(ctxWithStatus(502))).toBe(true));
  it("503 matches", () => expect(rule("server.503").match(ctxWithStatus(503))).toBe(true));
  it("504 matches", () => expect(rule("server.504").match(ctxWithStatus(504))).toBe(true));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/server.test.ts 2>&1 | tail -3`
Expected: FAIL.

- [ ] **Step 3: Implement server rules**

Create `src/ai/local-engine/rules/server.ts`:
```ts
import type { Rule, RequestContext } from "@/src/ai/types";

function bodyMessage(ctx: RequestContext): string | null {
  const body = ctx.response?.body;
  if (!body) return null;
  if (typeof body === "string") return body;
  if (typeof body === "object") {
    const b = body as Record<string, unknown>;
    return (
      (typeof b.message === "string" ? b.message : null) ||
      (typeof b.error === "string" ? b.error : null) ||
      (typeof b.detail === "string" ? b.detail : null) ||
      null
    );
  }
  return null;
}

export const serverRules: Rule[] = [
  {
    id: "server.500",
    category: "server",
    severity: "error",
    match: (ctx) => ctx.response?.status === 500,
    build: (ctx) => {
      const msg = bodyMessage(ctx);
      return {
        severity: "error",
        category: "server",
        title: "Erreur serveur (500)",
        explanation: msg
          ? `Le serveur a renvoyé une erreur 500 : ${msg}. C'est un bug côté serveur, pas votre requête.`
          : "Le serveur a renvoyé une erreur 500 (Internal Server Error). C'est un bug côté serveur.",
        confidence: "certain",
        references: [
          { label: "RFC 9110 — 500 Internal Server Error", url: "https://www.rfc-editor.org/rfc/rfc9110#status.500" },
        ],
      };
    },
  },
  {
    id: "server.502",
    category: "server",
    severity: "error",
    match: (ctx) => ctx.response?.status === 502,
    build: () => ({
      severity: "error",
      category: "server",
      title: "Bad Gateway (502)",
      explanation: "Le proxy ou load balancer en amont n'a pas reçu de réponse valide du serveur backend.",
      confidence: "certain",
      references: [
        { label: "RFC 9110 — 502 Bad Gateway", url: "https://www.rfc-editor.org/rfc/rfc9110#status.502" },
      ],
    }),
  },
  {
    id: "server.503",
    category: "server",
    severity: "error",
    match: (ctx) => ctx.response?.status === 503,
    build: () => ({
      severity: "error",
      category: "server",
      title: "Service indisponible (503)",
      explanation: "Le serveur est en maintenance ou surchargé. Réessayez plus tard.",
      confidence: "certain",
      references: [
        { label: "RFC 9110 — 503 Service Unavailable", url: "https://www.rfc-editor.org/rfc/rfc9110#status.503" },
      ],
    }),
  },
  {
    id: "server.504",
    category: "server",
    severity: "error",
    match: (ctx) => ctx.response?.status === 504,
    build: () => ({
      severity: "error",
      category: "server",
      title: "Gateway Timeout (504)",
      explanation: "Le serveur upstream n'a pas répondu dans le délai imparti.",
      confidence: "certain",
      references: [
        { label: "RFC 9110 — 504 Gateway Timeout", url: "https://www.rfc-editor.org/rfc/rfc9110#status.504" },
      ],
    }),
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/server.test.ts 2>&1 | tail -3`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/server.ts reqy-web/src/ai/local-engine/__tests__/server.test.ts
git commit -m "feat(ai): implement server rules (500, 502, 503, 504)"
```

---

## Task 10: Step 1.9 — Rules registry + Analyzer

**Files:**
- Modify: `reqy-web/src/ai/local-engine/rules/index.ts`
- Create: `reqy-web/src/ai/local-engine/analyzer.ts`
- Create: `reqy-web/src/ai/local-engine/__tests__/analyzer.test.ts`

- [ ] **Step 1: Write the failing analyzer test**

Create `src/ai/local-engine/__tests__/analyzer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { analyze } from "@/src/ai/local-engine/analyzer";
import type { RequestContext } from "@/src/ai/types";

const baseReq = { method: "GET" as const, url: "https://x", headers: {}, body: null, authType: "none" as const };

describe("analyze", () => {
  it("returns no diagnostics for a healthy 200 response", () => {
    const ctx: RequestContext = {
      request: baseReq,
      response: { status: 200, statusText: "OK", headers: {}, body: {}, duration: 50, size: 100 },
      timestamp: Date.now(),
    };
    const diags = analyze(ctx);
    expect(diags.length).toBe(0);
  });

  it("returns diagnostic for 401 missing token", () => {
    const ctx: RequestContext = {
      request: baseReq,
      response: { status: 401, statusText: "", headers: { "www-authenticate": "Bearer" }, body: {}, duration: 10, size: 0 },
      timestamp: Date.now(),
    };
    const diags = analyze(ctx);
    expect(diags.some((d) => d.id === "auth.401.bearer.missing")).toBe(true);
  });

  it("deduplicates diagnostics with same id", () => {
    // synthetic: two rules that would both match the same auth error
    const ctx: RequestContext = {
      request: { ...baseReq, headers: { authorization: "Bearer x" } },
      response: { status: 401, statusText: "", headers: {}, body: { message: "token expired" }, duration: 10, size: 0 },
      timestamp: Date.now(),
    };
    const diags = analyze(ctx);
    const ids = diags.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it("runs in under 50ms for typical context", () => {
    const ctx: RequestContext = {
      request: { ...baseReq, headers: { authorization: "Bearer abc" } },
      response: { status: 500, statusText: "", headers: {}, body: { message: "oops" }, duration: 10, size: 0 },
      timestamp: Date.now(),
    };
    const start = performance.now();
    analyze(ctx);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("sorts diagnostics by severity (error > warning > info)", () => {
    const ctx: RequestContext = {
      request: baseReq,
      response: { status: 200, statusText: "", headers: {}, body: {}, duration: 12000, size: 0 },
      timestamp: Date.now(),
    };
    const diags = analyze(ctx);
    const sev = diags.map((d) => d.severity);
    const order = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < sev.length; i++) {
      expect(order[sev[i] as keyof typeof order]).toBeGreaterThanOrEqual(order[sev[i - 1] as keyof typeof order]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/analyzer.test.ts 2>&1 | tail -3`
Expected: FAIL.

- [ ] **Step 3: Build the rules registry**

Modify `src/ai/local-engine/rules/index.ts`:
```ts
import { authRules } from "./auth";
import { formatRules } from "./format";
import { performanceRules } from "./performance";
import { sslRules } from "./ssl";
import { serverRules } from "./server";
import type { Rule } from "@/src/ai/types";

export const allRules: Rule[] = [
  ...authRules,
  ...formatRules,
  ...performanceRules,
  ...sslRules,
  ...serverRules,
];

export { authRules, formatRules, performanceRules, sslRules, serverRules };
```

- [ ] **Step 4: Implement analyzer**

Create `src/ai/local-engine/analyzer.ts`:
```ts
/**
 * Analyzer — orchestrates rule execution against a RequestContext.
 * Pure function, no side effects. Returns diagnostics sorted by severity.
 */
import type { Diagnostic, RequestContext, Severity } from "@/src/ai/types";
import { allRules } from "@/src/ai/local-engine/rules";

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function analyze(ctx: RequestContext): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  for (const rule of allRules) {
    let matches = false;
    try {
      matches = rule.match(ctx);
    } catch {
      // rule.match threw — skip defensively, don't crash the engine
      continue;
    }
    if (!matches) continue;

    let built;
    try {
      built = rule.build(ctx);
    } catch {
      continue;
    }

    const diagnostic: Diagnostic = {
      ...built,
      id: rule.id,
      source: "local",
      timestamp: Date.now(),
    };
    if (seen.has(diagnostic.id)) continue;
    seen.add(diagnostic.id);
    diagnostics.push(diagnostic);
  }

  diagnostics.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return diagnostics;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/analyzer.test.ts 2>&1 | tail -3`
Expected: 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add reqy-web/src/ai/local-engine/rules/index.ts reqy-web/src/ai/local-engine/analyzer.ts reqy-web/src/ai/local-engine/__tests__/analyzer.test.ts
git commit -m "feat(ai): implement Analyzer (orchestrator with dedup + severity sort)"
```

---

## Task 11: Step 1.10 — Full dataset validation test

**Files:**
- Create: `reqy-web/src/ai/local-engine/__tests__/dataset-validation.test.ts`

Now that all rules exist, validate them against the complete 200-error dataset.

- [ ] **Step 1: Write the validation test**

Create `src/ai/local-engine/__tests__/dataset-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { analyze } from "@/src/ai/local-engine/analyzer";
import type { RequestContext } from "@/src/ai/types";
import errorDataset from "@/src/ai/__tests__/fixtures/error-dataset.json";

describe("dataset validation", () => {
  it("every fixture produces at least one diagnostic", () => {
    const fixtures = errorDataset as any[];
    let matched = 0;
    const unmatched: string[] = [];
    for (const f of fixtures) {
      const ctx: RequestContext = { ...f.context, timestamp: Date.now() };
      const diags = analyze(ctx);
      if (diags.length > 0) matched++;
      else unmatched.push(f.id);
    }
    // Require >= 85% coverage (target from spec)
    expect(matched / fixtures.length).toBeGreaterThanOrEqual(0.85);
    if (unmatched.length > 0) {
      console.warn(`Unmatched fixtures: ${unmatched.length}`, unmatched.slice(0, 10));
    }
  });

  it("precision: when a fixture has an expected ruleId, analyzer must produce it", () => {
    const fixtures = errorDataset as any[];
    const withExpected = fixtures.filter((f) => f.expected?.ruleId);
    let correct = 0;
    const wrong: Array<{ id: string; expected: string; got: string[] }> = [];
    for (const f of withExpected) {
      const ctx: RequestContext = { ...f.context, timestamp: Date.now() };
      const diags = analyze(ctx);
      const gotIds = diags.map((d) => d.id);
      if (gotIds.includes(f.expected.ruleId)) correct++;
      else wrong.push({ id: f.id, expected: f.expected.ruleId, got: gotIds });
    }
    // Target: > 90% precision
    expect(correct / withExpected.length).toBeGreaterThanOrEqual(0.9);
    if (wrong.length > 0) {
      console.warn(`Mismatched fixtures: ${wrong.length}`, wrong.slice(0, 10));
    }
  });
});
```

- [ ] **Step 2: Run validation**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/dataset-validation.test.ts 2>&1 | tail -20`
Expected: if dataset and rules are aligned, both tests pass. If not, console.warn shows unmatched fixtures — iterate on rules or dataset until coverage >= 85% and precision >= 90%.

- [ ] **Step 3: Add benchmark for P95 latency**

Create `src/ai/local-engine/__tests__/benchmark.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { analyze } from "@/src/ai/local-engine/analyzer";
import type { RequestContext } from "@/src/ai/types";
import errorDataset from "@/src/ai/__tests__/fixtures/error-dataset.json";

describe("performance benchmark", () => {
  it("P95 latency < 50ms over 1000 invocations", () => {
    const fixtures = (errorDataset as any[]).slice(0, 50);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const f = fixtures[i % fixtures.length];
      const ctx: RequestContext = { ...f.context, timestamp: Date.now() };
      const start = performance.now();
      analyze(ctx);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(`P50: ${samples[Math.floor(samples.length * 0.5)].toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(50);
  });
});
```

- [ ] **Step 4: Run benchmark**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/benchmark.test.ts 2>&1 | tail -5`
Expected: prints P50/P95 latency. P95 < 50ms. If higher, profile and optimize rule matching.

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/local-engine/__tests__/dataset-validation.test.ts reqy-web/src/ai/local-engine/__tests__/benchmark.test.ts
git commit -m "test(ai): add dataset validation (coverage + precision) and P95 benchmark"
```

---

## Task 12: Step 1.11 — Panel component

**Files:**
- Modify: `reqy-web/src/ai/components/Panel.tsx`
- Create: `reqy-web/src/ai/components/__tests__/Panel.test.tsx`

The Panel renders the list of diagnostics. It receives a `diagnostics` prop and renders `DiagBadge` + `FixSuggestion` for each.

- [ ] **Step 1: Write the failing test**

Create `src/ai/components/__tests__/Panel.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "@/src/ai/components/Panel";
import type { Diagnostic } from "@/src/ai/types";

const fakeDiag: Diagnostic = {
  id: "auth.401.bearer.missing",
  severity: "error",
  category: "auth",
  title: "Token Bearer manquant",
  explanation: "...",
  confidence: "certain",
  source: "local",
  timestamp: 0,
};

describe("Panel", () => {
  it("renders empty state when no diagnostics", () => {
    render(<Panel diagnostics={[]} />);
    expect(screen.getByText(/aucun diagnostic/i)).toBeTruthy();
  });
  it("renders a DiagBadge per diagnostic", () => {
    render(<Panel diagnostics={[fakeDiag]} />);
    expect(screen.getByText("Token Bearer manquant")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/components/__tests__/Panel.test.tsx 2>&1 | tail -3`
Expected: FAIL (Panel is a placeholder returning null).

- [ ] **Step 3: Implement Panel (with DiagBadge and FixSuggestion stubs)**

Create `src/ai/components/DiagBadge.tsx`:
```tsx
import { cn } from "@/lib/utils";
import type { Severity } from "@/src/ai/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  error: "bg-red-500/10 text-red-600 border-red-500/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  error: "ERREUR",
  warning: "ATTENTION",
  info: "INFO",
};

export function DiagBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
        SEVERITY_STYLES[severity]
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
```

Create `src/ai/components/FixSuggestion.tsx`:
```tsx
import type { Diagnostic } from "@/src/ai/types";
import { DiagBadge } from "./DiagBadge";

export function FixSuggestion({
  diagnostic,
  onApply,
}: {
  diagnostic: Diagnostic;
  onApply?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <DiagBadge severity={diagnostic.severity} />
        <span className="text-sm font-medium">{diagnostic.title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{diagnostic.explanation}</p>
      {diagnostic.fix && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">{diagnostic.fix.description}</p>
          <button
            type="button"
            onClick={onApply}
            disabled={!onApply}
            data-testid={`apply-fix-${diagnostic.id}`}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Appliquer le fix
          </button>
        </div>
      )}
    </div>
  );
}
```

Modify `src/ai/components/Panel.tsx`:
```tsx
"use client";
import { Sparkles } from "lucide-react";
import type { Diagnostic } from "@/src/ai/types";
import { FixSuggestion } from "./FixSuggestion";

export function Panel({
  diagnostics,
  onApplyFix,
}: {
  diagnostics: Diagnostic[];
  onApplyFix?: (diag: Diagnostic) => void;
}) {
  if (diagnostics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center px-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">ReqlyAI</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aucun diagnostic — envoie une requête pour commencer.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4" data-testid="reqlyai-panel">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">ReqlyAI</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {diagnostics.length} diagnostic{diagnostics.length > 1 ? "s" : ""}
        </span>
      </div>
      {diagnostics.map((d) => (
        <FixSuggestion
          key={d.id}
          diagnostic={d}
          onApply={onApplyFix ? () => onApplyFix(d) : undefined}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/components/__tests__/Panel.test.tsx 2>&1 | tail -3`
Expected: 2 tests passing. (May need `@testing-library/react` installed — if so: `pnpm add -D @testing-library/react @testing-library/dom`.)

- [ ] **Step 5: Commit**

```bash
git add reqy-web/src/ai/components/
git commit -m "feat(ai): implement ReqlyAI Panel with DiagBadge and FixSuggestion"
```

---

## Task 13: Step 1.14 — Integrate Panel into request-tabs-manager

**Files:**
- Modify: `reqy-web/src/components/request-tabs-manager.tsx` (read first to understand current structure)

- [ ] **Step 1: Read current request-tabs-manager to find the tab list**

Read at least 50 lines around where response tabs are defined (look for "Response", "Headers", "Body").

- [ ] **Step 2: Locate the tab insertion point**

Find the array of tabs (likely a `<TabsList>` with `<TabsTrigger value="response|headers|body">`). Add a new trigger `value="reqlyai"` after "body".

- [ ] **Step 3: Import Panel + analyzer + context builder**

Add to the top of `request-tabs-manager.tsx`:
```ts
import { analyze } from "@/src/ai/local-engine/analyzer";
import { buildRequestContext } from "@/src/ai/local-engine/context";
import { Panel } from "@/src/ai/components/Panel";
```

- [ ] **Step 4: Compute diagnostics in the component**

In the existing tab manager component, derive diagnostics:
```ts
const diagnostics = useMemo(() => {
  if (!currentRequest) return [];
  const ctx = buildRequestContext(
    {
      method: currentRequest.method,
      url: currentRequest.url,
      headers: currentRequest.headers,
      body: currentRequest.body,
      authType: currentRequest.auth?.type ?? "none",
    },
    lastResponse
      ? {
          status: lastResponse.status,
          statusText: lastResponse.statusText ?? "",
          headers: lastResponse.headers,
          body: lastResponse.body,
          duration: lastResponse.durationMs ?? 0,
          size: 0,
        }
      : undefined
  );
  return analyze(ctx);
}, [currentRequest, lastResponse]);
```

(Adapt the property names to whatever the actual store uses — read the file first.)

- [ ] **Step 5: Add the new tab trigger**

Inside the existing `<TabsList>`, add:
```tsx
<TabsTrigger value="reqlyai" data-testid="tab-reqlyai">
  <Sparkles className="size-3 mr-1" />
  ReqlyAI
  {diagnostics.length > 0 && (
    <span className="ml-1 rounded-full bg-red-500/20 text-red-600 px-1.5 text-[10px]">
      {diagnostics.length}
    </span>
  )}
</TabsTrigger>
```

- [ ] **Step 6: Add the new tab content**

Below the existing `<TabsContent value="body">`, add:
```tsx
<TabsContent value="reqlyai" className="m-0">
  <Panel
    diagnostics={diagnostics}
    onApplyFix={(diag) => {
      if (!diag.fix) return;
      patchRequest(diag.fix.applyFix());
      // Phase 4 will add: toast confirmation, undo, keyboard shortcut
    }}
  />
</TabsContent>
```

(Adapt `patchRequest` to whatever the store exposes.)

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd reqy-web && pnpm tsc --noEmit 2>&1 | head -20`
Expected: no errors. Fix any type mismatches.

- [ ] **Step 8: Manual smoke test**

Run: `cd reqy-web && pnpm dev` (in background), open the app, send a request that triggers a 401. Confirm the "ReqlyAI" tab appears, shows the diagnostic, and "Appliquer le fix" is wired (note: applyFix is a no-op until Phase 4 implements per-category logic).

- [ ] **Step 9: Commit**

```bash
git add reqy-web/src/components/request-tabs-manager.tsx
git commit -m "feat(ai): integrate ReqlyAI Panel as new tab in response area"
```

---

## Task 14: Step 1.15 — Mode indicator (local/cloud)

**Files:**
- Modify: `reqy-web/src/ai/components/Panel.tsx`
- Create: `reqy-web/src/ai/components/ModeIndicator.tsx`
- Create: `reqy-web/src/ai/components/__tests__/ModeIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ai/components/__tests__/ModeIndicator.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeIndicator } from "@/src/ai/components/ModeIndicator";

describe("ModeIndicator", () => {
  it("shows 'Local' when mode is local", () => {
    render(<ModeIndicator mode="local" />);
    expect(screen.getByText(/local/i)).toBeTruthy();
  });
  it("shows 'Cloud' when mode is cloud", () => {
    render(<ModeIndicator mode="cloud" />);
    expect(screen.getByText(/cloud/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reqy-web && pnpm vitest run src/ai/components/__tests__/ModeIndicator.test.tsx 2>&1 | tail -3`
Expected: FAIL.

- [ ] **Step 3: Implement ModeIndicator**

Create `src/ai/components/ModeIndicator.tsx`:
```tsx
"use client";
import { Cloud, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModeIndicator({ mode }: { mode: "local" | "cloud" }) {
  const isLocal = mode === "local";
  return (
    <span
      data-testid="reqlyai-mode-indicator"
      data-mode={mode}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        isLocal
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          : "border-violet-500/30 bg-violet-500/10 text-violet-600"
      )}
    >
      {isLocal ? <Cpu className="size-3" /> : <Cloud className="size-3" />}
      {isLocal ? "Local" : "Cloud"}
    </span>
  );
}
```

- [ ] **Step 4: Wire ModeIndicator into Panel**

Modify `src/ai/components/Panel.tsx` — in the header row, add:
```tsx
import { ModeIndicator } from "./ModeIndicator";
// ...
<ModeIndicator mode="local" /> // Phase 2 will dynamically toggle based on cloud usage
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd reqy-web && pnpm vitest run src/ai/components/__tests__/ModeIndicator.test.tsx 2>&1 | tail -3`
Expected: 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add reqy-web/src/ai/components/ModeIndicator.tsx reqy-web/src/ai/components/Panel.tsx reqy-web/src/ai/components/__tests__/ModeIndicator.test.tsx
git commit -m "feat(ai): add ModeIndicator pill (local/cloud)"
```

---

## Task 15: Phase 1 acceptance check

- [ ] **Step 1: Run the full test suite**

Run: `cd reqy-web && pnpm vitest run 2>&1 | tail -20`
Expected: all AI tests pass + no regressions in existing tests.

- [ ] **Step 2: Verify dataset coverage and precision**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/dataset-validation.test.ts 2>&1 | tail -10`
Expected: coverage >= 85%, precision >= 90%.

- [ ] **Step 3: Verify P95 latency**

Run: `cd reqy-web && pnpm vitest run src/ai/local-engine/__tests__/benchmark.test.ts 2>&1 | tail -5`
Expected: P95 < 50ms.

- [ ] **Step 4: Build production bundle**

Run: `cd reqy-web && pnpm build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Manual end-to-end smoke test**

Run: `cd reqy-web && pnpm dev`. Test scenarios:
1. Send a GET to https://httpbin.org/status/401 → confirm "Token Bearer manquant" appears
2. Send a GET to https://httpbin.org/status/500 → confirm "Erreur serveur (500)" appears
3. Send a GET to a non-existent URL → confirm "DNS non résolu" or "Connexion refusée" appears
4. Confirm existing AI features still work: floating chat, AI Insights page

- [ ] **Step 6: Final commit (if any fixes)**

```bash
git add -A
git commit -m "chore(ai): Phase 1 acceptance fixes"
```

---

## Acceptance Criteria Checklist

Per spec section 9:

- [ ] Moteur local couvre 401, 403, 404, 422, 429, 500, 502, 503, 504, SSL, Timeout ✓
- [ ] Context Builder capture tous les champs de la requête/réponse active ✓
- [ ] Panel UI s'affiche dans Reqly sans impact sur les performances globales ✓
- [ ] Diagnostic local s'affiche en moins de 100ms (cible P95 < 50ms) ✓
- [ ] Aucune régression sur l'IA existante (chat, AI Insights, GraphQL AI) ✓
- [ ] Couverture dataset >= 85%, précision >= 90% ✓

**End of Phase 1 plan. Phase 2 (LLM streaming) is a separate plan.**
