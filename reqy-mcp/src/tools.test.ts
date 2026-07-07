import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createToolHandler } from "./tools.js"
import { CollectionStore } from "./store.js"
import type { ExportBundle, RequestItem } from "./types.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

const mockFetch = vi.fn<typeof fetch>()

function getText(result: CallToolResult): string {
  const first = result.content[0]
  return first && first.type === "text" ? first.text : ""
}

describe("createToolHandler", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeStore() {
    const store = new CollectionStore()
    const collection = store.addCollection("Test")
    const request: RequestItem = {
      id: "req-1",
      name: "Get user",
      method: "GET",
      url: "https://api.example.com/users",
      endpoint: "https://api.example.com/users",
      createdAt: 1,
      updatedAt: 1,
    }
    store.addRequest(collection.id, request)
    return { store, collection, request }
  }

  function handler(store: CollectionStore, bundle?: ExportBundle) {
    return createToolHandler(store, bundle, {
      defaultTimeoutMs: 1000,
      maxBatchSize: 5,
      maxConcurrency: 2,
    })
  }

  it("lists collections", async () => {
    const { store } = makeStore()
    const result = await handler(store)("list_collections", {})
    expect(getText(result)).toContain("Test")
  })

  it("rejects invalid method on create_request", async () => {
    const { store, collection } = makeStore()
    const result = await handler(store)("create_request", {
      collection_id: collection.id,
      name: "Bad",
      method: "INVALID",
      url: "https://example.com",
    })
    expect(result.isError).toBe(true)
    expect(getText(result)).toContain("Invalid HTTP method")
  })

  it("creates a valid request", async () => {
    const { store, collection } = makeStore()
    const result = await handler(store)("create_request", {
      collection_id: collection.id,
      name: "New",
      method: "POST",
      url: "https://example.com",
    })
    expect(result.isError).toBeUndefined()
    expect(getText(result)).toContain("created")
  })

  it("runs a request with SSRF protection", async () => {
    const { store, collection } = makeStore()
    const localRequest: RequestItem = {
      id: "req-local",
      name: "Local",
      method: "GET",
      url: "http://localhost:3000/api",
      endpoint: "http://localhost:3000/api",
      createdAt: 1,
      updatedAt: 1,
    }
    store.addRequest(collection.id, localRequest)
    const result = await handler(store)("run_request", { request_id: localRequest.id })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(getText(result))
    expect(parsed.passed).toBe(false)
    expect(parsed.error).toContain("Private/local address blocked")
  })

  it("allows local hosts when configured", async () => {
    const { store, request } = makeStore()
    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const h = createToolHandler(store, undefined, {
      defaultTimeoutMs: 1000,
      allowLocalHosts: true,
    })
    const result = await h("run_request", { request_id: request.id })
    const parsed = JSON.parse(getText(result))
    expect(parsed.passed).toBe(true)
  })

  it("limits batch size", async () => {
    const { store } = makeStore()
    const result = await handler(store)("run_requests_batch", {
      request_ids: ["a", "b", "c", "d", "e", "f"],
    })
    expect(result.isError).toBe(true)
    expect(getText(result)).toContain("Batch size exceeds maximum")
  })

  it("imports environments from bundle", async () => {
    const store = new CollectionStore()
    const bundle: ExportBundle = {
      version: "1.0",
      collections: [],
      environments: [{ id: "env-1", name: "staging", variables: [{ key: "x", value: "y", enabled: true }] }],
    }
    const h = handler(store, bundle)
    const result = await h("import_bundle", {
      bundle_json: JSON.stringify(bundle),
    })
    expect(result.isError).toBeUndefined()
    expect(store.getEnvironment("staging")).toBeDefined()
  })
})
