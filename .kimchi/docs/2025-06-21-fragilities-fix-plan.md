# Fragilities Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 technical fragilities in Reqly identified during code analysis.

**Architecture:** Refactor incrementally: extract reusable utilities, add validation layers, secure production endpoints, no breaking changes.

**Tech Stack:** Next.js 16, TypeScript 5.7, Vitest

---

## File Map

| File | Role | Action |
|---|---|---|
| `lib/rate-limiter.ts` | Reusable rate limiter utility | **Create** |
| `app/api/proxy/route.ts` | Proxy API route | **Modify** — replace inline rate limiter with new utility |
| `lib/github-auth.ts` | GitHub OAuth helper | **Create** |
| `app/api/github-auth/repos/route.ts` | GitHub repos endpoint | **Modify** — use shared helper |
| `app/api/github-auth/status/route.ts` | GitHub status endpoint | **Modify** — use shared helper |
| `app/api/github-auth/route.ts` | GitHub OAuth route | **Modify** — dynamic `secure` cookie |
| `lib/variable-mapping.ts` | Variable extraction pipeline | **Modify** — add content-type detection + path validation |
| `lib/variable-path.ts` | Path extraction logic | **Modify** — add XML/text support + validation |
| `app/api/mock/[...path]/route.ts` | Mock dynamic route | **Modify** — production guard on debug endpoint |
| `lib/__tests__/rate-limiter.test.ts` | Rate limiter tests | **Create** |
| `lib/__tests__/variable-mapping.test.ts` | Variable mapping tests (exists, extend) | **Modify** |
| `lib/__tests__/github-auth.test.ts` | GitHub helper tests | **Create** |

---

## Task 1: Reusable Rate Limiter

**Files:**
- Create: `lib/rate-limiter.ts`
- Modify: `app/api/proxy/route.ts`
- Test: `lib/__tests__/rate-limiter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryRateLimiter } from "@/lib/rate-limiter"

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter

  beforeEach(() => {
    limiter = new InMemoryRateLimiter({
      windowMs: 60000,
      maxRequests: 2,
    })
  })

  it("allows requests under limit", () => {
    expect(limiter.check("ip1").allowed).toBe(true)
    expect(limiter.check("ip1").allowed).toBe(true)
  })

  it("blocks requests over limit", () => {
    limiter.check("ip1")
    limiter.check("ip1")
    const result = limiter.check("ip1")
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("resets after window expires", async () => {
    limiter.check("ip1")
    limiter.check("ip1")
    expect(limiter.check("ip1").allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 70))
    expect(limiter.check("ip1").allowed).toBe(true)
  })
})
```

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/rate-limiter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write minimal implementation**

```typescript
// lib/rate-limiter.ts
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export abstract class RateLimiter {
  abstract check(key: string): RateLimitResult
}

interface WindowEntry {
  count: number
  resetAt: number
}

export class InMemoryRateLimiter extends RateLimiter {
  private windows = new Map<string, WindowEntry>()

  constructor(
    private options: { windowMs: number; maxRequests: number }
  ) {
    super()
    if (typeof setInterval !== "undefined") {
      setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of this.windows) {
          if (entry.resetAt <= now) this.windows.delete(key)
        }
      }, 300_000)
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    let entry = this.windows.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.options.windowMs }
      this.windows.set(key, entry)
    }
    entry.count++
    return {
      allowed: entry.count <= this.options.maxRequests,
      remaining: Math.max(0, this.options.maxRequests - entry.count),
      resetAt: entry.resetAt,
    }
  }
}
```

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/rate-limiter.test.ts`
Expected: PASS

- [ ] **Step 3: Refactor proxy route to use the limiter**

In `app/api/proxy/route.ts`:
1. Import: `import { InMemoryRateLimiter } from "@/lib/rate-limiter"`
2. Replace the inline `rateLimitMap`, `checkRateLimit`, and `setInterval` cleanup with:
   ```typescript
   const rateLimiter = new InMemoryRateLimiter({ windowMs: 60000, maxRequests: 100 })
   ```
3. In the handler, replace `checkRateLimit(key)` with `rateLimiter.check(key)`.

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add lib/rate-limiter.ts lib/__tests__/rate-limiter.test.ts app/api/proxy/route.ts
git commit -m "refactor(proxy): extract reusable InMemoryRateLimiter"
```

---

## Task 2: Variable Mapping Pipeline

**Files:**
- Modify: `lib/variable-mapping.ts`
- Modify: `lib/variable-path.ts`
- Test: `lib/__tests__/variable-mapping.test.ts` (extend existing)

- [ ] **Step 1: Add content-type detection and path validation**

In `lib/variable-mapping.ts`, add before `resolveMappingValue`:

