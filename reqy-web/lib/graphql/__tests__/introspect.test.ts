import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { introspectSchema, endpointHash, INTROSPECTION_QUERY_STRING } from "@/lib/graphql/introspect"

describe("introspectSchema", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it("POSTs introspection query", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { __schema: { queryType: { name: "Query" } } } }), { status: 200 })
    )
    await introspectSchema("https://api.example.com/graphql")
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/graphql", expect.objectContaining({
      body: JSON.stringify({ query: INTROSPECTION_QUERY_STRING }),
    }))
  })

  it("returns the JSON-stringified data field", async () => {
    const data = { __schema: { queryType: { name: "Query" } } }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data }), { status: 200 })
    )
    const sdl = await introspectSchema("https://x")
    expect(JSON.parse(sdl)).toEqual(data)
  })
})

describe("endpointHash", () => {
  it("produces stable hash for same endpoint", () => {
    expect(endpointHash("https://x")).toBe(endpointHash("https://x"))
  })

  it("produces different hashes for different endpoints", () => {
    expect(endpointHash("https://x")).not.toBe(endpointHash("https://y"))
  })

  it("starts with 'gql-' prefix", () => {
    expect(endpointHash("https://x")).toMatch(/^gql-/)
  })
})
