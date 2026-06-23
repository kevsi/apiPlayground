import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { executeGraphQL } from "@/lib/graphql/execute"

describe("executeGraphQL", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it("POSTs to endpoint with query, variables, operationName", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { user: { id: "1" } } }), { status: 200 })
    )
    await executeGraphQL({
      endpoint: "https://api.example.com/graphql",
      query: "query GetUser($id: ID!) { user(id: $id) { id } }",
      variables: { id: "1" },
      operationName: "GetUser",
    })
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/graphql", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        query: "query GetUser($id: ID!) { user(id: $id) { id } }",
        variables: { id: "1" },
        operationName: "GetUser",
      }),
    }))
  })

  it("returns data on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { hello: "world" } }), { status: 200 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ hello }" })
    expect(result.data).toEqual({ hello: "world" })
    expect(result.errors).toBeUndefined()
  })

  it("returns errors array on GraphQL errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: null, errors: [{ message: "Not found" }] }), { status: 200 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ bad }" })
    expect(result.errors).toEqual([{ message: "Not found" }])
  })

  it("handles HTTP errors (non-2xx)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    )
    const result = await executeGraphQL({ endpoint: "https://x", query: "{ x }" })
    expect(result.statusCode).toBe(500)
  })

  it("merges custom headers with defaults", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      new Response("{}", { status: 200 })
    )
    await executeGraphQL({ endpoint: "https://x", query: "{ x }", headers: { Authorization: "Bearer abc" } })
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers.Authorization).toBe("Bearer abc")
  })
})
