import { describe, it, expect, beforeEach } from "vitest"
import {
  resolveMockMatch,
  pickMockVariant,
  ensureContentType,
  resetMockRateLimitCounters,
  type ResolveMockRoute,
} from "@/lib/mock-resolver"

function makeRoute(overrides: Partial<ResolveMockRoute> = {}): ResolveMockRoute {
  return {
    id: "r1",
    name: "Test route",
    method: "GET",
    pathPattern: "/api/users",
    responseStatus: 200,
    responseHeaders: {},
    responseBody: '{"ok":true}',
    contentType: "application/json",
    delay: 0,
    ...overrides,
  }
}

describe("resolveMockMatch", () => {
  beforeEach(() => {
    resetMockRateLimitCounters()
  })

  it("returns null when no route matches", () => {
    const result = resolveMockMatch([makeRoute()], {
      method: "GET",
      pathname: "/api/other",
    })
    expect(result).toBeNull()
  })

  it("resolves a matching route", () => {
    const result = resolveMockMatch([makeRoute()], {
      method: "GET",
      pathname: "/api/users",
    })
    expect(result?.status).toBe(200)
    expect(result?.body).toBe('{"ok":true}')
    expect(result?.headers["x-mock-route"]).toBeUndefined()
    expect(result?.rateLimited).toBe(false)
  })

  it("applies contentType when missing from response headers", () => {
    const result = resolveMockMatch(
      [makeRoute({ contentType: "application/json" })],
      { method: "GET", pathname: "/api/users" },
    )
    expect(result?.headers["Content-Type"]).toBe("application/json")
  })

  it("returns 429 when rate limit exceeded", () => {
    const route = makeRoute({
      rateLimit: { enabled: true, maxRequests: 2, windowSeconds: 60 },
    })
    const req = { method: "GET", pathname: "/api/users" }

    expect(resolveMockMatch([route], req)?.rateLimited).toBe(false)
    expect(resolveMockMatch([route], req)?.rateLimited).toBe(false)
    const limited = resolveMockMatch([route], req)
    expect(limited?.rateLimited).toBe(true)
    expect(limited?.status).toBe(429)
  })

  it("selects variant response when variants exist", () => {
    const route = makeRoute({
      variants: [
        {
          id: "v1",
          name: "Success",
          weight: 100,
          responseStatus: 201,
          responseHeaders: {},
          responseBody: '{"variant":true}',
          contentType: "application/json",
          delay: 0,
        },
      ],
    })
    const result = resolveMockMatch([route], { method: "GET", pathname: "/api/users" })
    expect(result?.status).toBe(201)
    expect(result?.variantId).toBe("v1")
  })

  it("matches query params and headers", () => {
    const route = makeRoute({
      pathPattern: "/api/search",
      matchQueryParams: { q: "test" },
      matchHeaders: { "x-api-key": "secret" },
    })
    const noMatch = resolveMockMatch([route], {
      method: "GET",
      pathname: "/api/search",
      query: { q: "wrong" },
      headers: { "x-api-key": "secret" },
    })
    expect(noMatch).toBeNull()

    const matched = resolveMockMatch([route], {
      method: "GET",
      pathname: "/api/search",
      query: { q: "test" },
      headers: { "x-api-key": "secret" },
    })
    expect(matched?.status).toBe(200)
  })
})

describe("ensureContentType", () => {
  it("adds Content-Type when absent", () => {
    expect(ensureContentType({}, "application/json")).toEqual({
      "Content-Type": "application/json",
    })
  })

  it("preserves existing Content-Type", () => {
    expect(
      ensureContentType({ "Content-Type": "text/plain" }, "application/json"),
    ).toEqual({ "Content-Type": "text/plain" })
  })
})

describe("pickMockVariant", () => {
  it("returns null for empty variants", () => {
    expect(pickMockVariant([])).toBeNull()
  })
})
