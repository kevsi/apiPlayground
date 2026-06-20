#!/usr/bin/env npx tsx
/**
 * Mock Matcher — Validation Script
 *
 * Runs a comprehensive set of test vectors through the TypeScript
 * matchMockRoute() implementation and reports results.
 *
 * To validate Rust side, run:
 *   cd src-tauri && cargo test
 *
 * Test vectors are exported as JSON so they can be consumed by a Rust
 * integration test if desired (see src-tauri/tests/ for future extension).
 *
 * Usage:
 *   npx tsx scripts/validate-mock-matcher.ts
 */

import { matchMockRoute } from "../reqy-web/lib/match-mock-path"

interface TestVector {
  name: string
  requestMethod: string
  requestPathname: string
  routeMethod: string
  routePattern: string
  requestQuery?: Record<string, string>
  requestHeaders?: Record<string, string>
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
  expectedMatched: boolean
  expectedParams?: Record<string, string>
}

const TEST_VECTORS: TestVector[] = [
  // ── Exact literal match ──
  {
    name: "exact literal match",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    expectedMatched: true,
    expectedParams: {},
  },

  // ── :param segments ──
  {
    name: "single param",
    requestMethod: "GET",
    requestPathname: "/api/users/42",
    routeMethod: "GET",
    routePattern: "/api/users/:id",
    expectedMatched: true,
    expectedParams: { id: "42" },
  },

  // ── Wildcard ──
  {
    name: "wildcard captures rest",
    requestMethod: "GET",
    requestPathname: "/api/users/42/posts/5",
    routeMethod: "GET",
    routePattern: "/api/users/*",
    expectedMatched: true,
    expectedParams: { "*": "42/posts/5" },
  },

  // ── Method wildcard ──
  {
    name: "method wildcard matches POST",
    requestMethod: "POST",
    requestPathname: "/api/anything",
    routeMethod: "*",
    routePattern: "/api/anything",
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "method wildcard matches DELETE",
    requestMethod: "DELETE",
    requestPathname: "/api/anything",
    routeMethod: "*",
    routePattern: "/api/anything",
    expectedMatched: true,
    expectedParams: {},
  },

  // ── Negative cases ──
  {
    name: "wrong method returns no match",
    requestMethod: "POST",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    expectedMatched: false,
  },
  {
    name: "wrong path returns no match",
    requestMethod: "GET",
    requestPathname: "/api/other",
    routeMethod: "GET",
    routePattern: "/api/users",
    expectedMatched: false,
  },

  // ── Multiple params ──
  {
    name: "multiple params",
    requestMethod: "GET",
    requestPathname: "/api/users/42/posts/5",
    routeMethod: "GET",
    routePattern: "/api/users/:userId/posts/:postId",
    expectedMatched: true,
    expectedParams: { userId: "42", postId: "5" },
  },

  // ── Trailing slash normalization ──
  {
    name: "request trailing slash normalized",
    requestMethod: "GET",
    requestPathname: "/api/users/",
    routeMethod: "GET",
    routePattern: "/api/users",
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "pattern trailing slash normalized",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users/",
    expectedMatched: true,
    expectedParams: {},
  },

  // ── Root path ──
  {
    name: "root path match",
    requestMethod: "GET",
    requestPathname: "/",
    routeMethod: "GET",
    routePattern: "/",
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "empty path equals root",
    requestMethod: "GET",
    requestPathname: "",
    routeMethod: "GET",
    routePattern: "/",
    expectedMatched: true,
    expectedParams: {},
  },

  // ── Length mismatches ──
  {
    name: "pattern too short (extra segments in request)",
    requestMethod: "GET",
    requestPathname: "/api/users/42/extra",
    routeMethod: "GET",
    routePattern: "/api/users/:id",
    expectedMatched: false,
  },
  {
    name: "pattern too long (missing segments in request)",
    requestMethod: "GET",
    requestPathname: "/api/users/42",
    routeMethod: "GET",
    routePattern: "/api/users/:id/extra",
    expectedMatched: false,
  },

  // ── Wildcard edge cases ──
  {
    name: "wildcard with no extra segments",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users/*",
    expectedMatched: true,
    expectedParams: { "*": "" },
  },
  {
    name: "wildcard needs at least base path",
    requestMethod: "GET",
    requestPathname: "/api",
    routeMethod: "GET",
    routePattern: "/api/users/*",
    expectedMatched: false,
  },

  // ── Case-insensitive methods ──
  {
    name: "lowercase request method matches",
    requestMethod: "get",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "lowercase route method matches",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "get",
    routePattern: "/api/users",
    expectedMatched: true,
    expectedParams: {},
  },

  // ── Query param matching ──
  {
    name: "query param matches",
    requestMethod: "GET",
    requestPathname: "/api/search",
    routeMethod: "GET",
    routePattern: "/api/search",
    requestQuery: { q: "test" },
    matchQueryParams: { q: "test" },
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "query param mismatch rejects",
    requestMethod: "GET",
    requestPathname: "/api/search",
    routeMethod: "GET",
    routePattern: "/api/search",
    requestQuery: { q: "other" },
    matchQueryParams: { q: "test" },
    expectedMatched: false,
  },
  {
    name: "query param wildcard matches any value",
    requestMethod: "GET",
    requestPathname: "/api/search",
    routeMethod: "GET",
    routePattern: "/api/search",
    requestQuery: { q: "anything" },
    matchQueryParams: { q: "*" },
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "missing query param on request side rejects",
    requestMethod: "GET",
    requestPathname: "/api/search",
    routeMethod: "GET",
    routePattern: "/api/search",
    requestQuery: {},
    matchQueryParams: { q: "test" },
    expectedMatched: false,
  },

  // ── Header matching ──
  {
    name: "header matches (case-insensitive keys)",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    requestHeaders: { "X-Api-Key": "secret" },
    matchHeaders: { "x-api-key": "secret" },
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "header mismatch rejects",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    requestHeaders: { "x-api-key": "wrong" },
    matchHeaders: { "x-api-key": "secret" },
    expectedMatched: false,
  },
  {
    name: "header wildcard matches any value",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    requestHeaders: { "Authorization": "Bearer token123" },
    matchHeaders: { "Authorization": "*" },
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "missing header on request side rejects",
    requestMethod: "GET",
    requestPathname: "/api/users",
    routeMethod: "GET",
    routePattern: "/api/users",
    requestHeaders: {},
    matchHeaders: { "x-api-key": "secret" },
    expectedMatched: false,
  },
  {
    name: "multiple headers all must match",
    requestMethod: "GET",
    requestPathname: "/api/admin",
    routeMethod: "GET",
    routePattern: "/api/admin",
    requestHeaders: { "x-api-key": "secret", "x-role": "admin" },
    matchHeaders: { "x-api-key": "secret", "x-role": "admin" },
    expectedMatched: true,
    expectedParams: {},
  },
  {
    name: "multiple headers — one wrong rejects",
    requestMethod: "GET",
    requestPathname: "/api/admin",
    routeMethod: "GET",
    routePattern: "/api/admin",
    requestHeaders: { "x-api-key": "secret", "x-role": "user" },
    matchHeaders: { "x-api-key": "secret", "x-role": "admin" },
    expectedMatched: false,
  },
]

let passed = 0
let failed = 0

console.log("")
console.log("╔══════════════════════════════════════════════════════════════╗")
console.log("║  Mock Matcher — Cross-Language Validation                  ║")
console.log("╚══════════════════════════════════════════════════════════════╝")
console.log("")
console.log(`  Testing TypeScript: matchMockRoute() from lib/match-mock-path.ts`)
console.log(`  Test vectors: ${TEST_VECTORS.length}`)
console.log("")
console.log("  To validate Rust side:   cd src-tauri && cargo test")
console.log("")

for (const v of TEST_VECTORS) {
  const result = matchMockRoute(
    v.requestMethod,
    v.requestPathname,
    v.routeMethod,
    v.routePattern,
    v.requestQuery,
    v.requestHeaders,
    v.matchQueryParams,
    v.matchHeaders
  )

  const matchedOk = result.matched === v.expectedMatched
  const paramsOk = v.expectedMatched
    ? objectEquals(result.params, v.expectedParams ?? {})
    : true

  if (matchedOk && paramsOk) {
    passed++
  } else {
    failed++
    console.log(`  ✗ ${v.name}`)
    console.log(`      expected: matched=${v.expectedMatched}, params=${JSON.stringify(v.expectedParams)}`)
    console.log(`      actual:   matched=${result.matched}, params=${JSON.stringify(result.params)}`)
  }
}

console.log("")
console.log(`  ✓ ${passed} passed  ✗ ${failed} failed  (${passed + failed} total)`)
console.log("")

if (failed > 0) {
  process.exit(1)
}

// ── Helpers ──

function objectEquals(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => a[k] === b[k])
}
