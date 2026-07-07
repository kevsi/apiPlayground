import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { executeRequest, executeGraphQL, isUrlAllowed, validateRequest } from "./runner.js"
import type { RequestItem } from "./types.js"

const mockFetch = vi.fn<typeof fetch>()

describe("isUrlAllowed", () => {
  it("blocks localhost by default", () => {
    expect(isUrlAllowed("http://localhost:3000/api").allowed).toBe(false)
  })

  it("blocks 127.0.0.1 by default", () => {
    expect(isUrlAllowed("http://127.0.0.1:3000/api").allowed).toBe(false)
  })

  it("blocks cloud metadata endpoint", () => {
    expect(isUrlAllowed("http://169.254.169.254/latest/meta-data/").allowed).toBe(false)
  })

  it("blocks private RFC1918 addresses", () => {
    expect(isUrlAllowed("http://10.0.0.1/api").allowed).toBe(false)
    expect(isUrlAllowed("http://192.168.1.1/api").allowed).toBe(false)
    expect(isUrlAllowed("http://172.16.0.1/api").allowed).toBe(false)
  })

  it("allows public addresses", () => {
    expect(isUrlAllowed("https://api.example.com/v1").allowed).toBe(true)
  })

  it("allows local hosts when explicitly enabled", () => {
    expect(isUrlAllowed("http://localhost:3000/api", true).allowed).toBe(true)
  })

  it("rejects non-http protocols", () => {
    expect(isUrlAllowed("file:///etc/passwd").allowed).toBe(false)
  })
})

describe("executeRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("blocks SSRF targets by default", async () => {
    const request: RequestItem = {
      id: "req-1",
      name: "Local",
      method: "GET",
      url: "http://localhost:3000",
      endpoint: "http://localhost:3000",
      createdAt: 1,
      updatedAt: 1,
    }
    const result = await executeRequest(request, { timeoutMs: 1000 })
    expect(result.passed).toBe(false)
    expect(result.statusText).toBe("Blocked")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("sends GET request and parses JSON response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    )

    const request: RequestItem = {
      id: "req-2",
      name: "Public",
      method: "GET",
      url: "https://api.example.com/v1",
      endpoint: "https://api.example.com/v1",
      createdAt: 1,
      updatedAt: 1,
    }

    const result = await executeRequest(request, { timeoutMs: 1000 })
    expect(result.passed).toBe(true)
    expect(result.status).toBe(200)
    expect(result.body).toBe('{"ok":true}')
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("routes GRAPHQL method to executeGraphQL", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"data":{"hello":"world"}}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    )

    const request: RequestItem = {
      id: "req-3",
      name: "GraphQL",
      method: "GRAPHQL",
      url: "https://api.example.com/graphql",
      endpoint: "https://api.example.com/graphql",
      body: "query { hello }",
      createdAt: 1,
      updatedAt: 1,
    }

    const result = await executeRequest(request, { timeoutMs: 1000 })
    expect(result.method).toBe("GRAPHQL")
    expect(result.passed).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/graphql",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("respects maxResponseSize", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("x".repeat(200), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    )

    const request: RequestItem = {
      id: "req-4",
      name: "Large",
      method: "GET",
      url: "https://api.example.com/large",
      endpoint: "https://api.example.com/large",
      createdAt: 1,
      updatedAt: 1,
    }

    const result = await executeRequest(request, { timeoutMs: 1000, maxResponseSize: 100 })
    expect(result.passed).toBe(false)
    expect(result.error).toContain("exceeds maximum")
  })
})

describe("executeGraphQL", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("blocks local endpoints by default", async () => {
    const result = await executeGraphQL("http://localhost:4000/graphql", "query { hello }")
    expect(result.passed).toBe(false)
    expect(result.statusText).toBe("Blocked")
  })

  it("posts GraphQL body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"data":{}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const result = await executeGraphQL(
      "https://api.example.com/graphql",
      "query GetUser($id: ID!) { user(id: $id) { name } }",
      { id: "1" },
      "GetUser",
    )

    expect(result.passed).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/graphql",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("GetUser"),
      }),
    )
  })
})

describe("validateRequest", () => {
  it("reports missing name and url", () => {
    const issues = validateRequest({})
    expect(issues.some((i) => i.field === "name" && i.severity === "error")).toBe(true)
    expect(issues.some((i) => i.field === "url" && i.severity === "error")).toBe(true)
  })

  it("reports invalid URL", () => {
    const issues = validateRequest({ name: "X", url: "not-a-url" })
    expect(issues.some((i) => i.field === "url")).toBe(true)
  })

  it("reports invalid JSON body warning", () => {
    const issues = validateRequest({ name: "X", url: "https://example.com", body: "{", bodyType: "json" })
    expect(issues.some((i) => i.field === "body" && i.severity === "warning")).toBe(true)
  })
})