```typescript
export type ContentType = "json" | "xml" | "text" | "binary" | "unknown"

export interface MappingResult {
  value: string
  error?: string
  contentType: ContentType
  pathIsValid: boolean
}

function detectContentType(body: unknown): ContentType {
  if (body instanceof Blob) return "binary"
  if (typeof body !== "string") return "unknown"
  const trimmed = body.trim()
  if (trimmed.startsWith("<")) return "xml"
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json"
  return "text"
}

function isValidJsonPath(path: string): boolean {
  if (!path) return false
  if (path === "$") return true
  return /^\$([.\[][^\]]*\])*$/.test(path)
}

export function resolveMappingValuePipeline(
  mapping: VariableMapping,
  history: HistoryItem[]
): MappingResult {
  const sourceItem = history.find((item) => item.id === mapping.sourceRequestId)
  if (!sourceItem) {
    return { value: "", error: "Source request not found in history.", contentType: "unknown", pathIsValid: false }
  }

  const body = sourceItem.responseBody ?? ""
  const contentType = detectContentType(body)

  if (contentType === "binary") {
    return { value: "", error: "Response is binary (Blob). Variable extraction requires a text/JSON/XML response.", contentType, pathIsValid: false }
  }

  const pathIsValid = isValidJsonPath(mapping.sourcePath)
  if (!pathIsValid) {
    return { value: "", error: `Invalid path syntax: ${mapping.sourcePath}`, contentType, pathIsValid }
  }

  if (contentType === "xml") {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(String(body), "application/xml")
      if (doc.querySelector("parsererror")) {
        return { value: "", error: "Invalid XML response.", contentType, pathIsValid }
      }
      const tagName = mapping.sourcePath.replace(/^[$.]+/, "")
      const el = doc.querySelector(tagName)
      if (el) return { value: el.textContent ?? "", contentType, pathIsValid }
      return { value: "", error: `XML path not found: ${mapping.sourcePath}`, contentType, pathIsValid }
    } catch {
      return { value: "", error: "XML parsing failed.", contentType, pathIsValid }
    }
  }

  if (contentType === "text") {
    const text = String(body)
    const regex = mapping.sourcePath.startsWith("/") ? new RegExp(mapping.sourcePath.slice(1, -1)) : null
    if (regex) {
      const match = text.match(regex)
      return { value: match?.[0] ?? "", contentType, pathIsValid }
    }
    return { value: "", error: "Text extraction requires a regex path (/.../).", contentType, pathIsValid }
  }

  const strBody = typeof body === "string" ? body : JSON.stringify(body)
  const extracted = extractValueFromResponse(strBody, mapping.sourcePath)
  if (extracted.error) {
    return { value: extracted.value, error: extracted.error, contentType, pathIsValid }
  }
  return { value: extracted.value, contentType, pathIsValid }
}
```

Modify `computeDynamicVars` to optionally use the pipeline (fallback graceful). Keep old `resolveMappingValue` for backward compat but deprecate it in comment.

- [ ] **Step 2: Run tests for variable mapping**

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/variable-mapping.test.ts`
Expected: PASS (backward compat preserved)

- [ ] **Step 3: Commit**

```bash
git add lib/variable-mapping.ts lib/__tests__/variable-mapping.test.ts
git commit -m "feat(variables): add content-type detection and XML/text extraction pipeline"
```

---

## Task 3: GitHub OAuth Helpers

**Files:**
- Create: `lib/github-auth.ts`
- Modify: `app/api/github-auth/repos/route.ts`
- Modify: `app/api/github-auth/status/route.ts`
- Modify: `app/api/github-auth/route.ts`
- Test: `lib/__tests__/github-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest"
import { buildGithubHeaders } from "@/lib/github-auth"

describe("buildGithubHeaders", () => {
  it("returns base headers without token", () => {
    const h = buildGithubHeaders()
    expect(h.Accept).toBe("application/vnd.github+json")
    expect(h["X-GitHub-Api-Version"]).toBe("2022-11-28")
    expect(h.Authorization).toBeUndefined()
  })

  it("includes Bearer token when provided", () => {
    const h = buildGithubHeaders("my_token")
    expect(h.Authorization).toBe("Bearer my_token")
  })
})
```

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/github-auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write minimal implementation**

```typescript
// lib/github-auth.ts
export function buildGithubHeaders(accessToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  return h
}
```

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/github-auth.test.ts`
Expected: PASS

- [ ] **Step 3: Refactor repos and status routes**

In both `app/api/github-auth/repos/route.ts` and `app/api/github-auth/status/route.ts`:
1. Remove the inline `buildGithubHeaders` definition.
2. Add: `import { buildGithubHeaders } from "@/lib/github-auth"`
3. Ensure all usages still match.

- [ ] **Step 4: Fix cookie secure setting**

In `app/api/github-auth/route.ts`, replace any `secure: true` (or `secure: false`) hardcoded with:
```typescript
const isSecure = process.env.NODE_ENV === "production"
// then use ...COOKIE_OPTS(isSecure)
```
Verify both `COOKIE_OPTS` usages use this dynamic value.

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 5: Commit**

```bash
git add lib/github-auth.ts lib/__tests__/github-auth.test.ts app/api/github-auth/repos/route.ts app/api/github-auth/status/route.ts app/api/github-auth/route.ts
git commit -m "refactor(github): extract buildGithubHeaders, fix dynamic secure cookie"
```

---

## Task 4: Mock Debug Guard

**Files:**
- Modify: `app/api/mock/[...path]/route.ts`

- [ ] **Step 1: Add production guard**

In the GET handler of `app/api/mock/[...path]/route.ts`, find the branch that handles `searchParams.get("debug") === "true"` and wrap it:

```typescript
if (searchParams.get("debug") === "true") {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Debug mode is disabled in production" },
      { status: 403 }
    )
  }
  // ... existing debug logic
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd ./Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add app/api/mock/[...path]/route.ts
git commit -m "fix(mock): disable debug endpoint in production"
```

---

## Task 5: Full Test Run & Lint

- [ ] **Step 1: Run all tests**

```bash
cd ./Documents/Workspace/apiPlayground-main/reqy-web
npx vitest run
```

Expected: All tests pass (existing + new).

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: No critical errors.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: verify all fragility fixes pass tests and lint"
```
